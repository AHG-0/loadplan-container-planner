# LoadPlan — Research & From-Scratch Design
Senior project · July 2026 · companion to PROJECT_NOTES.md

This document restates the project as if starting from zero, then grounds every
design decision in (a) how the three reference systems work, (b) published
algorithms, and (c) measurable baseline data produced with our own engine.

---

## 1. The core idea, restated from scratch

**Input:** a transport unit (sea container, trailer, rail car, ULD) and a cargo
manifest (dimensions, weight, quantity, handling constraints).
**Output:** a physically loadable placement plan — where every piece goes, in
what order, obeying real-world constraints — plus metrics that let a human
trust or reject the plan.

Everything else (3D twin, modes, CSV, reports) exists to serve that sentence.
The differentiator vs academic packers is **loadability**: plans a real crew
can execute, with constraints real cargo has. The differentiator vs commercial
tools is **transparency**: every rule is visible, testable, and defensible.

### The two-layer rule system (settled, defense-ready)
- **Hard constraints — never traded off:** containment, non-overlap,
  support ratio ≥ 0.75, nothing-on-fragile, payload cap, orientation limits.
  A plan violating one is invalid, not "worse".
- **Soft objectives — user-selectable, weighted:** loadability (wall-building,
  no re-entry), compactness (block stowage), CoG position (low/centred),
  stability margin, grouping (destination / multi-drop LIFO).
  There is provably no single best weighting → it is a *mode choice*, exactly
  as commercial tools expose it.

---

## 2. What the three reference systems teach us

### DeepPack3D (MIT license, Python/TF — study the code, reuse ideas freely)
Repo: github.com/yptsang/DeepPack3D · Paper: Tsang et al., Computers in
Industry 164 (2025) 104202; SoftwareX package paper 2024.

What it actually does (read from source, not the README):
- **Maximal free spaces, not corner points.** Placing a box splits every free
  cuboid it intersects into up to 6 maximal sub-cuboids; fully-contained ones
  are pruned. Candidates always cover *every* reachable surface — including
  the tops our corner-point engine misses (our 4 rejected glassware in Easy
  mode are exactly this bug).
- **Height map** (2D grid of column heights) used as the RL state and for fast
  support queries.
- **Best-fit heuristics as baselines:** BAF (best area fit), BSSF (best short
  side fit), BLSF (best long side fit), BL (best lookahead) — all score how
  snugly an item fits a free space. Same "filter then score" shape as our engine.
- **k-item lookahead buffer** ("conveyor"): choose which of the next k items
  to place, not just where. Cheap non-greedy improvement we can copy.
- **Online problem framing** (items arrive on a conveyor, robotic palletizing).
  Our problem is *offline* (full manifest known) — we can sort; it cannot.
  Say this in the report when comparing.
- No fragile flag, no support-ratio hard constraint, no weight/CoG model in
  the packing itself → our constraint layer is genuinely richer (their gap,
  our contribution).

**Adopt:** maximal-space candidate generation (fixes Easy-mode rejects);
k-lookahead; their heuristics as extra baselines in the benchmark chapter;
optionally their RL model behind a FastAPI backend as "Engine B".

### EasyCargo (commercial, ~$67–79/mo, free trial + 1-yr education license)
Per-item constraint toggles (non-stackable, no-tilt, do-not-rotate, shift to
mass centre), non-stackable groups, "virtual wall" separators, up to 50
priority groups, unload-destination ordering, weight distribution over 2–3
axles, shareable plans, Excel/ERP import. Scale target: 10,000 items / 250 types.

**Adopt:** per-item constraint flags (teammate's file already has the right
schema), priority groups, axle-load view for road mode, virtual-wall
separation as a future rule. Their per-item toggles == our hard-constraint
switches; their load styles == our modes. Validates the architecture.

### CubeMaster (commercial, multimodal: truck/container/pallet/rail/ULD)
Two-stage optimization: cartons → pallets (palletizing rules), then pallets →
vehicle. Stacking rules, orientation limits, max layers, destination grouping,
load/unload sequences, mixed-SKU pallet building.

**Adopt (concept):** the two-stage pipeline is our roadmap's "master-carton
consolidation" formalized: Stage 1 cartonize/palletize small items, Stage 2
load the units. Big report-friendly feature; medium build cost.

### Teammate's HTML (tested headlessly, his demo data)
Geometry clean (0 overlaps, fragile respected) but the shelf/row packer
strands floor space: 65/90 loaded at 24.1% utilization; destination grouping
off → 80/90. Diagnosis: rows consume the depth of their longest stack, no
back-filling, rejects while floor is mostly empty.
**Adopt:** his cargo schema (stackable / rotatable / upright_only / priority /
destination / max_stack_weight), 6-orientation logic gated by flags, robust
CSV parser (quoted cells, `;` support, header aliases), JSON/CSV plan export,
UX: mode cards, validation panel, summary chips, progress overlay.
**Replace:** his packing core with our engine.

---

## 3. Clean-room architecture (what we build toward)

```
┌────────────┐  ┌──────────────────────────────┐  ┌───────────────┐
│ Input layer │→│ Constraint engine (hard rules)│→│ Solver layer   │
│ CSV/manual  │  │ containment/overlap/support/ │  │ A: our best-fit│
│ presets     │  │ fragile/payload/orientation  │  │ B: + maximal   │
└────────────┘  └──────────────────────────────┘  │    spaces      │
                                                   │ C: GA ordering │
┌────────────────────┐  ┌───────────────────┐     │ D: DeepPack3D  │
│ Presentation layer  │←│ Plan model         │←────│    (RL, API)   │
│ 3D twin·manifest·   │  │ placements+order+ │     └───────────────┘
│ metrics·report·efile│  │ metrics (JSON)    │
└────────────────────┘  └───────────────────┘
```

