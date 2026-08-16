# How the Cargo Loading System Works
A guide for the team · engine v0.4

This explains what the software does, which algorithms it uses, how each one
works, and how we measure it. Read it before modifying the code.

---

## 1. The problem we are solving

Given a container (length, width, height, payload limit) and a list of cargo
items (dimensions, weight, handling rules), decide where every item goes so that
the arrangement is **physically loadable** and uses the space well.

This is the **Container Loading Problem**, a constrained version of the
**3D Bin Packing Problem**. It is **NP-hard**: with *n* items there are n!
possible orderings (for 30 items, about 2.65 × 10³²), up to 6 orientations each,
and a continuous range of positions. No algorithm finds the guaranteed best
answer in reasonable time, so we use **heuristics** — fast methods that give good
answers with no optimality guarantee — and we measure how good they are.

Our version is **offline**: the whole cargo list is known up front, so we are
allowed to re-order it before packing. That matters, because ordering is one of
the most powerful levers we have.

---

## 2. Structure of the code

Everything lives in one HTML file. There are three parts:

- **UI layer** — cargo table, container presets, mode dropdown.
- **Engine** — a single function, `pack(cont, rows, mode, opts)`. All the logic.
- **Display** — `renderCargo()` draws 3D boxes, `refreshManifest()` prints the
  loading steps, `computeMetrics()` computes the percentages.

The engine never touches the screen and the display never does any packing math.
That separation is deliberate: it is why our test suite can run the engine
headlessly in Node with no browser.

**What `pack()` returns:**

```js
{
  placed: [ {name, x, y, z, l, w, h, kg, fragile, dest, step}, ... ],
  unfit:  [ {name, reason: "no space" | "no stable support" |
                          "stack weight limit" | "weight limit"}, ... ],
  cont, totalKg
}
// Axes: x = along the container length (toward the door), y = height, z = width
```

Any replacement engine that returns this shape can be dropped in without
touching the UI.

---

## 3. What happens when you click "Pack cargo"

1. Read the container preset and the cargo table.
2. Validate — drop items under 2 cm or larger than the container interior.
3. Call `pack()`.
4. Hand the result to the 3D view, the manifest list, and the metrics panel.

Inside `pack()`:

1. **Expand and sort** the items (§4.1)
2. **Loop over items**, and for each one:
   - generate candidate positions (§4.2, §4.3)
   - filter them against the hard constraints (§5)
   - score the survivors and take the best (§4.4)
   - update the free-space list
3. **Repair pass** if any fragile item was rejected (§4.5)
4. **Produce the loading order** (§4.6)

---

## 4. The algorithms

### 4.1 First-Fit Decreasing — the ordering rule

**In general.** The classic packing heuristic: sort items biggest-first, then
place each one where it fits. Big items are inflexible — they only fit in a few
places — while small items fit almost anywhere. If small items go first they
scatter and fragment the space, and the big ones no longer fit. Think of filling
a jar: rocks, then pebbles, then sand. Sand first and the rocks never fit.
In 1D bin packing this rule is provably within about 22% of optimal.

**In our code.** We sort by decreasing volume, but three constraint-driven rules
come first:

```
1. Destination group  – later delivery stops packed first, so they end up
                        deepest (LIFO: first stop unloads first)
2. Fragile last       – nothing may rest on fragile items, so placing them
                        early creates unusable dead space above them
3. Priority (5→1)     – must-ship items get first refusal
4. Volume, then weight, descending          ← the FFD part
```

Rule 2 came from a real measured failure: 17 cartons were being rejected while
empty air sat above fragile glassware. Moving fragile to the end fixed it.

### 4.2 Maximal free spaces — where we are allowed to look

**In general.** We cannot test every possible position, because space is
continuous. So we track empty volume as a list of **maximal empty boxes** — boxes
that cannot be stretched further without hitting something. When an item is
placed, every free box it overlaps is cut into up to **six** leftover slabs (one
per side), and any slab entirely inside another is discarded.

The slabs overlap each other. That is intentional — the list describes *where
emptiness is*, not a tidy division of it.

**Why we use it.** The representation is **complete**: any region big enough to
hold an item is guaranteed to appear in the list. Our earlier version tracked
corner *points* instead, which was incomplete — a flat surface formed between
several boxes could end up with no candidate point on it, so the engine was blind
to it. That was a real bug: fragile items were rejected while empty supported
surfaces were clearly visible in the 3D view. Switching representations gained
about 4 percentage points of utilisation.

