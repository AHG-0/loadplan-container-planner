# LoadPlan — Algorithms, Validation & Team Handoff
Senior project · container load planning with a 3D digital twin
Engine version v0.4 · document date July 2026

This is the technical reference for teammates and the source material for the
written proposal. It states exactly which algorithms are implemented, why they
were chosen, how the system is validated, and what the measured results are.

---

## 1. Handoff — files and how to run

| File | What it is |
|---|---|
| `cargo_load_planner_v3.html` | **The application.** Single self-contained HTML file (header says v0.4). Open by double-clicking; no server, no install. Three.js r128 is the only external dependency, loaded from cdnjs. |
| `pack_test.js` | Headless regression suite. `node pack_test.js cargo_load_planner_v3.html` |
| `benchmark.js` | Benchmark runner over all datasets, all modes. `node benchmark.js` → writes `datasets/baseline_results.csv` |
| `datasets/` | 21 test instances (CSV) + `thpack_to_csv.py` converter + results |
| `RESEARCH_AND_DESIGN.md` | Competitive study (DeepPack3D / EasyCargo / CubeMaster), architecture, roadmap |
| `ALGORITHMS_AND_VALIDATION.md` | This document |

**Requirements to modify:** any text editor + Node.js (only for the tests; the
app itself needs no toolchain). All logic lives in one `<script>` block.

**Where to work inside the HTML:**

- `function pack(cont, rows, mode, opts)` — the entire packing engine. Everything
  algorithmic is here. **Rule: every change to this function ships with a new
  assertion in `pack_test.js`.**
- `const W = {...}` at the top of `pack()` — the objective weight vectors (the
  three modes). Safe, high-value place to experiment.
- `computeMetrics(plan)` — metric definitions.
- `renderCargo(n)` / `buildContainer(cont)` — 3D view.
- `importCsv(text)` + `HEADER_ALIASES` — CSV ingestion.
- `PRESETS` — container/vehicle library.

**Engine contract (stable API):**

```js
pack(container, rows, mode, opts) -> {
  placed:  [ {name, pieceNo, x, y, z, l, w, h, kg, fragile, dest, step, color}, ... ],
  unfit:   [ {..., reason:"no space"|"no stable support"|"stack weight limit"|"weight limit"} ],
  cont, totalKg
}
// container : {L, W, H, maxKg}          cm / kg
// rows      : [{name,l,w,h,kg,qty,fragile,stackable,tip,maxLoad,pri,dest,color}]
// mode      : "easy" | "fill" | "balanced"
// opts      : {groupDest:boolean}
// Axes: x = along container length (toward the door), y = height, z = width.
```

Any alternative solver that honours this contract (GA, RL service, teammate's
engine) can be dropped in behind an engine selector without touching the UI.

---

## 2. Problem statement

Given a rigid rectangular loading space of dimensions L×W×H with payload cap
`maxKg`, and a set of rectangular items each with dimensions, weight and
handling attributes, find placements (position + orientation) for as many items
as possible that are **physically loadable**, maximising an operator-chosen
objective while never violating safety constraints.

This is the **three-dimensional container loading problem (CLP)**, a
constrained variant of the 3D bin-packing problem (3D-BPP). It is **NP-hard**
(Martello, Pisinger & Vigo 2000), so exact optimisation is intractable at
realistic sizes; we use constructive heuristics and report the gap to
best-known results honestly.

Our variant is **offline** (the full manifest is known in advance, so items may
be re-ordered) and **single-container** in the current version. DeepPack3D, by
contrast, solves the **online** variant (items arrive on a conveyor); this
difference must be stated in any comparison.

---

## 3. Constraint model — the central design decision

Constraints are split into two layers. This separation is the project's main
conceptual contribution and should be argued explicitly in the proposal.

### 3.1 Hard constraints — never traded off
A plan violating any of these is **invalid**, not merely worse.

| # | Constraint | Implementation |
|---|---|---|
| H1 | Containment — item fully inside the loading space | free-space fit test |
| H2 | Non-overlap — no two items share volume | guaranteed by maximal-space bookkeeping; independently re-verified in tests |
| H3 | Support ≥ 75 % — base area resting on floor or item tops | `supportersAt()` area ratio |
| H4 | Nothing rests on fragile | `supportersAt()` returns −1 if any supporter is fragile |
| H5 | Stack-load limit — weight above an item ≤ its `maxLoad` | transitive propagation down the support chain |
| H6 | Payload cap — Σ weight ≤ `maxKg` | running total |
| H7 | Orientation rules — yaw only, 6-way, or fixed (`this side up`) | `orientationsOf()` gated by `rot` / `tip` flags |

