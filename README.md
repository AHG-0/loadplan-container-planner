# LoadPlan — Intelligent Container Load Planner

A container load-planning tool with a 3D "digital twin" view. You give it a cargo
manifest and a fleet of containers; it computes a physically loadable packing
plan, shows it in 3D with a step-by-step loading sequence, and reports what it
could not load **and why**.

**▶ Live demo:** _add your GitHub Pages URL here after enabling Pages_

> Senior project (AI). The whole application is a **single self-contained HTML
> file** — no build step, no server, no install. Open it and it runs.

---

## What it does

- **Multimodal containers** — sea, rail, road and air, each with real interior
  and **door** dimensions from the manufacturer spec sheet.
- **Physically valid packing** — every plan satisfies containment, non-overlap,
  ≥75% base support, "nothing rests on fragile", per-box stack-load limits
  (counted through the whole stack), payload caps, orientation rules, and the
  door aperture.
- **Three packing objectives** — Easy load (wall building), Max fill (compact
  block stowage) and Balanced (low, centred centre of gravity).
- **Multi-container shipments** — spread a manifest across a fleet with four
  selectable strategies: fewest containers, max load factor, lowest cost, or the
  fleet in the order you listed it.
- **A search stage (genetic algorithm)** over loading orders that uses the packer
  as its decoder — so it cannot produce an illegal plan, and it can never return
  something worse than the heuristic.
- **3D digital twin** — per-container tabs, an all-containers overview, hover
  inspection, and a play/scrub loading sequence.
- **Import / export** — cargo CSV (with header aliasing), fleet CSV, and
  JSON/CSV export of plans, shipments and the manifest record.

## Run it

```bash
# just open the file — that is the whole story
open cargo_load_planner_v5.html      # macOS
start cargo_load_planner_v5.html     # Windows
```

Three.js r128 is loaded from a CDN, so the 3D view needs an internet connection
the first time. Everything else runs offline.

## Results

Measured on 21 Bischoff–Ratcliff-style benchmark instances (`node benchmark.js`):

| Objective | Mean volume utilization | Max solve time |
|---|---|---|
| Easy load | 72.1% | ~80 ms |
| Max fill | 74.4% | ~55 ms |
| Balanced | 74.1% | ~45 ms |

**Honest comparison:** published best-known results on genuine BR instances reach
roughly 87–93%. We sit about 10–15 points below that, which is exactly why the
search stage exists.

The three container-selection strategies genuinely disagree — same manifest, same
engine, three different shipping decisions (tough scenario, full ISO fleet):

| Strategy | Containers | Avg utilization | Freight |
|---|---|---|---|
| Fewest containers | 2 × 45 ft HC | 32.1% | 9,900 |
| Max load (load factor) | 4 × 20 ft Std | 41.7% | 11,200 |
| Lowest cost | 40 ft HC + 20 ft Std | 50.5% | **7,250** |

## How it works

**Architecture: filter, then score.** Hard constraints eliminate illegal
positions; soft objectives score the survivors; the best score wins.

1. **Ordering** — constraint-aware first-fit-decreasing: destination group (later
   drops loaded deepest, so unloading is LIFO) → pieces that can bear no load
   last → priority → volume → weight.
2. **Candidate positions** — maximal free spaces (placing a box splits every
   intersecting free cuboid into up to six maximal sub-cuboids) plus
   extreme-point anchors snapped to the corners of supporting boxes.
3. **Selection** — a weighted score over seven normalised terms: support, height,
   depth, centring, flat-top, snugness, and a growth penalty. The three
   objectives are three weight vectors.
4. **Repair** — if fragile cargo is rejected, repack once reserving headroom for
   it, and keep the result only if it fills more volume.
5. **Sequence** — topological sort over the rests-on graph rebuilt from the final
   geometry, so the playback can never show a box floating above a gap.

**The search stage** encodes a candidate as a permutation of the cargo types and
uses `pack()` as the decoder — the same architecture family as a biased
random-key genetic algorithm. Operators are tournament selection, order
crossover, and swap/insert/reverse mutation, with elitism seeded from the
heuristic ordering. It runs in a Web Worker with a **fixed evaluation budget**, so
the same input always produces the same plan.

## Tests

The suites recompute the physics **independently from the output coordinates** —
they never trust the engine's own bookkeeping.

```bash
node pack_test.js       cargo_load_planner_v5.html   # engine invariants
node multi_pack_test.js cargo_load_planner_v5.html   # multi-container layer
node optimizer_test.js  cargo_load_planner_v5.html   # search stage
node benchmark.js       cargo_load_planner_v5.html   # 21-dataset benchmark
node verify_build.js    <any-copy.html>              # did a copy keep everything?
```

`verify_build.js` exists because the team works on copies: it reports missing
functions, changed logic, lost element ids, each named engine fix, and runs every
suite. Nothing gets merged until it is clean. The same suites run automatically on
every push via GitHub Actions.

Every packing rule ships with an assertion. Several real bugs were found this way,
including cargo that could come to rest on a fragile box when the fragile box was
placed *later*, and a loading sequence that was un-loadable in practice.

## Assumptions and limitations

Stated openly, because a load plan that passes every check can still be
unshippable:

- Containers are modelled as **perfect empty cuboids** — no corrugation, wheel
  wells, dents, or the contoured corners of real air ULDs.
- All cargo is a **rectangular cuboid**; cylinders and drums are packed as their
  bounding box.
- Support is measured by **contact area (≥75%)**, not centre-of-mass over the
  support region, so a box supported at one end could still tip in reality.
- **No load securing, dunnage or bracing** space is reserved, and no axle-load,
  hazmat segregation or true "this side up" handling.
- The freight costs shipped with the fleet are **illustrative market figures, not
  quotes** — replace them with your own before drawing conclusions.
- The 75% support threshold and the 0.5 cm numerical tolerance are chosen
  engineering values, not derived ones.

## Repository layout

```
cargo_load_planner_v5.html   the application (this is the whole app)
index.html                   redirect so GitHub Pages serves the app
pack_test.js                 engine regression suite
multi_pack_test.js           multi-container suite
optimizer_test.js            search-stage suite
ui_smoke_test.js             headless UI wiring check (needs: npm i jsdom)
benchmark.js                 runs every dataset in ./datasets
verify_build.js              pre-merge check for a teammate's copy
datasets/                    21 benchmark instances + converter
scenario_*.csv               hand-built demo datasets (easy / medium / tough)
docs/                        design notes, studies, guides
```

## Team

Five members. See `docs/` for the design notes and the written study of loading
rules and search methods.

## License

MIT — see [LICENSE](LICENSE).
