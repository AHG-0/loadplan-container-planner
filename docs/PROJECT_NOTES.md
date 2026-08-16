# SP Project Notes — Cargo Load Planner (Digital Twin)

Last updated: **August 2026 — engine v0.6f, THE APP IS NOW
`cargo_load_planner_v5.html`** (the teammate's tabbed UI merged with our engine;
`_v4.html` is superseded, history only). This file is the context handoff for all
chats in this project. Read it fully before answering anything. Later sections
(Landscape / Is-this-AI / Limitations register / Open threads) were added from the
"Crate placement feedback" chat and carry the competitor, AI-framing, and
next-steps context — do not lose them.

**Shipped since v0.4:** multi-container `planShipment` with four selectable
container-selection strategies (fewest / max load / lowest cost / as listed) ·
editable container fleet with counts, costs and drag-reorder · fleet CSV import
(m2's file works as delivered) · per-container 3D tabs + all-containers overview ·
**GA search stage over loading orders** (Web Worker, deterministic, never worse
than the heuristic) · in-app help/glossary · demo-data menu · and engine bugs
11-20 (see their sections below), several of them hard-constraint violations
found by our own tests.

**Verification tooling:** `verify_build.js` checks any teammate's copy against
the canonical file and runs every suite — use it before merging anything.

**Open / next (agreed with the user, Aug 2026):** the professor's realism points
(air ULD contoured corners, ULD compartments), a "before you use this" disclaimer
screen, colour-by-destination in the 3D view, and — lower priority — making the
GA memetic. See "Professor's realism points" below.

## What this project is

Senior project, AI major. An intelligent container load-planning tool with a 3D
"digital twin" view. User selects transport mode (sea / land / rail / air) and a
container preset, inputs cargo (manually or CSV), and the system computes an
optimized, physically loadable packing plan, visualizes it in 3D, and shows a
step-by-step loading sequence plus metrics (volume utilization, weight, CoG,
rejected pieces with reasons).

Idea suggested by the department chairman. Team of 5. The user owns the
technical/implementation part; teammates own problem statement, dataset and
other proposal sections.

## Team & integration status (as of this chat)

Five members. Their work arrived in `teammates.zip` (extracted under `Teammates/`
and used):
- **m1 — package/loading manifest.** Concept = a saveable *shipment record*: unique
  Manifest ID, reference/route (e.g. JED→RUD), shipping date, status, all cargo +
  final placements, exportable CSV; save & reload. His files: a manifest CSV
  (shipment header + 134-piece reference load) and a message confirming the idea
  with the professor. **This manifest UI is already built into m4's layout**
  ("Cargo Manifest — Shipment Record" panel: New / Validate / Save locally / Load).
- **m2 — datasets/scenarios** *(but the zip labels are SWAPPED)*: m2's folder holds
  `container.csv` (the fleet), m3's holds the scenario CSVs. Tell the team.
  `container.csv` = the 8 spec-sheet containers, semicolon-delimited, dims in
  METERS, grouped by transport_mode; **missing `max_kg` and `count`** (both needed).
- **m3 — the scenario CSVs** (`scenario_easy/medium/tough (1).csv`) — copies of ours.
- **m4 — UI / "make it prettier".** Delivered `Final Version.html`. **VERIFIED: he
  kept our engine intact** — after stripping comments, his `pack()` differed from
  ours by ONE algebraically-identical line (`fz1-fs.z` == `fs.W`); passed all our
  tests. **Action taken (user's "opt 1"): the working `cargo_load_planner_v4.html`
  is now m4's UI + OUR commented engine.** Backup of the pre-merge file =
  `cargo_load_planner_v4_pre_m4.html`. m4's UI kept our Expand button, door display,
  etc.; it dropped the reject-reason legend (minor).
- **user (owner) — the optimizer (GA search, later) + multi-container logic** (see
  Roadmap). Multi-container algorithm is built + tested this chat.

## Current files (in the working folder)

- **`cargo_load_planner_v4.html`** — THE APP (engine v0.4; file renamed from
  `_v3.html`). Single self-contained HTML, opens by double-click, Three.js r128
  from cdnjs (OrbitControls not available in r128; custom orbit implemented
  manually). Units internal: cm / kg. Superseded: `cargo_load_planner.html`,
  `_modes.html`, `_v2.html`, `_v3.html` — history only, ignore.
- `pack_test.js` — headless regression suite. `node pack_test.js cargo_load_planner_v4.html`
- `multi_pack_test.js` — multi-container suite (strategies, conservation, payload,
  fleet counts, determinism, fleet-CSV import). `node multi_pack_test.js`
- `optimizer_test.js` — search-stage suite: never-worse-than-baseline, fixed-seed
  determinism, the returned order reproduces its reported fitness, the optimized
  plan passes the full physics re-check, conservation, and a demonstrated gain.
  `node optimizer_test.js cargo_load_planner_v4.html 2500`
- `ui_smoke_test.js` — headless **UI wiring** check in jsdom with a Three.js stub
  (fleet table edit/add/delete, CSV import, strategy dropdown, Plan shipment,
  container tabs, metric honesty, guard rails). Needs `npm i jsdom`; skips
  cleanly if jsdom is absent. `node ui_smoke_test.js cargo_load_planner_v4.html`
- `benchmark.js` — runs all datasets × all modes → `datasets/baseline_results.csv`
- `datasets/` — 21 test instances + `thpack_to_csv.py` converter + results
- `scenario_easy.csv` / `scenario_medium.csv` / `scenario_tough.csv` — hand-built
  demo datasets (realistic densities 110–251 kg/m³). Easy: 460 pcs, all stackable,
  1 drop → 20 ft Std. Medium: 174 pcs, fragile + non-stackable, 3 drops → 40 ft Std.
  Tough: 228 pcs (<300, fast), fragile/non-stackable/tip + 3 tall cabinets that
  exceed the door, 4 drops → 40 ft HC (~69% util, exercises every reject reason).
- **Containers** now match the spec sheet (`Container types and sizes` PDF): sea &
  rail share the 4 ISO types (20 Std, 40 Std, 40 HC, 45 HC); road = Box/Mega
  trailer; air = LD3/AKE, AKH. Each preset carries `doorW`/`doorH`. Air & road
  payloads are standard values (not on the sheet): AKE 1,500 / AKH 1,100 / trailers
  24,000 kg.
- `scenario_datasets_guide.md` — reference/talking-points sheet for the three
  scenarios (composition tables + "what to say" per dataset + the difficulty
  framing). Measured packs: easy 460/460 @ 53.8% (20 Std), medium 174/174 @ 44.7%
  (40 Std), tough 211/228 @ 69.1% (40 HC, shows 3 too-big-for-door + stack-limit +
  no-stackable-surface). All solve in <130 ms.
- **UI changes this cycle (v4):** (a) fragile/non-stackable rows show Max↑ = 0 (not
  ∞) with those inputs disabled; (b) rejected-list dims + manifest/hint fonts
  enlarged for readability; (c) cargo input table given real column widths + its
  own horizontal scroll; (d) **⤢ Expand** button on the 3D view → fills the window,
  Esc/click to exit (renderer re-sizes). Score is computed per placement but NOT
  yet shown in the UI (see Open threads → explainability).
- `HOW_IT_WORKS.md` / `شرح_عمل_النظام.md` — team explainer (EN / AR)
- `TECHNICAL_STUDY_GUIDE.md` — defense prep, algorithms explained generally
- `ALGORITHMS_AND_VALIDATION.md` — technical reference + handoff
- `RESEARCH_AND_DESIGN.md` — competitor study, architecture, roadmap
- `intelligent_cargo_loading_proposal_MERGED.docx` — current proposal
- `technical_section.docx` — standalone technical section

## Engine v0.4 — how it works (all inside `pack(cont, rows, mode, opts)`)

Architecture is **filter, then score**: hard constraints eliminate illegal
candidates, soft objectives score the survivors, best score wins.

1. **Ordering** — constraint-aware First-Fit-Decreasing:
   destination group (later stops first → LIFO) → fragile last (nothing may rest
   on fragile, so early placement creates dead columns) → priority desc →
   volume desc → weight desc.
2. **Candidate generation** — **maximal free spaces** (`spaces` list,
   `splitSpaces()`): placing a box splits every intersecting free cuboid into up
   to 6 maximal sub-cuboids, prunes contained ones. Complete representation.
   Plus **extreme-point anchors** (`anchorsOf()`): candidates snapped to corners
   of supporting boxes at the space's base height, because a maximal space may
   overhang air.
3. **Selection** — best-fit. `score()` = weighted sum of 7 normalised terms:
   `sup, low, deep, ctr, fTop, snug, grow(penalty)`. The three modes are three
   weight vectors in `const W` at the top of `pack()`.
4. **Repair** — fragile headroom reservation: if any fragile piece is rejected,
   repack once with non-fragile stacking capped at `H − tallest rejected fragile`,
   keep whichever plan places more. Bounded 2× cost, fires only on failure.
5. **Sequence** — topological sort over the rests-on DAG; a box is only sequenced
   after all its supporters. Prevents "floating box" animations.
6. **Support index** — `byTop` Map (height → boxes with tops there, 0.5 cm
   buckets) for O(1) support lookups. `chainBelow()` propagates stack load
   transitively.

### Hard constraints (never traded off)
containment · non-overlap · support ≥ 0.75 · nothing on fragile · per-box
`maxLoad` stack limit (transitive) · payload cap · orientation rules
(yaw always if `rot`; 6 orientations if `tip`; else fixed "this side up") ·
**door aperture** (a piece is slid in along the length axis, so its across-width
and height must pass through the container's `doorW × doorH` opening in some
allowed orientation; else rejected `"too big for door"`). Door dims are per
container preset.

### Cargo schema (per row)
`name, l, w, h, kg, qty, fragile, stackable, tip, maxLoad, pri (1-5), dest, color`

### Modes (user-facing, with description strip under the header)
- **Easy load** — wall-building, loadability first (`deep` heavy, `grow` 0)
- **Max fill** — compact block stowage (`grow` 0.6 penalty on extending length)
- **Balanced** — low, centred CoG (`ctr` 0.30, `grow` 0.8)

## Measured results (reproducible: `node benchmark.js`)

21 datasets: mean utilization **easy 72.1% · fill 74.3% · balanced 74.0%**,
max solve time 53 ms. Reference instance (sample cargo, 20ft GP): **134/134 in
all three modes**, all invariants pass.

Progression this cycle — evidence the algorithm choices mattered:
| Stage | Mean util (fill) |
|---|---|
| corner points + first-fit | 67.0% |
| + maximal spaces + anchors | 70.8% |
| + fragile reservation (v0.4) | **74.3%** |

Honest gap: published best-known on genuine BR instances ≈ 87–93%. We are
~10–15 points below SOTA. This is stated openly and is the justification for a
future search stage.

## Bugs found and fixed (all from the user's screenshots — good defense material)

1. 17 cartons rejected while air sat above fragile glassware → fragile-last sort.
2. Fragile rejected while flat supported surfaces were visibly empty → corner
   points are an incomplete candidate set → migrated to maximal free spaces.
3. "Max fill" laid a one-box-deep carpet down 100% of a trailer instead of a
   tight block → added the `grow` compactness penalty (util is
   arrangement-invariant, so density mode must mean *compactness*).
4. Fragile dumped on the floor by the door in dense modes → fragile headroom
   reservation retry.
5. Position-sorted sequence showed floating boxes → topological ordering.
6. Kaggle import showed "∞" in the Max↑ column for fragile/non-stackable rows,
   which are actually `maxLoad = 0` (bear nothing). The table treated `0` and
   `Infinity` identically (both rendered the ∞ placeholder). Fixed to show the
   *effective* capacity: fragile / non-stackable rows now display `0` and their
   Max↑ / Stackable inputs are disabled so contradictory rows can't be entered.
7. Rejection reason "stack weight limit" conflated two distinct causes. Split
   into: **"stack weight limit"** (a *stackable* base with a finite Max↑ that the
   piece's weight would exceed — true crush) and **"no stackable surface"** (the
   only available base is non-stackable or fragile, `maxLoad = 0` — structural,
   nothing to do with weight). On the Kaggle data the dominant reason is now the
   honest "no stackable surface", because 35% of rows are non-stackable. Ships
   with a regression assertion (`pack_test.js`, reject-reason split check).
   NB: density (median ~2,014 kg/m³) is a separate real data flaw but is *not*
   what drives these rejections — ordinary stackable rows import with
   `maxLoad = Infinity`, so their weight never limits stacking on them.
8. Data-model note: `stackable` ≡ `maxLoad > 0`; the checkbox was near-vestigial
   (`pack()` never reads `r.stackable`, only the import at the schema-expansion
   step converts it to `maxLoad = 0`). The form now keeps fragile / stackable /
   Max↑ mutually consistent; the CSV schema is unchanged for dataset/test
   backward-compatibility.
9. Oversize pieces vanished silently. A pre-pack filter (OURS, from chat 1 — in
   every version; NOT m4's) dropped any cargo bigger than the container interior,
   and its warning toast was overwritten by the reject-count toast. Removed it;
   the engine now reports oversize pieces distinctly: **"too big for container"**
   (no orientation fits the interior) vs **"too big for door"** (fits the box but
   not the door opening). Ships with a regression assertion. Nothing vanishes now.
10. **Fragile-reservation collapse (user found via demo+tough).** The fragile
   headroom reservation (bug #4) reserved `H − tallest_rejected_fragile` for the
   WHOLE container, and kept the retry if it placed more *pieces*. A single tall
   fragile piece (180 cm Glass panel in a 239 cm box) capped non-fragile stacking
   at 59 cm, excluding every large item, and the count metric locked in the shallow
   layout → util collapsed **~76% → 37%**. Two-part fix: (a) only reserve for
   fragile items ≤ half the container height; (b) keep the retry only if it fills
   MORE VOLUME (ties → more pieces). Result: demo+tough 37% → ~90%, tough-alone held
   at 87–88%, **benchmark mean unchanged (72.1 / 74.4 / 74.1%)**, reference 134/134.
   New regression test (`tall-fragile no-collapse`).

## Multi-container feature (v0.5) — THE USER'S PART, now complete

`planShipment(fleet, rows, mode, opts)` loops `pack()` as the inner decoder: fill a
container, regroup what didn't fit (`rowsFromPieces`), open the next one. Every
physical constraint still holds per box because every container is packed by the
same `pack()`. Deterministic (no randomness; ties broken by fixed rules).

### Container-selection strategy = a selectable MODE (`opts.strategy`)
Three weight-vector-style options, exposed as a **STRATEGY dropdown** next to the
Plan-shipment button, each with a description strip (same pattern as "Optimize for"):
- **`fewest`** (default) — bin-level **First-Fit-Decreasing**: largest interior
  volume first, take the first available type that holds ≥1 piece. Minimises the
  NUMBER of containers = freight cost per shipment.
- **`maxload`** — packs **every available type each round** and keeps the highest
  **volume-utilisation ratio** (ties → more volume → smaller container). Maximises
  the load factor of each container shipped ("no half-empty boxes"); may ship MORE
  containers than `fewest`. Cost: one `pack()` per available type per round.
- **`listed`** — fleet used strictly in table order (the planner decides).

**Measured contrast (scenario_tough, 228 pcs, full ISO fleet, "Max fill"):**
| Strategy | Containers | Placed | Avg utilization |
|---|---|---|---|
| fewest | 2 × 45 ft HC | 225 | 32.1% |
| maxload | 4 × 20 ft Std | 225 | 41.7% |
| listed | 4 × 20 ft Std | 225 | 41.7% |

Round-1 load factors that drive `maxload`: 20 ft Std **87.3%** · 40 ft Std 74.5% ·
40 ft HC 70.0% · 45 ft HC 63.0%. This table IS the defense answer to "why is
container choice a mode and not a rule": the two objectives genuinely conflict —
fewer boxes vs. fuller boxes — and the tool lets the planner pick. (Greedy caveat
to state openly: the last container of a greedy plan is always the empty stub, which
is exactly what the GA stage can improve.)

### Fleet table (editable, like the cargo table)
Columns: **Mode · Container type · L · W · H · DrW · DrH · Max kg · Count · ✕**.
`Count` blank = **unlimited** — that column is the limited-vs-unlimited answer.
Buttons: + Add container · Import fleet CSV · Load standard fleet · Clear fleet ·
Fleet CSV template. Summary bar shows types / available / total capacity m³.
Checkbox **"Only use containers of the selected transport mode"** (default on) —
`MODE_GROUP` treats **sea and rail as one interchangeable group** (same ISO boxes),
so an ISO fleet is offered under both. App boots with the standard fleet loaded.

### Fleet CSV import — m2's `container.csv` works as delivered
`parseFleetCsv()` handles semicolons **and** commas, header aliases
(`transport_mode`/`container_type`/`inside_length`…), and **auto-detects metres**
(`toCm`: any interior dimension < 50 must be metres — no container is 50 cm long).
The two gaps in m2's file are repaired, not rejected:
- **missing `max_kg`** → recovered by fuzzy-matching the name against our built-in
  presets (`knownMaxKg`); all 8 of m2's types resolve exactly, so nothing is
  guessed. Unknown names fall back to 24,000 kg **and are named in a warning toast**.
- **missing `count`** → unlimited (and the toast says so).
- missing door dims → full interior face, also warned.
Verified: m2's `5.895;2.350;2.392` → **590 × 235 × 239 cm**, identical to our
preset. Modes map sea & rail → sea, Road → land, Air → air. **Tell the team the
zip labels are still swapped (m2 ⇄ m3).**
Our own schema (unchanged): `mode,name,length_cm,width_cm,height_cm,door_w_cm,door_h_cm,max_kg,count`.

### Plan shipment UI
"Plan shipment" button → **Shipment plan** panel (containers used, pieces loaded,
avg utilization, per-type breakdown, kg loaded, solve time in the toast) + a
clickable list of containers, + a **container tab strip over the 3D stage**
(`#1 40 ft HC 87%` …). Clicking a tab/row re-points the *existing* single-container
UI at that container's plan — 3D view, metrics, step-by-step manifest, playback and
tooltips all follow. One renderer, no duplicated view code. Exports:
**shipment CSV** (container_no + all placements + a NOT-SHIPPED block) and
**shipment JSON**. "Pack cargo" or changing the container preset exits shipment view.

**Honesty fixes made while wiring (same spirit as bug 7):** a container's `unfit`
pieces are NOT rejects — they are loaded into the *next* container. So in shipment
view (a) the Rejected panel shows **shipment-level leftovers only**, (b) "Pieces
packed" reads `N of TOTAL shipped`, (c) the note reads "64 piece(s) here, 272
carried on to the next container", and (d) leftovers carry a real reason —
`"no container left in the fleet"` when counts run out, otherwise the physical
reason from the last attempt (e.g. "too big for door").

### Tests shipped with it
`multi_pack_test.js` (rewritten): conservation, payload caps, in-bounds recomputed
from coordinates, **fleet count limits**, the **strategy contracts** (fewest opens
the largest; maxload's first container is independently re-verified as the argmax
load factor; listed respects order), **determinism on repeat runs**, and the fleet
CSV importer against m2's real file + our template. `ui_smoke_test.js` (new) covers
the DOM wiring. `pack_test.js` still passes unchanged — the engine was not touched.

## UI rework + bugs 11-13 (v0.5b, from the user's 3-dataset screenshots)

The user ran **demo + tough + medium (536 pcs)** on the standard fleet and said the
packing "looks weird". It was reproduced headlessly and it was a real bug.

11. **Loading SEQUENCE was incomplete (engine).** The topological order was built
   from `b.supportedBy` — the boxes that existed *when b was placed*. A small
   carton can later be placed under the **overhang** of an earlier box. It carries
   none of that box's weight (so the 75% support test still passed on the earlier
   supporters) but it touches the underside, so the sequence emitted the big box
   BEFORE the carton underneath it — physically un-loadable (zero clearance) and it
   read as a floating box in playback. Fix: rebuild the DAG from the **final
   geometry** (`byTop` bucket at `b.y` + `restsOn`), so *any* touching box is a
   predecessor however small the contact. Acyclic by construction. **Placements and
   utilization are unchanged** (benchmark identical: 72.1 / 74.4 / 74.1%) — only the
   order changed. Regression test added to `pack_test.js` ("slid-under sequence
   check", the user's exact 536-piece merge); the pre-fix engine fails it with 5
   violations.
12. **CSV import silently dropped rows sharing a NAME.** `importCsv` skipped any row
   whose name repeated (a guard meant for repeated Kaggle Cargo_IDs). Merging the
   three scenario files — each with its own "Pallet crate" / "Appliance box" — lost
   **82 of 536 pieces without a word**. Now a row is only a duplicate if *every*
   field repeats; genuinely different rows are kept and the later one is renamed
   `Name (2)` so the manifest, tooltips and exports stay unambiguous.
13. **Test-harness flaw (not the engine).** `pack_test.js` resolved a box's `maxLoad`
   by NAME, so on merged datasets it checked boxes against another row's capacity
   (three "Appliance box" rows: 120 / 180 / 200 kg) and reported 15 phantom stack-load
   failures. Now matched by name + sorted dims + weight.

### UI rework the user asked for (all shipped)
- **Fleet table moved ABOVE the cargo table** and the selected-container detail
  cards moved into it.
- **Header container dropdown REMOVED.** The tab strip over the 3D view is now the
  only container picker: one tab per fleet container, **Pack cargo = the selected
  tab**, **Plan shipment = the whole fleet**. (User's "opt 1".)
- **All-containers overview** — an `▦ All containers` tab lays every planned
  container side by side in the same scene with `#n` sprite labels; click a
  container (cargo hit, or its floor footprint via a ground-plane ray) to open it.
  Planning now OPENS on this view when >1 container. Metrics/HUD switch to
  shipment-level totals; the step manifest says to open a container.
- **Drag-to-reorder fleet rows** (⠿ grip, drop indicator) so "As listed" order is
  arrangeable; the selected container survives the reorder.
- **Toast fixed**: moved to the BOTTOM of the stage (it was covering the tabs), got
  a ✕, auto-hides (7 s ok / 12 s warning), and has a green "ok" variant.
- **Demo-data menu** replacing "Load sample cargo": sample 134 / easy 460 /
  medium 174 / tough 228 (each auto-selects the container it was built for, loose
  name match so an imported fleet's "40 ft. High Cube" still matches) + **Fleet demo
  536 pcs** that deliberately needs several containers. All three scenario CSVs are
  **embedded in the HTML** — no file browsing mid-demo (closes the roadmap item).

### Lowest-cost strategy + the Cost column
`cheapest` = each round keep the container with the lowest **price per m³ of cargo
actually loaded**; ties → cheaper, then more volume. The UI **refuses to run** if any
usable container has no price (it never invents one), and the summary shows a freight
total only when every container used is priced (`summary.costed`).
**Cost defaults are ILLUSTRATIVE and editable** — say this out loud at defense.
Sourced: Drewry WCI composite **$4,255 / 40 ft** (30 Jul 2026); a 20 ft is commonly
**60-70% of the FEU** rate → $2,800; HC premium → 40 HC $4,450, 45 HC $4,950; road
uses a ~1,000-mile US dry-van load ($1,800-2,500) → Box $2,100 / Mega $2,400. **Air
ULDs are really charged per kg**, so LD3 $1,200 / AKH $900 are the roughest figures
of the set and should be replaced with a real quote. Fleet CSV gained a `cost` column
(aliases cost/price/rate/cost_usd); missing costs are filled from these defaults and
the toast says so.

**Strategy comparison on scenario_tough (full ISO fleet, "Max fill") — defense table:**
| Strategy | Containers | Avg util | Freight |
|---|---|---|---|
| Fewest containers | 2 × 45 ft HC | 32.1% | 9,900 |
| Max load (load factor) | 4 × 20 ft Std | 41.7% | 11,200 |
| **Lowest cost** | 1 × 40 ft HC + 1 × 20 ft Std | 50.5% | **7,250** |
| As listed | 4 × 20 ft Std | 41.7% | 11,200 |
Same manifest, same engine, four different shipping decisions — this is the single
best slide for "why container choice is a mode, not a rule".

## THE OPTIMIZER (v0.6) — search stage, the user's other half of the project

**This is the GA the roadmap promised, and it is built and tested.**

- **Encoding** — a candidate is a **permutation of the cargo TYPES (rows)**.
- **Decoder** — `pack()` / `planShipment()`, unchanged, via a new hook
  **`opts.order`** (array of ranks per row) used as the primary sort key inside
  `pack()`. Destination grouping still outranks it (multi-drop LIFO is a promise);
  within a group the searched rank replaces the fragile/priority/volume keys.
  In `planShipment` the ranks are re-projected each round (`rowKey` on
  name|l|w|h|kg|dest) because leftovers are regrouped and row indices shift.
- **Why search cannot cheat** — every hard constraint lives in the decoder, so
  *no ordering the GA can invent produces an illegal plan*. Best sentence for
  the defense: the search proposes, the engine disposes.
- **Operators** — tournament selection (k=3), **order crossover (OX)**, and
  swap / insert / reverse mutation at p=0.35, population 24, elitism 2.
- **Never worse** — individual 0 is the untouched heuristic ordering, and the
  best is always carried, so the answer is `>=` today's plan by construction.
  Asserted in `optimizer_test.js`.
- **Deterministic** — `mulberry32` seeded PRNG (seed 12345 in the UI). Same seed,
  same answer — keeps the reproducibility claim intact.
- **Fitness follows the UI** (user's choice): single container = loaded volume,
  then piece count. Shipment = pieces shipped → fewest containers → cheaper bill
  (only when the strategy is Lowest cost) → volume. Lexicographic, so objectives
  never trade against each other invisibly.
- **Runs in a Web Worker** — the worker source is generated from the live
  functions with `Function.prototype.toString()`, so there is exactly ONE copy of
  the engine in the file and the worker can never drift from it. Live progress
  bar, best-so-far readout, working **Cancel**; falls back to an inline (blocking,
  5 s capped) run when `Worker` is unavailable — which is also the path the jsdom
  test exercises. **This is also the long-promised Web Worker groundwork.**
- **UI** — its own panel: EFFORT (Quick 5 s / Standard 15 s / Deep 45 s),
  Optimize, Cancel, progress bar, and an honest delta readout
  ("baseline 70.0% → 71.7%, 146 orders in 2.5 s over 6 generations").
  Scope is implicit: a shipment on screen optimizes the shipment, otherwise the
  selected container.

**Measured (2.5 s budget, 40 ft HC, "Max fill"):** scenario_tough
**70.0% → 71.7% utilization and 207 → 222 pieces placed** in 146 evaluated
orders. At a 4 s budget the volume gain is **+8.4%**. scenario_medium shows no
gain — it already places all 174 pieces, so there is nothing to win; that is
reported honestly rather than dressed up. Good defense line: this is the first
thing that has moved us toward the ~87-93% SOTA band, and the headroom left is
the argument for a longer search.

**"Why not just try every solution?"** — n cargo types give n! orderings (12
types = 479 million) and the problem is NP-hard; exhaustive search is not
available at any useful size. That is precisely why metaheuristics are the
standard answer. This is written into the in-app help too.

## In-app help / FAQ (v0.6)

An **ⓘ button in the top bar** opens a full glossary overlay (12 sections), and
small **ⓘ chips on the section headers** jump into the matching part: the two
actions, transport modes, the three OPTIMIZE FOR modes, **all seven score terms
(sup, low, deep, ctr, fTop, snug, grow) in plain language**, the hard constraints,
every cargo column, the fleet columns, the shipment strategies, the optimizer,
the metrics, every rejection reason, and a **known-limits** section that states
the area-vs-CoM support simplification and the chosen 75% / 0.5 cm values before
a committee has to ask. The cost defaults carry their "illustrative, not quotes"
warning inline. Esc or ✕ closes it.

**3D tooltip now explains dead air** (user asked): besides `fragile` it shows
`non-stackable · nothing may stack on it`, or the stack budget
(`bears up to 120 kg · 45 kg on top`). Measured on tough+medium: of the boxes
with >20 cm of empty space above them, **13 were non-stackable and 4 fragile**
(both bear nothing by rule) and 18 were stackable boxes blocked by their weight
cap or by leftover geometry — so the user's hunch was right and the tooltip now
says which.

## Bug 14 + rules study (v0.6b) — "why only fragile?" (user's question)

**`LOADING_RULES_AND_SEARCH_STUDY.md` is the full write-up** (real-world practice
table, the A/B numbers, the multi-container objective split, and the optimizer
literature review). Summary:

14. **Only `fragile` was demoted in the ordering, not non-stackable.** Both carry
   `maxLoad = 0` and both kill the column above them, so this was an
   inconsistency rather than a decision. Fixed: **bears-nothing last** (fragile OR
   non-stackable), fragile last among those.
   **Measured over 24 runs** (tough / medium / tough+medium / 600 Kaggle rows ×
   40 ft HC + 20 ft × 3 modes): mean utilization **59.61% → 60.13%**, pieces
   placed **5,861 → 6,341 (+8.2%)**. BR benchmark unchanged (72.1/74.4/74.1%) —
   those instances have no non-stackable rows, so the rule is inert there.
   Ships with a `pack_test.js` assertion.
   - **Tried and REJECTED (all measured, all in the study):** extending the `fTop`
     height reward to non-stackables (+0.02 pts, −3 pieces — *you cannot score
     your way into a high slot that does not exist yet; in a greedy constructive
     packer the SEQUENCE decides this, not the score* — good defense line);
     weighting `low` by mass for "heavy at the bottom" (no change to utilization
     or CoG height); size-guarded demotion at 0.5/1/2% of container volume (does
     not fix the case it was designed for).
   - **Honest regression:** tough alone in a 40 ft HC drops 70.0% → 67.3%,
     because its no-load items are big steel drums and demoting big items fights
     first-fit-decreasing. **The search recovers it to 72.4% / 71.7% / 72.4%**,
     above the old value — which is the whole argument for having a default rule
     set by the average AND a search for the exceptions.
   - Knock-on: the `pack_test.js` "no stackable surface" case had to pin its
     non-stackable slab to the floor with destination grouping, because the
     engine now (correctly) places both pieces instead of rejecting one.

**Optimizer verdict (asked: is GA best?)** — keep it, but hybridise. Our
architecture is already **BRKGA-shaped** (search proposes an encoding, `pack()`
decodes to a feasible plan) which is a recognised approach for this problem. Next
step in order of value: (1) **memetic** — short local search on the elite each
generation, pure GA explores well and refines badly; (2) restarts on stagnation +
a convergence curve for the report; (3) **beam search** as a *second* engine
(searches placements, not orderings — complementary, and cited as SOTA for 3D
CLP); (4) never exhaustive: n! orderings, NP-hard.

## Bugs 15-16 (v0.6c) — both found from the user's screenshots/report

15. **OPTIMIZER MEASURED THE WRONG BASELINE (serious).** `searchOrders` seeded
   individual 0 with the identity permutation and called that the baseline. But
   `order = [0,1,2,…]` is NOT "no order" — it makes the CSV row index the primary
   sort key and overrides every heuristic. So "improved" was measured against
   *pack in row order*, not against the real plan, and the never-worse guarantee
   did not actually hold. Fixed: the baseline is now `evaluate(null)` (no order
   hook at all) and the heuristic ordering is seeded properly via
   **`heuristicRanks(rows)`** (mirrors pack()'s comparator: no-load last, fragile
   last, priority, volume, weight). `optimizer_test.js` now asserts
   `baseFit === fitness(no-order plan)` in both scopes. Real effect on the
   headline number: the tough-set gain is **69.0% → 72.4% (+4.9%)**, measured
   against the true baseline instead of the flattering one.
16. **Optimizer "searched forever" in the browser.** The Blob URL was revoked
   immediately after `new Worker(url)`, which can abort the load; nothing then
   arrived and nothing ever timed out. Fixed: the URL lives until the worker is
   terminated, the worker posts **`ready`** before work starts, and there are two
   watchdogs (4 s to load, budget + 15 s to finish) that fall back to the inline
   search instead of hanging. The worker also catches its own errors and reports
   them (`failed`) rather than dying silently.

### The "stub container" (user's 3-container screenshot) — explained and answered
Fleet demo (536 pcs) on the standard fleet, "Easy load" + Fewest: **3 × 45 ft HC
at 93.2% / 33.1% / 1.4%**, the third holding nothing but 17 Glassware. Diagnosis:
greedy bin filling always opens a fresh container for whatever is left, and
because no-load pieces are offered last they are exactly what is left over. The
remaining surfaces in #2 are mostly no-load tops (69 of them), which by rule bear
nothing, so the last Glassware has nowhere legal to go — correct behaviour, bad
outcome.
- **The search fixes it**: 134 orders → **2 containers, avg util 63.8%, freight
  9,900 instead of 14,850** (a whole 45 ft HC saved). This is now the strongest
  demonstration in the project of why the search stage earns its place.
- **Tried and rejected:** promoting no-load rows to the FRONT at shipment level —
  still 3 containers and #1 collapses to 36.7%. Confirms no-load-last is right
  *within* a container; the stub is a bin-level problem, not an ordering one.
- **Shipped:** the Shipment panel now warns when the last container is <15% full
  and points at the optimizer, so nobody has to wonder why #3 holds 17 boxes.
- Fleet table headers renamed `DrW`/`DrH` → **`Door W`/`Door H`** (user asked what
  they meant — that is a UI failure, not a user failure).

## Bugs 17-18 (v0.6d) — both from the user's optimizer screenshots

17. **The search was destroying loadability (important, and subtle).** Fitness
   counted pieces / containers / cost / volume — nothing about *where* the empty
   space ends up. So the search happily turned a proper wedge into a floating
   block. Measured on the fleet demo, fill profile in 10 bands from far wall to
   door: before the fix the optimized container #2 read
   `[29 21 36 77 73 61 87 62 41 6]` — a hole **behind** the cargo, which is the
   one place a loader must not have one (you cannot brace it and you would be
   lifting over a finished stack). Baseline "Easy load" produced a clean wedge
   `[78 50 29 29 31 29 29 29 17 11]`, so the search was actively undoing the
   `deep` term's work.
   Fix: **`loadDepth()`** — the volume-weighted centroid of the load along the
   length — added as the final lexicographic tiebreak in `fitnessOf` for both
   scopes. It cannot cost pieces, containers, cost or volume; it only chooses
   between plans that are otherwise equal. After: `[91 84 90 92 79 80 69 53 36 24]`
   and `[82 85 89 94 82 69 47 21 6 4]` — both proper wedges, **still 2 containers
   at 63.8% average utilization**. Ships with an assertion in `optimizer_test.js`
   (load centroid must stay in the front half of every optimized container).
   Defense value: this is a textbook example of an objective function that was
   *technically* improving while making the plan worse in practice.
18. **Tooltip looked like it invented cargo.** A box that is yaw-rotated reports
   the dimensions it was PLACED in, so an 80×70×90 Appliance box shows as
   70×80×90 — indistinguishable from a different item that does not exist in the
   cargo table. Pieces now carry `ol/ow/oh` (as listed) and the tooltip adds
   *"turned · listed as 80 × 70 × 90"* when the placed orientation differs.

**Determinism, precisely (user asked "will it give the same result always?"):**
the search itself is fully seeded (seed 12345), so the *k*-th candidate it tries
is always the same. But the stopping point is a TIME budget, so the number of
generations depends on machine speed and load — a faster machine explores more
and may end up with a better plan. Same machine + same effort setting + same
input = same answer; across machines it can differ, and it is never worse than
the heuristic plan either way. If a run has to be exactly reproducible for the
report, quote the effort setting and the machine.

## v5 — UI merge with the teammate's file, and bug 19

**`cargo_load_planner_v5.html` IS NOW THE APP** (from `Automated Container Load
Optimization.html`, the teammate's redesign). Supersedes `_v4.html`.

The teammate built on our current file, so this was a UI merge, not a logic
merge. Verified mechanically before touching anything:
- **29 of 31 shared functions byte-identical** to ours ignoring comments, and
  **their file passed pack_test / multi_pack_test / optimizer_test / benchmark
  unchanged** (72.1 / 74.4 / 74.1%). Their logic *is* ours.
- Two differences: `renderTabs` (they wrap the tab label in a `<span>` for their
  CSS — **kept theirs**), and `helpHtml`, which they had **cut from 8,305 chars
  to 124** — the whole glossary. **Restored ours.**
- They had stripped ~93% of our rationale comments (15,545 → 1,098 chars). The
  merge re-inserts our commented versions of every shared function plus the
  top-level banners, because those comments are the record of *why* each rule
  exists and the user has to defend them.

**What the teammate added (all preserved):** the left panel is now **tabbed**
(Cargo / Manifest / Metrics / Fleet / Advanced); **m1's shipment-record panel**
is finally wired (manifest ID, reference, date, origin/destination, shipper,
consignee, notes, CSV + JSON export); and a **scenario comparison** tool
("Compare all solutions" — runs Easy load / Max fill / Balanced on the same
container and manifest and tables the results). 14 teammate-only functions and
all 116 of their element ids survive the merge; audited, nothing lost.

**Merge audit (repeatable):** all 61 of our top-level functions present, all 54
declarations present, every DOM id our code touches exists, and every marker
checked individually (loadDepth in the fitness *and* inside the worker source,
sequence-DAG fix, bears-nothing rule, `evaluate(null)` baseline, worker
handshake + watchdogs, rotated-box tooltip, duplicate-name import fix, stub
warning, cost strategy, full glossary).

19. **HARD CONSTRAINT BROKEN: cargo could rest on fragile after all.** Found
   while verifying the merge, present in both files, so it is ours and it is old.
   The support test only looks DOWN — at boxes that exist when a piece is placed.
   A piece slid UNDER the overhang of an earlier box therefore became a supporter
   *after the fact*, and if it was fragile or non-stackable nothing noticed. Real
   case from the search: a fragile Electronics carrying another Electronics on a
   5 cm sliver of overhang, and a 30 kg box resting on a piece with Max↑ = 0.
   NB the bears-nothing-last rule (bug 14) makes no-load pieces the *last* ones
   placed, which is exactly the population most likely to be slid underneath —
   so that improvement raised the odds of hitting this.
   **Fix:** a `byBottom` index mirroring `byTop`, and `restingOnTop()` — before
   accepting a position, look UP for boxes whose underside would land on the new
   piece. If the piece bears no load the position is refused; otherwise the
   weight already overhead (plus its own stack) must fit within its Max↑, and is
   added to `loadAbove` and propagated down the chain. O(1) bucket lookup, same
   cost as the support test.
   **Result:** 0 violations in 400 randomised orderings (previously failed at
   trial 23), all suites pass, **benchmark unchanged** (72.1 / 74.4 / 74.1%).
   Ships with a deterministic regression test (`slid-under-fragile` in
   `pack_test.js`) which the pre-fix engine fails with 3 errors.

## Team workflow — stop merging blind (v0.6f)

**`verify_build.js` — run this on ANY copy before merging it.**
`node verify_build.js <their-copy.html> [reference.html]` (reference defaults to
`cargo_load_planner_v5.html`). It reports, mechanically: every missing function
or declaration, every function whose LOGIC changed (comments ignored, so a
reformat is not flagged), every element id the code needs but the markup lost,
**each named engine fix by name**, everything their copy ADDED (so their work is
not lost either), and it runs all three regression suites. Exit code 0 = safe.
Proven on the real case: run against the teammate's original upload it correctly
reported the fragile fix, `byBottom`, the deterministic budget and the glossary
as LOST, and `pack_test.js` failing with 3 errors.

**Suggested working agreement (the file-copy mess is the real risk now):**
1. One file is canonical (`cargo_load_planner_v5.html`); everything else is a
   working copy.
2. Teammates edit **markup and CSS only**; the `<script>` engine/optimizer
   section is owned by the user.
3. Before any merge, run `verify_build.js` on the incoming copy. Zero problems,
   or it does not go in.
4. Better still, put the file in a git repo (GitHub) so the diff is automatic —
   the verify script then becomes the pre-merge check rather than the only one.

**Bug 20 — the optimizer gave a different answer every run.** The budget was
wall-clock, so a busy machine completed fewer generations: 80 orders one run, 81
the next, hence a different plan from the same seed. Effort is now a **fixed
number of loading orders** (Quick 150 / Standard 500 / Deep 1500) with the clock
kept only as a safety cap. Verified: five runs under deliberately varying CPU
load produced the **identical** plan (500 orders, 22 generations, 55.221 m³). If
the safety cap ever fires, the UI says the run was cut short and is not
reproducible.

**Still open — "the optimizer's arrangement looks odd" (user, from a screenshot
showing one pipe bundle at the top-back and the rest by the door).** It is legal
and denser, but it is not what a loader would do, because **nothing in the
fitness rewards keeping identical items together**. Real practice groups like
cargo for tallying and unloading. Candidate fix: a cohesion tiebreak (mean
distance of each cargo type from its own centroid) added after `loadDepth`, the
same way loadability was added. Not built yet — measure before adopting.

## Professor's realism points (raised in the meeting, NOT yet built)

**1. Air ULDs are not cuboids.** A real LD3/AKE has a cut-away lower corner to
follow the fuselage; we model a perfect box, so we over-report usable volume.
**Three.js is NOT the blocker** — `CylinderGeometry` / `ExtrudeGeometry` are core
in r128 and can draw any of this. The engine is the cuboid part.
**Planned approach — blocker volumes:** pre-place invisible occupied boxes in the
chamfer before packing. The free-space splitter already handles occupied space, so
no new geometry maths and no new constraint code; cargo simply cannot enter the
contour. Report utilization against **usable** volume (interior − blockers), and
exclude blockers from the manifest, step sequence and rejected list. Defense line:
"the contour is approximated by a stepped forbidden zone; the load factor is
quoted against usable volume."
**2. ULD compartments** — same trick (blockers for dividers), or model each
compartment as its own container in the fleet. Decide when building.
**3. Non-cuboid cargo (pipes, drums).** The engine packs the **bounding box** —
which is what commercial tools do as well, since round items cannot be relied on
to nest. Planned: *render* a cylinder for such items so the picture does not
overstate the model, labelled "packed as its bounding box". Needs a `shape`
column (box | cylinder) on the cargo row — visual only, zero effect on packing.

**Also agreed:** a "before you use this" disclaimer screen (perfect undented
containers, no dunnage/securing, area-based support not centre-of-mass, no axle
limits, no hazmat segregation, illustrative freight costs) and a
**colour-by-destination** option in the 3D view (good for demoing multi-drop LIFO).

**Process note the user raised, worth keeping:** several of bugs 11-20 were
avoidable design errors of ours, not misdirection from the user. The cheap
prevention agreed: when a property is non-negotiable (reproducibility, "nothing
ever rests on fragile"), state it once up front and write the assertion BEFORE the
feature. Every one of these was still caught in-house by our own verifier, which
is itself defense material — but earlier assertions would have caught them sooner.

## Testing discipline (non-negotiable)

`pack_test.js` **independently recomputes** the physics from output coordinates —
never trusts engine internals. Asserts: bounds, overlap, support ratio, nothing
on fragile, transitive stack load, sequence precedence, payload, upright
orientation, multi-drop LIFO. **Every new packing rule ships with a new
assertion.** User does visual QA from screenshots — treat their screenshots as
bug reports; they have caught 4 real issues that way.

## The Kaggle dataset (`ecommerce_cargo_dataset_with_IoT.csv`)

3,500 rows, 25 columns, all Cargo_IDs unique. Used columns: dimensions, weight,
Fragile, Stackable, Priority, Destination_Zone. The 13 IoT/GPS/robotics columns
are ignored by the importer (header-alias parser handles this automatically;
import takes ~50 ms).

Composition: 679 fragile, 1,239 non-stackable, 4 destination zones (~evenly
split), priorities 1–5 (~evenly split). Dimensions are parcel-sized
(max 79.9 × 59.8 × 49.9 cm). Total volume 44.5 m³, total weight 89,511 kg.

**CRITICAL DATA-QUALITY ISSUE — discuss before drawing conclusions from it:**
every single row has a density above 1,000 kg/m³ (min 1,589, median **2,014**,
max 2,520 kg/m³). That is twice the density of water and comparable to concrete
— physically implausible for e-commerce parcels; the weights are synthetic and
inconsistent with the dimensions.

Consequence for packing output (corrected — see bug 7): the dominant rejection
reason is **"no stackable surface"**, not the payload cap. 35% of rows are
non-stackable (all 679 fragile rows are inside that set), so the importer sets
`maxLoad = 0` for them — nothing may rest on them. Once the floor and the tops of
the genuinely-stackable boxes are full, most remaining candidate surfaces are
these no-load tops, so the rest is rejected. The 20 ft GP 28,200 kg payload cap
is *near*-binding too (≈1,029 placed ≈ 26.3 t), but rejected pieces never add to
the running weight, so "weight limit" rarely shows as the reason. All of this is
**correct engine behaviour on bad/edge input data**, not an engine bug. Options
to discuss: scale the weights to realistic densities (~100–300 kg/m³), relax /
ignore the `Stackable` flag for this dataset, pack subsets per order/zone, or use
it only for the non-weight attributes.

Performance note: packing all 3,500 pieces takes ~25 s (a warning toast appears
above 800 pieces). The cargo table renders at most 300 rows but packs all of
them. Moving the solver to a Web Worker is roadmap. NOTE: a plain "loading" overlay
will NOT fix the freeze — `pack()` blocks the main thread, so the browser can't
paint the overlay until it finishes. The real fix is the Web Worker (below).

## Landscape — free vs. commercial, and the "DeepPack" naming trap

The user researches competitors; keep these straight (they are easy to confuse).

**Free / open-source packers (MIT — legal to read, extend, build on):**
`py3dbp` (enzoruiz), `Bruno-Ghiberto/3D_BIN_PACKING` (FFD + shelf, 6-axis, CSV —
closest to "clone and extend"), **`yptsang/DeepPack3D`** (RL + heuristics, 2025
paper), `Wadaboa/3d-bpp` (uni AI course, Streamlit), `hyperpack` (pure-Python 2D).
These are what "free software we could build on" refers to (from the first chat).
Academic-integrity rule: use + **cite** + compare freely; do NOT copy code and
present as original. `py3dbp` is on the do-not-name-in-proposal list.

**Commercial (closed, paid — market/UX reference only, cannot build on):**
- **deeppack.ai = DeepPack®**, a commercial AI SaaS by **InstaDeep Ltd.** (demo/
  login/API, TMS/ERP/WMS). **This is NOT `yptsang/DeepPack3D`.** Same-family name,
  unrelated project. The polished "edit constraints / edit base support" video the
  user saw is this one.
- **EasyCargo** — web app: per-item stackable/tilt/rotate, non-stackable groups,
  2/3-axle weight distribution, CoG, shift-to-mass-center, virtual walls.
- **CubeMaster** (Logen Solutions) — 3D weight-distribution + axle + CoG, stacking
  rules with **editable min-support-rate + max supporting depth**, hazmat flags,
  palletizing patterns, multi-container weight balancing.
Their "editable" features (support rate, axle, CoG, hazmat) are exactly our
limitations register → they double as a feature roadmap. Proposal decision stands:
EasyCargo/CubeMaster stay OUT of proposal text.

### DeepPack3D code study (yptsang, the free one — read in full)
- **Online** packer (conveyor + lookahead k); ours is **offline** (sorts whole
  manifest). Voxelized bin (default **32³**, integer item sizes).
- Spatial core is our family: `free_splits` = maximal free cuboids, split-on-place
  + prune-contained; plus a 2D `height_map` for support (= our `byTop` idea).
- **Only physical constraint** is stability: `count(base at top height)/(d*w) > 0.5`
  → ≥50% flat contact. NO weight, payload, fragile, maxLoad, door, or destinations.
  **Our engine models far more real cargo constraints than DeepPack3D.**
- **The "AI" = a DQN** (`agent.py`): CNN takes height maps + item dims, outputs a
  Q-value per candidate placement, picks argmax. i.e. **a learned scorer replacing
  our hand-coded `score()`.** Reward = `(pyramid + compactness)/2`, geometry only.
  Also ships heuristic baselines (bottom-left, BAF, BSSF, BLSF) and a **multi-bin
  env with bin replacement** (reference for our multi-container feature).
- Comparison must be **geometry-only** (strip datasets to dims) since DeepPack3D
  can't represent weight/fragile/door.

## Is this an AI project? (framing — the user worried it isn't)

Yes. Search, heuristics, constraint satisfaction, planning, and combinatorial
optimization are **core classical AI** (Russell & Norvig). "AI" ≠ "neural nets".
Container loading is NP-hard; solving it with a constraint-aware heuristic + (future)
metaheuristic search IS an AI project. Neural is optional, not required.
**Neural upgrade path if wanted:** swap `score()` for a learned scorer (a DQN like
DeepPack3D's), keeping our engine as the guaranteed-feasible constraint/decoder
layer. That gives the "learning" angle AND a clean comparison, without discarding
any existing work.

## Engine as a decoder; search & determinism (defense framing)

- **Decoder:** `pack()` maps an *ordering* (the encoding/"genotype", a permutation
  of boxes) → a concrete valid 3D plan + score (the "phenotype"). A search stage
  sits ON TOP, proposing orderings and using our score as fitness. So the single-
  pass engine is the foundation search reuses, not throwaway work.
- **Why single-pass now, not search:** ~50–130 ms (interactive), explainable, and
  deterministic; search costs seconds–minutes, adds randomness, and needs tuning.
- **Determinism (verified — no `Math.random`/time anywhere in the file):** same
  input → same plan. This is why `pack_test.js` can assert exact results, and it's
  a genuine strength (reproducible, debuggable). A future search can stay
  reproducible by fixing the random seed.
- **The "10–15 points":** on the BR (Bischoff–Ratcliff) benchmark we average ~74%
  fill; SOTA metaheuristics reach ~87–93% → we sit ~10–15 percentage points below.
- **The "0.5 cm" (`EPS`):** numerical tolerance for float rounding + real-world
  imprecision; lets touching boxes not read as overlapping. Trade-off: allows up to
  ~0.5 cm overlap/gap — negligible at container scale. Tests use the same EPS.

## Limitations & assumptions register (defense-ready — state these openly)

Difficulty for a committee is naming your own boundaries. Tag: [defensible] = fine
as a scoped simplification, [roadmap] = planned, [fix-now] = quick high-value.

Physical realism:
- **Support is area-only, not center-of-mass.** ≥75% base area, but CoM-over-support
  is never checked → a 75%-at-one-end box could tip. [fix-now candidate — strongest
  likely committee question]
- `maxLoad` is a single scalar (no edge-vs-center load spreading). [defensible]
- Everything is a rectangular cuboid; drums/pipes/ULD contours approximated. [defensible]
- Container is a perfect empty box (no corrugation/wheel wells/reefer). [defensible]

Missing constraints (a plan can pass all checks yet be unshippable):
- **No hard CoG limit** — "Balanced" only *scores* it softly. [roadmap]
- **No axle-load rules** (road/rail). [roadmap]
- **No load securing / bracing / dunnage** space. [defensible/roadmap]
- **No segregation/hazmat**, and **no true "this-side-up"** (only "which axis is
  vertical" — flipping 180° is identical dims). [defensible]

Algorithmic:
- **Greedy, single-pass, order-dependent**; no backtracking except the one fragile
  repair retry → the ~10–15-pt SOTA gap. [roadmap = search stage]
- **Magic numbers:** 75% support threshold and 0.5 cm EPS are chosen, not derived.
  Be ready to justify "why 75%". [defensible]
- **`maxLoad` enforced conservatively** (full weight to every box in the chain) →
  safe but under-fills. [defensible]

Practical/scale:
- ~3,500 pcs ≈ 25 s, single-threaded (freezes UI, Chrome "not responding").
  [roadmap = Web Worker]. CSV robustness on malformed rows deserves an explicit test.

## Roadmap / open threads (agreed or offered — next up)

- **Search stage over item orderings** (GA / local search) using the current
  engine as decoder and its score as fitness — feasible at ~50 ms per solve.
  Teammate's proposal area. **Deliberately kept OUT of the written proposal**
  (user will mention it verbally); do not add it to proposal text.
- DeepPack3D (MIT, RL, Python/TF) as a comparison engine via FastAPI + engine
  dropdown; offline Colab benchmark on identical CSVs.
- Two-stage cartonization/palletization; multi-container splitting.
- Axle-load rules for road/rail; contoured ULD shapes; printable loader sheet.
- Web Worker for large manifests; visual redesign pass.

**Pending offers from the "Crate placement feedback" chat (awaiting user go):**
- **Web Worker** — move `pack()` off the main thread → fixes the freeze / "not
  responding", enables a real progress bar. Highest-value scale fix. `pack()` is
  self-contained (helpers nested), so it's a good candidate to inline into a Blob
  worker even in the single-file HTML.
- **Multi-container / full shipping plan** — THIS IS THE USER'S PART (with the GA
  optimizer). **STATUS: DONE — algorithm + all three UI tasks shipped.** See the
  dedicated section "Multi-container feature (v0.5)" below. Remaining option not
  built: **lowest cost** strategy (needs a cost-per-container column in the fleet
  table — one column + one strategy branch when wanted).
- **Editable base-support threshold** — expose the hard-coded 75% (`ratio < 0.75`
  in `tryPlace`) as a UI setting, like the commercial tools. Quick, high-value,
  directly matches what impressed the user about deeppack.ai.
- **Center-of-mass support check** — upgrade support test from area-only to
  CoM-over-support-region. Strongest realism win; answers the likeliest committee
  question. Ships with a regression assertion.
- **Surface the placement score in the UI** — attach `bestScore` (+ term breakdown)
  to each placed box, show in hover tooltip / manifest → makes "explainable" real
  instead of code-only.
- **Scenario-loader dropdown** — one-click load of easy/medium/tough (auto-selects
  matching container) so no file-browsing mid-demo.
- **Learned-scorer (DQN) experiment** — the neural/AI angle: replace `score()` with
  a learned Q-value, engine stays the feasibility layer. DeepPack3D as blueprint.

**Still open from this cycle (small, nothing blocking):** the 3 tall cabinets in the
tough set stay unshipped as "too big for door" — correct behaviour, worth showing.
Air ULD costs are placeholders. Nobody has visually QA'd the new overview on a real
GPU yet (it was verified headlessly in jsdom with a Three.js stub — geometry maths is
untested by that harness).

**NEXT UP — the GA optimizer is DONE (see "THE OPTIMIZER (v0.6)" above).**
Natural follow-ups now that the search exists: tune population/mutation and report
a convergence curve (great figure for the report); let the search run longer in the
background and stream improvements; try it as the answer to the greedy "last
container is a stub" weakness by giving it a larger evaluation budget; and the
DQN learned-scorer experiment, which now has an obvious slot — swap `score()` the
same way `opts.order` swapped the ordering.

**Done this cycle (so a new chat doesn't re-litigate):** the whole multi-container
feature (fleet table + fleet CSV import + strategy modes + per-container 3D tabs +
shipment summary/exports — see the v0.5 section above), plus multimodal containers
(sea/rail/road/air with per-mode presets + door dims), door-aperture constraint,
3 scenario datasets + guide, ∞/0 + reject-reason + fragile/stackable fixes, UI
readability + Expand button. All with passing `pack_test.js`.

## Proposal status

`intelligent_cargo_loading_proposal_MERGED.docx` — sections 1–7. Section 4
(algorithms + constraints) and 6 (evaluation) are the user's work. Teammate's
Conclusion merged in, reworded to describe the engine that exists.
**User decisions to respect:** no mention of commercial software (EasyCargo,
CubeMaster) or py3dbp; no Genetic Algorithm / Local Search in the proposal text;
results may be cut and presented verbally instead. Dataset and other sections
will be edited by other members.

## Working agreements

- Surgical patches to the HTML, not full regeneration (token economy).
- Engine/algorithm work: strong model, high effort. Cosmetic passes, renames,
  plain text: lower model/effort is fine.
- Every new packing rule ships with a headless regression test.
- The user wants to understand and defend every algorithmic decision; explain
  changes in defense-ready terms and cite literature names.
- The user has repeatedly found real bugs by inspecting the 3D output — take
  their visual observations seriously and verify with code, not reassurance.