The 75 % support threshold follows the stability treatment used in
constraint-aware open-source packers (e.g. `jerry800416/3D-bin-packing`) and is
a tunable constant, not a magic number. Note that `dwave-examples/3d-bin-packing`
openly documents having *no* support constraint — a useful gap citation.

### 3.2 Soft objectives — user-selectable, weighted
There is **no single correct weighting**: density, loadability and axle balance
genuinely conflict. We therefore expose the trade-off as a **mode**, exactly as
commercial tools do (EasyCargo load settings, CubeMaster loading rules).

| Term | Meaning |
|---|---|
| `sup` | base support ratio (tighter contact = more stable) |
| `low` | proximity to the floor (low centre of gravity) |
| `deep` | proximity to the far wall (wall-building loadability) |
| `ctr` | lateral centring across the width (axle balance) |
| `fTop` | fragile-prefers-height (keeps stackable floor free) |
| `snug` | tightness of fit to the free space (BSSF-style) |
| `grow` | **penalty** for extending the used container length (block stowage) |

Implemented weight vectors:

```
mode      sup   low   deep  ctr   fTop  snug  grow
easy      0.30  0.15  0.45  0.10  0.60  0.15  0.00   loadability first
fill      0.35  0.20  0.05  0.05  0.50  0.25  0.60   compact block
balanced  0.25  0.30  0.10  0.30  0.50  0.15  0.80   low, centred CoG
```

**Important interpretation note for the report:** volume utilisation is
*arrangement-invariant* — for a fixed set of placed items, spreading them out
or stacking them tight yields the identical percentage. "Max fill" therefore
cannot mean "raise the percentage by rearranging"; it means **compactness**
(minimise the used footprint, leaving one contiguous free zone), which is what
real block stowage does and what the `grow` penalty encodes.

---

## 4. Algorithms implemented

### 4.1 Item ordering (constructive sequence)
Lexicographic sort, in precedence order:

1. **Destination group** (when multi-drop grouping is enabled) — later drops
   packed first so they end up deepest: **LIFO** unloading.
2. **Fragile last** — nothing may rest on fragile items, so placing them early
   creates dead columns. (Discovered empirically: 17 cartons were rejected while
   air sat above fragile glassware; fragile-last fixed it.)
3. **Priority descending** (1–5) — must-ship items get first refusal.
4. **Volume descending, then weight descending** — the classic
   **First-Fit-Decreasing** rationale: large items first, small items fill gaps.

### 4.2 Candidate position generation — maximal free spaces + extreme-point anchors
The engine maintains a list of **maximal empty cuboids**. Placing an item splits
every intersecting free space into up to six maximal sub-cuboids; spaces fully
contained in another are pruned. This is the *difference process* / maximal-space
representation used in the CLP literature (Lai & Chan; Parreño et al.) and is the
representation used by **DeepPack3D** (MIT-licensed; `binpacker.py`).

**Why we migrated to it:** the previous version used bare corner points
(spawning three candidates per placement). Flat surfaces between already-placed
boxes could end up with *no candidate point at all*, so usable tops were
invisible to the engine — reproducibly rejecting fragile items that clearly fit.

Within each free space we additionally test **anchors snapped to supporting
surfaces** (extreme-point style, Crainic, Perboli & Tadei 2008): the space
origin plus, at the space's base height, the corners of every item whose top
lies at that height. This matters because a maximal space may overhang air; the
snapped anchor lets an item sit fully on a box top and pass the H3 support test.

Two exact prunes keep this affordable:
- free spaces smaller than the item's minimum dimension on any axis are skipped;
- once the space list grows large, spaces too small for **any remaining** item
  are dropped, using a suffix-minimum over the pending sequence.

### 4.3 Placement selection — best-fit, not first-fit
Every candidate (free space × anchor × orientation) is first **filtered** by the
hard constraints H1–H5, then **scored** by the active mode's weighted objective;
the maximum wins, ties broken deterministically by (x, y, z).

This replaced a first-fit rule that returned the first legal position. First-fit
cannot express preferences such as *fragile should seek the highest
well-supported surface*, which is precisely why fragile items were being
rejected. Best-fit scoring is the same mechanism DeepPack3D's heuristic
baselines use (BAF / BSSF / BLSF).