In the code: the list is `spaces`, and `splitSpaces()` does the cutting.

### 4.3 Extreme points — where exactly inside that space

**In general.** When an item is placed, project its corners onto the surfaces of
nearby items to create candidate positions that "snap" to real supporting
surfaces (Crainic, Perboli & Tadei, 2008).

**Why we need it.** A maximal free space is a box of *air*, and part of it can
hang over a gap. If we only tested the space's own corner, an item could land
half over nothing and fail the support check. Snapping to the corner of the box
underneath lets it sit fully supported. This is what allows fragile items to
land properly on top of stacks.

In the code: `anchorsOf()`.

### 4.4 Best-fit selection with multi-objective scoring

**In general.** Two ways to choose among candidate positions:
- **First-fit** — take the first one that works. Fast, but the result depends
  entirely on the order you happen to check.
- **Best-fit** — score every valid position, take the highest.

When several goals conflict, combine them into one number with a weighted sum,
`score = w₁·f₁ + w₂·f₂ + …`, with every term normalised to 0–1 so the weights
are comparable.

**In our code.** The architecture is **filter, then score**. Hard constraints
throw out illegal positions; survivors are scored on seven terms:

| Term | Meaning |
|---|---|
| `sup` | base support ratio (tighter contact = more stable) |
| `low` | closeness to the floor (low centre of gravity) |
| `deep` | closeness to the far wall (wall-building, easier loading) |
| `ctr` | centring across the width (axle balance) |
| `fTop` | fragile prefers height |
| `snug` | tightness of fit to the free space |
| `grow` | **penalty** for extending the used container length |

The three modes are simply three weight vectors (see `const W` at the top of
`pack()`). **This is the safest place to experiment.**

We switched from first-fit to best-fit because first-fit *cannot express a
preference* such as "fragile should seek the highest well-supported surface" —
which was the direct cause of fragile items being mishandled.

### 4.5 Fragile headroom reservation — the repair pass

Because fragile items are sorted last, a dense mode can legitimately stack
ordinary cargo to the ceiling and leave no shelf for them. So: if any fragile
item is rejected, repack **once** with non-fragile stacking capped below the
height the fragile items need, then keep whichever plan placed more items.

Bounded at 2× one solve, only triggers on failure, and cannot make the result
worse. It took the reference case from 129–131/134 to **134/134 in all modes**.

### 4.6 Topological sort — the loading sequence

**In general.** Orders the nodes of a directed acyclic graph so that every
prerequisite comes before whatever depends on it. Same algorithm used by build
systems and course prerequisites. Runs in O(V+E).

**In our code.** Boxes form a "rests-on" graph. We repeatedly emit a box whose
supports have all already been emitted, preferring deepest → lowest → leftmost.

Without this, sorting by position alone produced an animation showing boxes
floating in mid-air before their supports existed — another real bug we fixed.
This is what makes the manifest something a crew can actually follow.

---

## 5. Constraints — the two-layer model

This split is the core design idea of the project.

**Hard constraints — never traded off.** A plan violating any of these is
*invalid*, not just worse. They are applied as a filter, before any scoring:

1. **Containment** — item entirely inside the container
2. **Non-overlap** — no two items share space
3. **Support ≥ 75%** — of the item's base, on the floor or on box tops
4. **Nothing on fragile** — fragile items bear no load
5. **Stack load limit** — weight above an item ≤ its capacity, propagated
   *transitively* down the whole support chain
6. **Payload cap** — total weight within the vehicle limit
7. **Orientation rules** — yaw only, 6-way, or fixed ("this side up")

**Soft objectives — the user's choice.** The seven scoring terms in §4.4. They
genuinely conflict (density vs ease of loading vs weight balance), so there is no
universally correct weighting — which is exactly why it is exposed as a mode
instead of hard-coded.

---

## 6. Metrics

**Validation (is the plan legal?)** — `pack_test.js` extracts the engine and
**independently recomputes** the physics from the output coordinates; it never
trusts the engine's own internal state. It asserts: bounds, no overlap, support
ratio, nothing on fragile, stack load, loading order, payload, orientation, and
LIFO ordering. All currently pass in all three modes.