Key property: solvers are swappable behind one interface
(`pack(container, items, mode) → plan`); the constraint engine and tests are
shared, so every solver obeys identical physics — that is what makes the
comparison chapter (heuristic vs GA vs RL) scientifically clean.

### Solver roadmap (in build order)
1. **A (done):** corner-point best-fit, 3 modes, all hard constraints. Baseline.
2. **B (next, fixes known bug):** replace corner points with maximal free
   spaces + keep our scoring. Expect Easy mode 134/134 and higher BR numbers.
3. **C:** GA / local search over *item order* (and orientation choice), fitness
   = solver-B result under the active mode. This is the teammate's proposal
   slot and the "intelligent" part of the title. Cheap: solver B is <350ms,
   so hundreds of GA evaluations are feasible in-browser with a Web Worker.
4. **D:** DeepPack3D RL via local FastAPI ("Engine" dropdown) + offline Colab
   benchmark on identical CSVs. Comparative results chapter.

---

## 4. Data: benchmark + realistic + stress (built, in /datasets)

- **BR-style instances** (`br_style_BR*_seed*.csv`, 18 files): generated with
  the published Bischoff–Ratcliff procedure (container 587×233×220 cm, box
  dims U[30–120]×[25–100]×[20–80] cm, total volume ≈ container volume),
  heterogeneity ladder 3→20 types (BR1→BR7 analogue), 3 seeds each,
  reproducible. Exact OR-Library files (thpack1–9 / br.zip) are download-
  blocked in this sandbox but downloadable manually from
  people.brunel.ac.uk/~mastjjb/jeb/orlib/thpackinfo.html —
  `thpack_to_csv.py` (included) converts them the moment you have them.
- **Realistic sets:** `realistic_ecommerce.csv` (many small parcels),
  `realistic_industrial.csv` (EUR-pallet loads, crates), from standard
  logistics dimensions (EUR pallet 120×80, ISO pallet 121.9×101.6 cm).
- **Stress set:** `stress_fragile.csv` (30% fragile) — the constraint-killer.

### Baseline results (engine v3, full table in baseline_results.csv)
- BR-style utilization: **58–80%** depending on heterogeneity and mode; fill
  mode usually best, as theory predicts.
- Published best-known on real BR1–BR7 (tree search / GRASP): ~87–93%.
  → our greedy is honestly ~10–20 pts behind SOTA: this *is* the motivation
  for solvers B and C, with our own measured evidence.
- Realistic e-commerce: ~55% (many small boxes, weak walls) — motivates
  cartonization (CubeMaster stage-1).
- Fragile stress: 136/136 in all modes (constraint system works).
- Max solve time 324 ms for 365 pieces → GA-on-top is computationally viable.

### Evaluation protocol (for the report)
Fixed datasets, all engines, identical constraint layer. Metrics: volume
utilization, pieces placed, rejects by reason, CoG offset, solve time, and a
loadability score (re-entry count, wall completeness). 3 seeds per class →
mean ± range. Every engine change reruns the suite (it is one Node command).

---

## 5. Standards data (container/pallet/ULD reference)

Already in presets: 20ft (590×235×239, 28,200 kg), 40ft (1203×235×239),
40HC (1203×235×269), EU semi-trailer 13.6m (1362×248×270, 24,000 kg),
box truck, rail boxcar, LD3/AKE, PMC. To add from research:
- **Pallets:** EUR/EPAL 120×80 cm; ISO/US 121.9×101.6 cm; half-pallet 80×60.
  Needed for the palletizing stage.
- **ULD contours:** LD3 is not a cuboid (lower-deck angled base). Model as
  cuboid minus corner prism — a "forbidden region" list per preset is the
  clean implementation (future).
- **Axle rules (road):** EU C1 rule-of-thumb — steer axle ≤7.5t, drive ≤11.5t,
  tri-axle trailer ≤24t; CoG must sit so per-axle shares stay legal.
  Implement as a metrics warning first (not a hard constraint) — same
  approach EasyCargo takes with its axle-load view.

---

## 6. UX plan (v0.4 → v1)

From teammate + EasyCargo patterns, in priority order:
1. Per-item constraint flags in the cargo table: stackable, rotatable,
   upright-only, max stack weight (schema exists in his file).
2. Mode descriptions strip (done in v3) → extend into a "why rejected" panel
   with per-piece reason detail (both reference tools do this well).
3. This-side-up: honor upright_only in orientations (engine) + up-arrow
   decal on box faces in the 3D twin (small three.js texture).
4. Destination grouping + multi-drop LIFO ordering (teammate has the field;
   EasyCargo/CubeMaster both ship it).
5. Plan export: JSON + placement CSV (steal teammate's implementation) and a
   printable step-sheet for loaders.
6. Axle-load bar for road mode (metrics-level).
7. Visual redesign pass last — function is still ahead of form.

---

## 7. Risks / honest limitations (say these in the defense)

- Greedy heuristics are 10–20 pts below SOTA on BR-style data (measured);
  GA (C) and maximal spaces (B) are the mitigation, RL (D) the comparison.
- BR-style ≠ exact BR: same procedure, different draws. Convert the real
  files when downloaded; expect similar numbers.
- Support model is area-ratio only (no load-bearing strength per box yet;
  max_stack_weight fields exist in the schema, rule not yet enforced).
- ULD contours approximated as cuboids; axle rules advisory only.
- py3dbp benchmark favors us on constraints (it enforces none) — present it
  as "placement rate parity under stricter physics", not superiority.