### 4.4 Fragile headroom reservation (repair heuristic)
Because fragile items are sequenced last, a dense mode can legitimately stack
non-fragile cargo to the ceiling, leaving no shelf for them. If any fragile item
is rejected, the engine **repacks once** with non-fragile stacking capped at
`H − (tallest rejected fragile height)`, reserving top surfaces, and keeps
whichever plan places more items (ties broken by volume). It is a bounded,
single-retry repair — cost is at most 2× a solve — and it fires only when
needed. Measured effect: all three modes went from 129–131/134 to **134/134** on
the reference instance, and mean benchmark utilisation rose ≈ 3.5 points.

### 4.5 Loading sequence — topological order over the support graph
Items form a *rests-on* DAG. The manifest is produced by repeatedly emitting an
item whose supporters are all already emitted, preferring deepest → lowest →
leftmost. This guarantees the step-by-step animation never shows a floating box
and that the printed sequence is executable by a real crew.

### 4.6 Complexity
Let *n* be items and *s* the free-space count. Each placement scores
O(s × anchors × orientations) candidates and splitting is O(s); support queries
are O(1)-bucketed by top height. Worst case is roughly O(n·s), with *s* kept
small by the pruning rules. Measured: **≤ 53 ms** for the benchmark instances
(≤ 365 pieces) and ≈ 25 s for a 3 500-piece stress import.

---

## 5. Validation

### 5.1 Correctness — invariant testing (`pack_test.js`)
The suite extracts `pack()` from the HTML and **independently recomputes** the
physics — it never trusts the engine's own bookkeeping. For every mode it
asserts:

| Check | Assertion |
|---|---|
| Bounds | every item inside the container |
| Overlap | no pair of items intersects (pairwise) |
| Support | recomputed base support ≥ 75 % |
| Fragile | no item rests on a fragile item |
| Stack load | recomputed transitive load ≤ each item's `maxLoad` |
| Sequence | every supporter has a strictly lower step number |
| Payload | Σ weight ≤ container cap |
| Orientation | items with tipping disabled keep their original height |
| Multi-drop | mean x of the first-unload group exceeds that of later groups (LIFO) |

Current status: **all checks pass in all three modes.**

### 5.2 Performance metrics (definitions)
- **Volume utilisation** = Σ(placed item volumes) / container volume × 100.
  *Arrangement-invariant* (see §3.2).
- **Placement rate** = items placed / items submitted.
- **Rejection breakdown** by reason: `no space`, `no stable support`,
  `stack weight limit`, `weight limit` — diagnostic, not just a count.
- **Weight utilisation** = Σ weight / payload cap.
- **CoG offset** = weighted centroid displacement from the geometric centre,
  reported as % of length and % of width (axle-balance proxy).
- **Solve time** (ms), single-threaded.
- **Loadability** (qualitative in v0.4): wall completeness and absence of
  re-entry, inspected via the step-by-step manifest.

### 5.3 Test data (`datasets/`, 21 instances)
- **18 BR-style instances** generated with the Bischoff & Ratcliff (1995)
  procedure: container 587×233×220 cm, dimensions drawn U[30–120]×[25–100]×
  [20–80] cm, total item volume ≈ container volume, heterogeneity ladder 3→20
  item types, 3 seeds each, fully reproducible.
  *Caveat:* these follow the published *procedure* but are not the original
  files. The genuine OR-Library sets (`thpack1–9`, `br.zip`) must be downloaded
  manually from OR-Library; `datasets/thpack_to_csv.py` converts them directly.
- **2 realistic sets:** e-commerce parcels; palletised industrial (EUR pallet
  120×80 cm, ISO 121.9×101.6 cm dimensions).
- **1 stress set:** 30 % fragile — the constraint-killer scenario.
- Also validated on an external **Kaggle e-commerce cargo dataset** (3 500 rows,
  25 columns incl. IoT telemetry) to prove the importer handles real third-party
  schemas: unknown columns ignored, IDs de-duplicated, identical rows aggregated.

### 5.4 Comparative baseline
`py3dbp` (open source) on the identical reference instance: **134/134 placed,
73.8 % utilisation, 0.8 s**. Our engine also places 134/134 at comparable
utilisation in ≈ 0.05 s — **while enforcing support, fragile, stack-load and
orientation constraints that py3dbp does not implement at all.**
Frame this as *parity under stricter physics*, never as raw superiority.