**Evaluation (how good is the legal plan?)**

| Metric | How it is computed |
|---|---|
| Volume utilisation | Σ(item volumes) / container volume |
| Loaded ratio | items placed / items submitted |
| Rejection breakdown | counted by reason during the loop |
| Weight utilisation | Σ weight / payload cap |
| CoG offset | weighted centroid vs geometric centre, as % |
| Solve time | milliseconds |

**One subtlety that matters.** Volume utilisation is **arrangement-invariant**:
for a fixed set of placed items, moving them around does not change the
percentage. So "Max Fill" does not mean "raise the number by rearranging" — it
means **compactness** (minimise the used footprint, leaving one clean empty
zone), which is what real block stowage does. Utilisation only rises by placing
*more items*.

Current results across 21 test instances: mean utilisation 72.1% (Easy Load),
74.3% (Max Fill), 74.0% (Balanced); maximum solve time 53 ms.

---

## 7. Running it

```bash
node pack_test.js cargo_load_planner_v3.html   # regression suite
node benchmark.js                              # full benchmark → datasets/baseline_results.csv
```

The app itself needs no install — open the HTML file in a browser.

---

## 8. Rules for modifying the engine

1. **Every new packing rule ships with a new assertion in `pack_test.js`.**
   This is how every regression so far was caught.
2. Start with the weight vectors (`const W`) — that is the low-risk, high-value
   place to experiment.
3. Re-run the benchmark after any engine change so we can see the effect in
   numbers rather than opinions.
4. Known limitation, stated openly: this is a constructive heuristic and sits
   roughly 10–15 points below published state-of-the-art results on standard
   benchmark instances. A search stage over item orderings is the obvious next
   improvement and is not yet built.

---

## 9. Likely questions and how to answer them

Short answers. If you can give these in your own words, you understand the system.

**Is your solution optimal?**
No, and it cannot be guaranteed optimal in reasonable time — the problem is
NP-hard. We use constructive heuristics and measure the gap to published results
(we are ~10–15 points below). Closing that gap is the next stage.

**Why is the problem hard?**
The search space is combinatorial: n! orderings, up to 6 orientations per item,
and a continuous range of positions. For 30 items the orderings alone number
about 2.65 × 10³².

**Why sort largest-first?**
Large items are inflexible and fit in few places; small items fit almost
anywhere. Small-first fragments the space so large items no longer fit. Rocks,
then pebbles, then sand.

**Why fragile last?**
Nothing may rest on fragile items, so placing them early creates dead columns of
unusable air above them. We measured this: 17 cartons were rejected until we
moved fragile to the end of the sequence.

**Why maximal free spaces instead of corner points?**
Corner points are an incomplete candidate set — usable surfaces between placed
boxes can end up with no candidate on them, so the engine cannot see them. We hit
exactly that bug. Maximal spaces are complete; switching gained ~4 points.

**What is the difference between first-fit and best-fit?**
First-fit takes the first feasible position; best-fit scores all feasible
positions and takes the highest. First-fit cannot express a preference, such as
"fragile should go on the highest well-supported surface" — which is why we
switched.

**How do you handle conflicting objectives?**
They form a trade-off curve (a Pareto front); no single weighting is universally
correct. We use a weighted sum of normalised terms and expose three weight
vectors as user-selectable modes.

**How do you know the output is correct?**
Invariant-based regression testing. The test harness independently recomputes the
physics from the output coordinates — bounds, overlap, support, fragile, stack
load, sequence, payload, orientation, LIFO — rather than trusting the engine's
own bookkeeping. Every new rule ships with a new assertion.

**Why is utilisation only ~74%?**
Two reasons. It is a constructive heuristic, ~10–15 points below state of the
art. And utilisation is arrangement-invariant, so some instances are inherently
capped — a small shipment in a large trailer cannot score high no matter how
well it is packed. Utilisation rises only by placing more items.

**What does "loadability" mean and why does it matter?**
That a real crew can execute the plan: build from the far end toward the door so
nobody climbs over placed cargo; never require a box before its support exists;
unload multi-drop cargo in LIFO order. A mathematically dense plan that cannot be
physically built is useless.

**What would you improve next?**
A search stage over item orderings, using the current engine as the decoder and
its score as the fitness function. It is practical because one solve takes about
50 ms, so hundreds of evaluations fit in an interactive budget.
