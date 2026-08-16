# Technical Study Guide — Algorithms, Constraints, Metrics & KPIs
LoadPlan · container load planning with 3D digital twin
For the proposal's technical section **and** for defense preparation.

**How to use this document.** Each algorithm is explained twice: first
**"In general"** (the textbook concept — this is what you'll be questioned on),
then **"In our project"** (how we applied it). If you only memorise one thing per
algorithm, memorise the *general* part; the project part follows from it.

---

# PART 0 — The problem, in one page

## What kind of problem is this?

Our problem is the **Container Loading Problem (CLP)**, a constrained form of the
**Three-Dimensional Bin Packing Problem (3D-BPP)**.

**Definition.** Given a set of rectangular items, each with dimensions
(l, w, h) and weight, and a container of dimensions (L, W, H) with a payload
limit, decide a position (x, y, z) and orientation for each item such that items
lie inside the container, do not overlap, and satisfy additional physical rules —
maximising an objective, usually the volume packed.

## Why is it hard? (NP-hardness — expect this question)

3D-BPP is **NP-hard**. Practically this means: no known algorithm finds the
*guaranteed optimal* answer in time that scales reasonably with problem size,
and the search space explodes combinatorially.

**Give them the intuition, not just the label:** with *n* items, the number of
orderings alone is n! — for just 30 items that is about 2.65 × 10³². Each item
also has up to 6 orientations and a continuum of positions. Even at a billion
evaluations per second, exhaustive search is astronomically infeasible.

**The correct conclusion (say this openly):** we do not claim optimality. We use
**heuristics** — methods that find good solutions quickly with no optimality
guarantee — and we *measure* how far we are from the best-known results.
Admitting this is a strength in a defense; claiming optimality would be a red flag.

## Two important classifications

**Offline vs online.**
- *Offline*: the full list of items is known in advance, so you may sort and
  re-order them. **Ours is offline.**
- *Online*: items arrive one at a time (e.g. on a conveyor) and must be placed
  immediately without knowing the future. DeepPack3D solves the *online* problem.
- Offline is easier, because ordering is a powerful lever. Always state this when
  comparing our results to online systems — otherwise the comparison is unfair.

**Knapsack-type vs bin-packing-type.**
- *Knapsack (single container, maximise value packed)*: one container, choose the
  best subset to load. **This is our current version.**
- *Bin packing (minimise number of containers)*: load everything using as few
  containers as possible. This is our multi-container future work.

---

# PART 1 — ALGORITHMS

## 1.1 Constructive heuristics (the family our engine belongs to)

**In general.** A *constructive* heuristic builds a solution incrementally: take
items one at a time in some order and place each one according to a rule, never
undoing earlier decisions. Compare with *improvement* heuristics (start from a
complete solution and modify it, e.g. local search) and *exact* methods (branch
and bound, integer programming — guaranteed optimal but exponential).

A constructive heuristic always has **two decisions**:
1. **Which item next?** → the *ordering rule*
2. **Where to put it?** → the *placement rule* (candidate generation + selection)

Almost every packing heuristic in the literature is a different combination of
those two. This framing is very useful in a defense — it lets you classify any
algorithm they name at you.

**Properties.** Fast (typically polynomial), simple, deterministic, but *greedy*:
an early decision that looks good can trap the solution in a poor region. Greedy
means locally optimal choices, no backtracking.

**In our project.** Our engine is constructive. Ordering = constraint-aware
First-Fit-Decreasing (§1.2). Placement = maximal free spaces (§1.4) + extreme
point anchors (§1.5), selected by best-fit scoring (§1.6).

---

## 1.2 First-Fit Decreasing (FFD) — the ordering rule

**In general.** FFD is the classic bin-packing heuristic:
1. **Sort items in decreasing order of size.**
2. Place each item into the *first* position/bin where it fits.

**Why "decreasing" matters — the key insight.** Large items are inflexible: they
only fit in a few places. Small items are flexible: they fit almost anywhere. If
you place small items first they scatter and fragment the space, leaving no
region big enough for the large items. Placing large items first, then filling
the gaps with small ones, wastes far less space.

**Analogy for the defense:** filling a jar with rocks, pebbles and sand. Rocks
first, then pebbles fill the gaps, then sand fills what remains. Sand first and
the rocks never fit.

**Known quality (1D bin packing).** FFD uses at most **11/9 · OPT + 6/9** bins —
i.e. within ~22 % of optimal in the worst case. This is a famous result
(Dósa's tight bound). It's a strong thing to cite: it shows a simple greedy rule
has a *provable* guarantee in the 1D case, though no such clean bound exists in
3D with our extra constraints.

**In our project.** We sort by decreasing volume (weight breaks ties), but
constraint-driven criteria take precedence:

```
1. Destination group (multi-drop: later drops first → they end up deepest)
2. Fragile last          (nothing may rest on fragile → placing them early
                          creates unusable "dead columns" above them)
3. Priority descending   (must-ship items get first refusal)
4. Volume descending, then weight descending   ← the FFD part
```

**Defense-ready evidence for the "fragile last" rule:** in testing, 17 cartons
were rejected while empty air sat above fragile glassware. Moving fragile to the
end of the sequence fixed it. This is a real measured result from our own project.

---

## 1.3 Corner points — the simplest candidate generation

**In general.** You cannot test every possible (x, y, z) — the space is
continuous. So packing algorithms only consider a finite set of **candidate
positions**. The classic argument: in an optimal packing you can always push
every item down/back/left until it touches something, so only positions touching
existing items or walls need to be considered.

The **corner point** method: when you place an item, generate three new candidate
points at the corners it creates — *on top of it*, *beside it*, and *in front of
it*. Maintain a list of these points; to place the next item, test the points.

**Weakness (this is why we replaced it).** The candidate set is *incomplete*.
A flat surface formed *between* several already-placed boxes may have **no
candidate point on it at all**, because the point that would have covered it was
consumed or pruned. The algorithm becomes blind to usable space.

**In our project.** This was our v0.1–v0.3 engine. It produced a reproducible
bug: fragile glassware was rejected for "no space" while the 3D view clearly
showed empty, flat, supported surfaces. That bug is what motivated the migration
to maximal free spaces — a good "we diagnosed and fixed it" story for the defense.

---

## 1.4 Maximal free spaces (the difference process) — our candidate generation

**In general.** Instead of tracking *points*, track **empty volumes**. The
container's free space is represented as a list of **maximal empty cuboids** — a
cuboid is *maximal* if it cannot be extended in any direction without hitting an
item or a wall.

The update rule when an item is placed (the **difference process**):
1. Find every free cuboid that intersects the newly placed item.
2. **Split** each into up to **six** sub-cuboids — the slabs left over on the
   −x, +x, −y, +y, −z, +z sides of the item.
3. **Prune** any resulting cuboid entirely contained inside another (redundant).

Note the sub-cuboids **overlap each other** — that is intentional and correct.
They describe *where空 space is*, not a partition of it.

**Why it's better than corner points.** The representation is *complete*: every
region large enough to hold an item is guaranteed to appear as (or inside) some
maximal cuboid. Nothing usable becomes invisible.

**Cost.** The free-space list can grow; each placement is O(s) to split plus
O(s²) worst case to prune (pairwise containment checks). Managing *s* is the
main engineering concern.

**Literature.** Known as the maximal-space or difference-process representation
(Lai & Chan; Parreño et al.). It is also the representation used by
**DeepPack3D** (MIT licence) — we studied their `binpacker.py` and adopted the
approach.

**In our project.** Migrating from corner points to maximal spaces raised mean
volume utilisation across our 21 benchmark instances from **67.0 % → 70.8 %**
and eliminated the invisible-surface bug. We keep the space list small with two
*exact* prunes (they never discard a usable position):
- skip free spaces smaller than the item's smallest dimension on any axis;
- periodically drop spaces too small for **any remaining item**, using a
  suffix-minimum over the pending sequence.

---

## 1.5 Extreme points — refining candidate positions

**In general.** Extreme points (Crainic, Perboli & Tadei, 2008) extend the corner
idea: when an item is placed, you *project* its corners along the axes onto the
surfaces of other already-placed items, generating additional candidate positions
that "snap" to real supporting surfaces. This captures positions that pure corner
points miss.

**In our project.** We combine both representations. Inside each maximal free
space we test not only its origin corner but also **anchors snapped to supporting
surfaces**: at the space's base height, the corners of every item whose top lies
at that height.

**Why this is necessary (good detail to know).** A maximal free space is a box of
*air* — part of it may hang over a gap. If we only tested the space's origin
corner, an item could land half over empty air and fail the 75 % support test.
Snapping the anchor to a real box top lets the item sit fully supported. This is
what allows fragile items to sit properly on stack tops.

---

## 1.6 First-fit vs best-fit — the selection rule

**In general.** Once you have candidate positions, how do you choose?

- **First-fit**: take the *first* candidate that is feasible. Fast; quality
  depends entirely on the order you happen to examine candidates.
- **Best-fit**: evaluate *all* feasible candidates with a scoring function and
  take the best. Slower (linear in candidates) but far more controllable.

Classic best-fit scores in the packing literature (these are DeepPack3D's
heuristic baselines, worth naming):
- **BAF** — Best Area Fit: minimise leftover surface area.
- **BSSF** — Best Short Side Fit: minimise the smallest leftover gap.
- **BLSF** — Best Long Side Fit: minimise the largest leftover gap.

The general principle is "leave the least useless space behind."

**In our project.** We converted from first-fit to best-fit. The architecture is
**filter, then score**:

```
for each candidate (free space × anchor × orientation):
      FILTER: reject if it violates ANY hard constraint  (H1–H5, see Part 2)
      SCORE : compute weighted soft-objective score
   choose the highest-scoring survivor  (ties broken deterministically by x,y,z)
```

**Why this mattered concretely.** First-fit *cannot express a preference* such as
"a fragile item should seek the highest well-supported surface" — it just takes
whatever comes first. That inability was the direct cause of fragile items being
rejected. Best-fit made the preference expressible. We include a `snug` term in
our score, which is BSSF-style tightness of fit.

---

## 1.7 Multi-objective scoring (weighted-sum scalarization)

**In general.** When several objectives conflict (here: density vs ease of
loading vs weight balance), there is **no single best solution** — there is a
*Pareto front* of trade-offs. A solution is *Pareto-optimal* if you cannot
improve one objective without worsening another.

The simplest way to pick a point on that front is **weighted-sum
scalarization**: convert the objectives into one number,

&nbsp;&nbsp;&nbsp;&nbsp;`score = w₁·f₁ + w₂·f₂ + ... + wₙ·fₙ`

Each `fᵢ` must be **normalised** (typically to 0–1) so the weights are
comparable — otherwise a term measured in centimetres would swamp a ratio.
Different weight vectors trace out different points on the Pareto front.

**Known limitation (a likely question):** weighted-sum cannot reach points on a
*non-convex* region of the Pareto front. Alternatives: ε-constraint method,
lexicographic ordering, or true multi-objective evolutionary algorithms
(e.g. NSPGA-II). We accept this limitation because our weights are user-facing
presets, not an attempt to enumerate the whole front.

**In our project.** The weights are exposed to the user as three **modes**. This
mirrors how commercial tools behave (EasyCargo load settings, CubeMaster loading
rules) — good validation that the design is realistic:

| Term | Meaning (all normalised 0–1) |
|---|---|
| `sup` | base support ratio — tighter contact, more stable |
| `low` | closeness to the floor — low centre of gravity |
| `deep` | closeness to the far wall — wall-building loadability |
| `ctr` | lateral centring — axle balance |
| `fTop` | fragile-prefers-height — keeps stackable floor free |
| `snug` | tightness of fit to the free space (BSSF-style) |
| `grow` | **penalty** for extending the used container length (block stowage) |

| Mode | sup | low | deep | ctr | fTop | snug | grow | Intent |
|---|---|---|---|---|---|---|---|---|
| Easy load | 0.30 | 0.15 | 0.45 | 0.10 | 0.60 | 0.15 | 0.00 | loadability first |
| Max fill | 0.35 | 0.20 | 0.05 | 0.05 | 0.50 | 0.25 | 0.60 | compact block |
| Balanced | 0.25 | 0.30 | 0.10 | 0.30 | 0.50 | 0.15 | 0.80 | low, centred CoG |

---

## 1.8 Repair heuristics — our fragile headroom reservation

**In general.** A *repair* (or *restart with reservation*) heuristic detects a
specific failure mode in a completed solution and re-runs the construction with
an added restriction that prevents it. It is a bounded, targeted second attempt —
not a full search. Related to *look-back* strategies and to reserving capacity in
scheduling problems.

**The failure it fixes.** Because fragile items are sequenced *last*, a dense
mode can legitimately stack ordinary cargo to the ceiling, leaving no shelf for
the fragile items — so they get rejected or dumped on the floor by the door.

**How ours works.**
1. Pack normally.
2. If any *fragile* item was rejected, re-pack **once**, this time forbidding
   non-fragile items from being placed above a height cap of
   `H − (height of the tallest rejected fragile item)`, reserving the top region.
3. Keep whichever of the two plans places **more items** (ties → higher volume).

**Why it's defensible.** Cost is bounded at 2× a single solve; it triggers only
when needed; and it can never make the result worse, because we keep the better
of the two plans. Measured effect: the reference instance went from 129–131/134
to **134/134 in all three modes**, and mean benchmark utilisation rose from
70.8 % → **74.3 %**.

---

## 1.9 Topological sorting — generating the loading sequence

**In general.** A **topological sort** orders the vertices of a *directed acyclic
graph* (DAG) so that every edge points forwards — i.e. every prerequisite comes
before the thing that depends on it. Standard algorithms: **Kahn's algorithm**
(repeatedly emit a vertex with in-degree zero) and DFS-based post-order. Runs in
**O(V + E)**. Classic uses: build systems, task scheduling, course prerequisites.

**In our project.** Items form a *rests-on* DAG: an edge from A to B means "B
rests on A", so A must be loaded first. We repeatedly emit an item whose
supporters have all already been emitted (Kahn-style), preferring
deepest → lowest → leftmost among those currently available.

**Why this is not optional.** Sorting placements by position alone produced a
loading animation showing **boxes floating in mid-air** before their supports
existed — a real bug we found and fixed. Topological ordering guarantees the
printed sequence is physically executable by a real crew. This is a strong,
concrete example of the "loadability" contribution.

---

## 1.10 Algorithms we did NOT use — be ready to justify

Examiners often ask "why not X?". Short, confident answers:

**Exact methods (Integer Linear Programming, branch and bound).**
Guarantee optimality but exponential in the worst case; intractable for hundreds
of items with our constraint set, and cannot run interactively in a browser.
Appropriate for small instances or to compute reference bounds.

**Genetic Algorithm (GA).** A population-based metaheuristic inspired by natural
selection: encode a solution as a chromosome, evaluate fitness, then apply
*selection*, *crossover* (combine two parents) and *mutation* over generations.
For packing, the usual encoding is the **item permutation**, decoded by a
constructive heuristic — so the GA searches *orderings* while the heuristic
handles geometry. **This is our planned next stage** (and a teammate's proposal
area). It is feasible because one solve takes ~50 ms, allowing hundreds of
evaluations.

**Simulated annealing / local search.** Improvement metaheuristics: perturb a
solution (e.g. swap two items in the order) and accept worse solutions with a
probability that decreases over time, escaping local optima. Cheaper than a GA;
a natural companion to it.

**Reinforcement learning (DeepPack3D).** An agent learns a placement *policy* by
trial and error, maximising cumulative reward (packed volume). State is typically
a **height map** of the container; actions are placements. Strong for the
**online** problem where you cannot re-order items. Planned as a comparison
engine, not the primary solver — and note it does **not** enforce our fragile,
support-ratio or stack-load constraints.

---

# PART 2 — CONSTRAINTS

The two-layer split is the project's main conceptual contribution. **Lead with
it** in the proposal.

## 2.1 Hard constraints — never traded off

A plan violating any of these is **invalid**, not merely "worse". They are
enforced as a *filter*, before any scoring.

| # | Constraint | Meaning | How enforced |
|---|---|---|---|
| H1 | **Containment** | item entirely inside the container | free-space fit test |
| H2 | **Non-overlap** | no two items share volume | guaranteed by maximal-space bookkeeping |
| H3 | **Support ≥ 75 %** | base area resting on the floor or item tops | contact-area ratio |
| H4 | **Nothing on fragile** | fragile items bear no load | supporter check returns −1 |
| H5 | **Stack-load limit** | weight above an item ≤ its rated capacity | transitive propagation down the support chain |
| H6 | **Payload cap** | Σ weight ≤ container limit | running total |
| H7 | **Orientation rules** | yaw-only / 6-way / fixed ("this side up") | gated by per-item flags |

**Notes worth knowing.**
- The **75 % threshold** is a tunable constant, not a magic number; the same
  approach appears in constraint-aware open-source packers
  (`jerry800416/3D-bin-packing`). By contrast `dwave-examples/3d-bin-packing`
  documents having *no* support constraint — a useful citation for the gap we fill.
- **H5 is transitive**: placing a box adds its weight to *every* box beneath it in
  the support chain, not just the one directly below. That is what makes it a real
  crush-protection rule.
- **Orientation**: rotating about the vertical axis (yaw) is usually allowed;
  tipping an item onto its side is only allowed if the item permits it. "This side
  up" is a real handling requirement, so it is a *hard* constraint, not a preference.

## 2.2 Constraint taxonomy (useful vocabulary for the write-up)

Academic surveys classify CLP constraints roughly as:
- **Geometric** — containment, non-overlap (H1, H2)
- **Stability** — support, no floating items (H3); *static* stability = the load
  stands still; *dynamic* stability = it survives transport acceleration
- **Load-bearing / fragility** — crush limits (H4, H5)
- **Weight limits & distribution** — payload cap, centre of gravity, axle loads (H6)
- **Orientation / handling** — this-side-up, tipping rules (H7)
- **Operational / grouping** — multi-drop unloading order, destination grouping,
  priority

Saying "our constraint set covers geometric, stability, load-bearing, weight and
handling categories" is a strong, well-framed sentence for the proposal.

## 2.3 Soft objectives — the user's choice

These are the *scored* preferences from §1.7 (density, loadability, CoG,
stability margin, grouping). **The key argument:** because they genuinely
conflict, no single weighting is universally correct — so the choice is exposed
to the operator as a mode rather than hard-coded. Commercial tools do exactly
this, which validates the design.

## 2.4 Multi-drop / LIFO (an operational constraint worth explaining)

If a truck serves stops A then B, the cargo for **A must be unloaded first**, so
it must be loaded **last** (nearest the door). Loading is **LIFO** — last in,
first out. In our engine this is implemented in the *ordering* rule: later
destinations are packed first so they end up deepest. Verified by a test
asserting the mean x-position of group A exceeds that of group B.

---

# PART 3 — VALIDATION METRICS (correctness: "is the plan legal?")

**Keep this distinction clear in the proposal — examiners like it:**
- **Validation metrics** answer *"is this plan physically valid?"* → pass/fail.
- **KPIs** (Part 4) answer *"how good is this valid plan?"* → a number to optimise.

A plan can score 90 % utilisation and still be **invalid** (floating boxes,
crushed fragile cargo). Validity is checked first; only valid plans are scored.

## 3.1 Method: invariant testing

We use **invariant-based regression testing**. An *invariant* is a property that
must hold for **every** output, on every input, forever. The test harness
extracts the packing function from the HTML and **independently recomputes the
physics from the output coordinates** — it never trusts the engine's own
internal bookkeeping. This is essential: a test that reuses the engine's data
structures would happily confirm the engine's own bugs.

## 3.2 The invariants checked

| Check | Assertion |
|---|---|
| Bounds | every item lies inside the container |
| Overlap | no pair of items intersects (pairwise test) |
| Support | recomputed contact-area ratio ≥ 75 % |
| Fragile | no item rests on a fragile item |
| Stack load | recomputed transitive load ≤ each item's capacity |
| Sequence | every supporter has a strictly lower step number (no floating boxes) |
| Payload | Σ weight ≤ container cap |
| Orientation | items with tipping disabled keep their original height |
| Multi-drop | first-unload group sits nearer the door (LIFO) |

Current status: **all checks pass in all three modes.**

## 3.3 Working rule (state this as project methodology)

> **Every new packing rule ships with a new regression assertion.**

This is how each regression was caught during development, including one found
from a user screenshot. It shows engineering discipline, which is itself worth
marks.

---

# PART 4 — KPIs (performance: "how good is the plan?")

## 4.1 The KPI definitions

| KPI | Formula | Interpretation |
|---|---|---|
| **Volume utilisation** | Σ(item volumes) / container volume × 100 | the primary academic metric; comparable to published results |
| **Placement rate** | items placed / items submitted | operational: did the shipment fit? |
| **Rejection breakdown** | count by reason | *diagnostic*: `no space`, `no stable support`, `stack weight limit`, `weight limit` |
| **Weight utilisation** | Σ weight / payload cap | detects weight-limited (vs volume-limited) loads |
| **CoG offset** | weighted centroid displacement from geometric centre, as % of length/width | safety & axle-balance proxy |
| **Solve time** | milliseconds, single-threaded | interactivity; also determines whether a GA on top is affordable |
| **Loadability** | wall completeness, re-entry count | our differentiator; qualitative in v0.4 |

**The rejection breakdown is worth highlighting.** Most tools report only "N
rejected". Reporting *why* each item was rejected is a genuine usability and
diagnostic contribution — and it is what let us find our own bugs.

## 4.2 The subtlety examiners may probe: utilisation is arrangement-invariant

**For a fixed set of placed items, volume utilisation does not change if you
rearrange them.** Spread them thinly along the floor or stack them in a tight
block — the ratio is identical, because the numerator (item volume) and
denominator (container volume) are both unchanged.

**Consequences:**
- "Max fill" cannot mean "raise the percentage by rearranging". It means
  **compactness**: minimise the *used footprint*, leaving one contiguous free
  zone — which is what real **block stowage** does. That is why the mode carries
  a `grow` penalty on extending the used length.
- Utilisation only rises by **placing more items**.
- A low utilisation figure may be a property of the *instance* (e.g. a small
  shipment in a big trailer), not a failure of the algorithm.

Being able to explain this cleanly is a strong signal of understanding.

## 4.3 Our measured results (all reproducible via `node benchmark.js`)

**Current performance — 21 datasets:**

| Mode | Mean volume utilisation | Max solve time |
|---|---|---|
| Easy load | 72.1 % | 53 ms |
| Max fill | 74.3 % | 42 ms |
| Balanced | 74.0 % | 32 ms |

**Improvement across development (same datasets, same metric) — this is the
evidence that the algorithmic choices mattered:**

| Engine stage | Mean utilisation (fill mode) |
|---|---|
| Corner points + first-fit | 67.0 % |
| + maximal free spaces + extreme-point anchors | 70.8 % |
| + fragile headroom reservation (v0.4) | **74.3 %** |

**Comparative baseline.** `py3dbp` (open source) on the identical instance:
134/134 items, 73.8 % utilisation, 0.8 s. Our engine also places 134/134 at
comparable utilisation in ~0.05 s — **while enforcing support, fragile,
stack-load and orientation constraints that py3dbp does not implement**.
Always phrase this as *parity under stricter physics*, never as raw superiority.

## 4.4 Test data (state the provenance honestly)

- **18 BR-style instances** generated with the Bischoff & Ratcliff (1995)
  procedure: container 587×233×220 cm, dimensions drawn uniformly, total item
  volume ≈ container volume, heterogeneity ladder 3→20 item types, 3 seeds each,
  reproducible. **Caveat to state:** these follow the published *procedure* but
  are not the original OR-Library files (a converter is included for those).
- **2 realistic sets** — e-commerce parcels; palletised industrial (EUR pallet
  120×80 cm, ISO 121.9×101.6 cm).
- **1 stress set** — 30 % fragile, to exercise the constraint system.
- **External validation** — a Kaggle e-commerce cargo dataset (3 500 rows, 25
  columns including IoT telemetry) imported successfully, proving the importer
  handles real third-party schemas.

## 4.5 Threats to validity — say these before you're asked

1. Published best-known results on the *genuine* BR instances are **≈ 87–93 %**
   (tree search, GRASP, hybrid metaheuristics). Our constructive heuristic is
   ~10–15 points behind the state of the art. **This gap is the motivation for
   the GA stage — present it as the roadmap, not as a defect.**
2. BR-style ≠ BR: same generator procedure, different random draws.
3. Support is modelled as contact-area ratio only; no material strength model
   beyond the per-item capacity.
4. ULD shapes are approximated as cuboids; axle-load limits are not yet enforced.
5. Single container only; multi-container splitting is future work.
6. Loadability is currently assessed qualitatively rather than as a single score.

---

# PART 5 — LIKELY DEFENSE QUESTIONS

**Q: Is your solution optimal?**
No — and it cannot be guaranteed optimal in reasonable time, because 3D bin
packing is NP-hard. We use constructive heuristics and *measure* the gap to
best-known results (we are ~10–15 points below on BR-style instances). Closing
that gap with a genetic algorithm over item orderings is the next stage.

**Q: Why is bin packing NP-hard?**
The search space is combinatorial: n! orderings, up to 6 orientations per item,
and a continuum of positions. For 30 items the orderings alone number ~2.65×10³².
No known polynomial-time algorithm guarantees the optimum.

**Q: Why sort largest-first?**
Large items are inflexible and fit in few places; small items fit almost
anywhere. Small-first fragments the space so large items no longer fit. Rocks,
then pebbles, then sand. In 1D this rule (FFD) is provably within 11/9 of optimal.

**Q: Why maximal free spaces instead of corner points?**
Corner points are an *incomplete* candidate set — usable surfaces between placed
boxes can end up with no candidate on them, making them invisible to the
algorithm. We hit exactly that bug: fragile items were rejected while empty
supported surfaces were visible in the 3D view. Maximal spaces are complete;
switching gained ~4 points of utilisation.

**Q: What's the difference between first-fit and best-fit? Why did you switch?**
First-fit takes the first feasible position; best-fit scores all feasible
positions and takes the highest. First-fit cannot express a *preference*, such as
"fragile should go on the highest well-supported surface" — which is precisely
why fragile items were mishandled. Best-fit made the preference expressible.

**Q: How do you handle conflicting objectives?**
They form a Pareto front — there's no universally best trade-off. We use
weighted-sum scalarization with normalised terms, and expose three weight vectors
as user-facing modes. Commercial tools (EasyCargo, CubeMaster) do the same.
Limitation: weighted sums cannot reach non-convex regions of the front.

**Q: How do you know the plans are correct?**
Invariant-based regression testing. A headless harness independently recomputes
the physics from the output coordinates — bounds, overlap, support, fragile,
stack load, sequence, payload, orientation, LIFO — never trusting the engine's
own bookkeeping. Every new rule ships with a new assertion.

**Q: Why is your utilisation only ~74 %?**
Two reasons. First, it's a constructive heuristic, ~10–15 points below
metaheuristic state of the art — that's the measured motivation for the GA stage.
Second, some instances are inherently limited: a small shipment in a large
trailer caps utilisation regardless of algorithm, because utilisation is
arrangement-invariant and only rises by placing *more* items.

**Q: How is this different from existing commercial software?**
Two ways. *Transparency*: every rule is visible, testable and documented, and we
report *why* each item was rejected. *Comparative architecture*: solvers are
interchangeable behind one interface with a shared, independently-tested
constraint layer — so heuristic, metaheuristic and learned policies can be
compared under identical physics, which published comparisons rarely do.

**Q: Why not use DeepPack3D directly?**
It solves the *online* problem (items arrive one at a time, no re-ordering) and
targets robotic palletising. Ours is *offline*, so ordering is a major lever it
cannot use. More importantly it implements no fragile rule, no support-ratio
constraint and no stack-load model — exactly the constraints that make a plan
loadable in practice. We plan to use it as a comparison engine.

**Q: What does "loadability" mean and why does it matter?**
That a real crew can actually execute the plan: build walls from the far end
toward the door so nobody re-enters behind placed cargo; never require a box to
be placed before its support exists; unload multi-drop cargo in LIFO order. A
mathematically dense plan that a worker cannot physically build is useless.

---

## One-paragraph summary (usable as the proposal's opening)

> LoadPlan solves the three-dimensional container loading problem, an NP-hard
> optimisation problem, using a constructive best-fit heuristic over a maximal
> free-space representation with extreme-point anchors. Item ordering follows a
> constraint-aware First-Fit-Decreasing rule; placement candidates are filtered
> by seven hard physical constraints — containment, non-overlap, 75 % support,
> no-load-on-fragile, transitive stack-load limits, payload cap and per-item
> orientation rules — then scored by a weighted multi-objective function whose
> weights are exposed to the operator as three loading modes. The loading
> sequence is produced by topological sorting over the support graph, guaranteeing
> a physically executable plan. Correctness is enforced by invariant-based
> regression testing that independently recomputes the physics of every output,
> and performance is measured on 21 benchmark instances by volume utilisation,
> placement rate, diagnostic rejection reasons, centre-of-gravity offset and
> solve time.