### 5.5 Results (v0.4, 21 datasets, full table in `datasets/baseline_results.csv`)

| Mode | Mean volume utilisation | Max solve time |
|---|---|---|
| Easy load | 72.1 % | 53 ms |
| Max fill | 74.3 % | 42 ms |
| Balanced | 74.0 % | 32 ms |

Progression across this development cycle (same datasets, same metric):

| Engine stage | Mean util (fill) |
|---|---|
| Corner-point, first-fit | 67.0 % |
| + maximal free spaces + anchors | 70.8 % |
| + fragile headroom reservation (v0.4) | **74.3 %** |

Selected instances (fill mode): BR2\_seed1 83.5 %, BR3\_seed3 82.7 %,
BR7\_seed1 80.8 %, realistic\_ecommerce 365/365 items at 57.8 %,
stress\_fragile 136/136 at 44.0 %.

### 5.6 Threats to validity — state these openly
1. Published best-known results on the *genuine* BR instances are ≈ 87–93 %
   (tree search, GRASP, hybrid metaheuristics). Our constructive heuristic is
   therefore ~10–15 points behind the state of the art. This gap is the
   motivation for the GA/local-search stage, not a defect to hide.
2. BR-style ≠ BR: same generator procedure, different random draws.
3. Low utilisation on some sets is a property of the instance (e-commerce
   parcels are small and awkward; the fragile stress set caps out by
   construction), not necessarily of the algorithm.
4. Support is modelled as contact-area ratio only; no material strength model
   beyond the per-item `maxLoad` cap.
5. ULD shapes are approximated as cuboids; axle-load limits are not yet enforced.
6. Single container only; multi-container splitting is future work.

---

## 6. Proposal roadmap (what is claimed as future work)

1. **GA / local search over item ordering** (the teammate's proposal area).
   Fitness = the current solver's result under the active mode. Feasible because
   a solve is ~50 ms, allowing hundreds of evaluations; run in a Web Worker to
   keep the UI responsive.
2. **DeepPack3D (RL) as a second engine** behind the same contract, via a local
   FastAPI service, plus an offline benchmark on identical CSV instances →
   a heuristic vs metaheuristic vs RL comparison chapter.
3. **Two-stage cartonisation/palletisation** (CubeMaster's model): consolidate
   small items into master cartons/pallets, then load the units.
4. Axle-load rules for road/rail; contoured ULD geometry; multi-container
   splitting; printable loader step-sheet.

**Positioning statement.** The contribution is not "another bin packer". It is a
*constraint-rich, loadability-aware, comparative* load planner with a digital-twin
interface: a shared, independently-tested constraint layer under interchangeable
solvers, so that heuristic, metaheuristic and learned policies can be compared
under identical physics — which published comparisons rarely do.

---

## 7. References

- Martello, S., Pisinger, D. & Vigo, D. (2000). The three-dimensional bin packing problem. *Operations Research* 48(2).
- Bischoff, E. E. & Ratcliff, M. S. W. (1995). Issues in the development of approaches to container loading. *OMEGA* 23(4), 377–390. (BR instances; OR-Library `thpack1–9`.)
- Crainic, T. G., Perboli, G. & Tadei, R. (2008). Extreme point-based heuristics for three-dimensional bin packing. *INFORMS Journal on Computing* 20(3).
- Bischoff, E. E. & Marriott, M. D. (1990). A comparative evaluation of heuristics for container loading. *European Journal of Operational Research* 44(2). (Wall-building.)
- Tsang, Y. P., Mo, D. Y., Chung, K. T. & Lee, C. K. M. (2025). A deep reinforcement learning approach for online and concurrent 3D bin packing optimisation with bin replacement strategies. *Computers in Industry* 164, 104202. (DeepPack3D; MIT-licensed: `github.com/yptsang/DeepPack3D`.)
- OR-Library, container loading test data: `people.brunel.ac.uk/~mastjjb/jeb/orlib/thpackinfo.html`
- Open-source comparators: `enzoruiz/py3dbp`, `jerry800416/3D-bin-packing` (support ratio), `dwave-examples/3d-bin-packing` (documents absent support constraint).
- Commercial reference systems: EasyCargo (`easycargo3d.com`), CubeMaster / Logen Solutions (`logensolutions.com`).
