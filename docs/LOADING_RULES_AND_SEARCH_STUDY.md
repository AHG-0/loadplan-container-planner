# What an ideal load plan actually is — and which optimizer to use

A study written to settle two questions: **what rules should the engine follow**
(single and multi-container), and **is a genetic algorithm the right search**.
Everything claimed here was either taken from industry practice / the literature,
or measured on our own datasets with the numbers reproduced below.

---

## Part 1 — What real load planners do

Industry guidance is remarkably consistent across freight forwarders, container
lines and commercial planning software. The rules that matter:

| Practice rule | Why | Our engine |
|---|---|---|
| **Heavy at the bottom, light on top** | Stability, lower centre of gravity, prevents crushing | Partly — the `low` term prefers low placement, but it is not weighted by mass |
| **Weight spread evenly across the floor, not concentrated** | Floor loading limits; axle/trim compliance | Partly — `ctr` centres across the width; no axle model |
| **Fragile on top, never loaded under heavy cargo** | Damage prevention | **Yes** — hard constraint (nothing may rest on fragile) + `fTop` reward |
| **Non-stackable goods must have nothing above them** | Product/packaging integrity | **Yes** — hard constraint via `maxLoad = 0` |
| **Fill voids; block, brace or lash the load** (CTU Code) | Cargo shifts in transit | **No** — dunnage and securing are out of scope; `snug` only *prefers* tight fits |
| **Load in unloading order, last drop deepest** | Multi-drop routes | **Yes** — destination grouping (LIFO) |
| **Respect payload and door aperture** | Legal / physical | **Yes** — both are hard constraints |
| **Segregate incompatible/hazmat cargo** | Regulation | **No** — declared limitation |

**So what is an "ideal" plan?** Not simply the fullest one. In practice a plan is
good when, in this order: (1) everything that must ship is aboard, (2) nothing is
crushed or unstable, (3) it can be unloaded in the right order, (4) the space
bought is used well, and (5) it costs the least. Our objectives are lexicographic
for exactly this reason — utilization is never allowed to buy its way past a
safety rule, because the safety rules are hard constraints in the decoder rather
than terms in a score.

---

## Part 2 — The non-stackable question, measured

**The observation:** the ordering rule demoted only `fragile` items to the back of
the queue, on the argument that placing something early that can bear no load
kills the whole column above it. But **non-stackable items carry exactly the same
`maxLoad = 0`** — a steel drum blocks a column just as hard as a crate of glass.
Treating them differently was an inconsistency, not a decision.

Two ways to act on "non-stackables belong on top" were tested:

- **C — sequence:** offer every no-load piece (fragile *or* non-stackable) last.
- **G — score:** extend the existing `fTop` reward (which pays fragile items for
  being placed high) to all no-load pieces.

Test bed: 24 runs — `tough`, `medium`, `tough+medium`, and 600 rows of the Kaggle
set × 40 ft HC and 20 ft Standard × all three modes.

| Variant | Mean utilization | Pieces placed |
|---|---|---|
| A — current (fragile only, last) | 59.61% | 5,861 |
| **C — no-load last (sequence)** | **60.13%** | **6,341 (+8.2%)** |
| G — no-load rewarded high (score) | 59.63% | 5,858 |
| C + G | 60.12% | 6,344 |
| C + G + heavy-low weighting | 60.11% | 6,345 |

**Adopted: C. Rejected: G and heavy-low weighting** — they change essentially
nothing and add explaining to do.

**Why the scoring approach failed, and why that is interesting:** you cannot
score your way into a high position that does not exist. A box can only be placed
high if a stack is already there to support it, and at the moment a no-load piece
is offered, that stack may not have been built yet. Changing *when* the piece is
offered creates those surfaces; changing *how* a position is rewarded cannot.
**In a greedy constructive packer, sequence dominates scoring for this class of
rule** — a good line to have ready, because it is the sort of thing a committee
will poke at.

**The honest caveat.** One case regresses: `tough` alone in a 40 ft HC drops
70.0% → 67.3%, because that set's no-load items include large steel drums and
demoting large items conflicts with the first-fit-decreasing "big things first"
principle. A size-guarded variant (demote only small no-load pieces, thresholds
0.5% / 1% / 2% of container volume) was tried and **did not fix it** — so the
guard was rejected rather than kept as decoration.

What does fix it is the search stage:

| tough / 40 ft HC | Old rule | New rule | New rule + search |
|---|---|---|---|
| Easy load | 70.0% | 67.3% | **72.4%** |
| Max fill | 70.0% | 69.0% | **71.7%** |
| Balanced | 69.6% | 67.5% | **72.4%** |

This is the argument for having both: **the default rule is set by what wins on
average, and the search recovers the cases where the average is wrong** — and by
construction the search can never return something worse than the default.

The 21-dataset BR benchmark is unchanged (72.1 / 74.4 / 74.1%), because those
instances have no non-stackable items — the rule is inert there, exactly as it
should be.

---

## Part 3 — Multi-container: what "ideal" means across a fleet

For a shipment the objective genuinely splits, and no single answer is correct —
which is why container selection is a **mode**, not a rule:

- **Fewest containers** — minimise how many boxes you ship (freight is charged per
  container, so this is usually the cheapest and is the industry default).
- **Max load factor** — no half-empty containers; better per-container economics,
  possibly more of them.
- **Lowest cost** — the honest version of the above once real prices exist, since
  a 40 ft is only ~25% dearer than a 20 ft while holding twice as much.
- **As listed** — the planner knows something the model does not.

Measured on `tough` with the full ISO fleet ("Max fill"):

| Strategy | Containers | Avg utilization | Freight |
|---|---|---|---|
| Fewest containers | 2 × 45 ft HC | 32.1% | 9,900 |
| Max load | 4 × 20 ft Std | 41.7% | 11,200 |
| **Lowest cost** | 40 ft HC + 20 ft Std | 50.5% | **7,250** |

Note that the strategy minimising *containers* is neither the fullest nor the
cheapest. That single table is the best evidence in the project that the mode is a
real decision and not a UI flourish.

**Known weakness, stated plainly:** the fleet is filled greedily, so the last
container opened is always a near-empty stub. That is the obvious target for a
longer search, and it is what the shipment-scope fitness already optimises for.

---

## Part 4 — Is a GA the right optimizer?

### What the literature actually uses

Solution methods for the 3D container loading problem run from simple
constructive heuristics through to sophisticated metaheuristics. The families
that matter here:

- **BRKGA (biased random-key GA)** — a GA where individuals are random keys and a
  *decoder* turns them into solutions. It performs strongly on heterogeneous
  cargo and is one of the standard modern approaches. **Our architecture is
  already BRKGA-shaped**: the GA proposes an ordering, `pack()` decodes it into a
  feasible plan. That is worth saying explicitly at defense.
- **GRASP** — greedy randomised construction plus local search, often with
  path-relinking to combine good solutions.
- **Beam search (BSG)** — a truncated tree search over placements; reported as the
  state of the art for 3D container loading.
- **Hybrids (GA/VND, GA + local search, "memetic")** — combining a population
  method with a local-improvement step is the direction recent work has taken,
  and typically beats either component alone.

### Verdict for this project

**Keep the GA — it is the right family and the right shape — but the honest
answer is that a pure GA is not the strongest possible choice.** Recommended
order of work:

1. **Hybridise into a memetic algorithm (highest value, small change).** After
   each generation, run a short local search (swap / insert neighbourhood,
   first-improvement) on the elite individual. Pure GA explores well and refines
   badly; local search fixes precisely that. This is the single best next step.
2. **Add restarts / diversity control.** Restart from a perturbed elite when the
   best fitness stalls for N generations — cheap insurance against premature
   convergence, and it produces a convergence curve that makes an excellent
   figure for the report.
3. **Consider beam search as a second engine, not a replacement.** It searches
   *placements* rather than *orderings*, so it complements what we have rather
   than competing. It is a bigger build; a good "future work" item, or a
   comparison engine if time allows.
4. **Do not attempt exhaustive search.** With *n* cargo types there are *n!*
   orderings — 12 types is already 479 million — and the problem is NP-hard.
   Being able to say *why* exhaustive search is off the table is itself a mark of
   understanding the problem.

### Why the GA is defensible as it stands

- It **cannot produce an illegal plan**: every physical rule lives in the decoder,
  so no individual the search invents can violate one. The search proposes, the
  engine disposes.
- It **cannot lose**: the current heuristic ordering is seeded as individual zero
  and elitism carries the best forward, so the result is ≥ the default plan.
- It is **reproducible**: a seeded PRNG means the same input gives the same
  answer, which is unusual for a metaheuristic and worth pointing out.
- It **demonstrably works**: +8.4% loaded volume on the tough set, and it recovers
  the one case where the new ordering rule regresses.

---

## Summary of decisions

| Decision | Basis |
|---|---|
| No-load pieces (fragile **and** non-stackable) offered last | Measured: +0.52 pts utilization, +8.2% pieces over 24 runs |
| Rejected: rewarding no-load pieces for height via `fTop` | Measured: no effect (+0.02 pts, −3 pieces) |
| Rejected: weighting the `low` term by mass | Measured: no effect on utilization or centre-of-gravity height |
| Rejected: size-guarded demotion | Measured: does not fix the one regression it was designed for |
| Keep the GA, hybridise with local search next | Literature consensus; our decoder architecture is already BRKGA-shaped |
| Container selection stays a user-chosen mode | The three objectives genuinely disagree — see the fleet table above |

Sources: [Drewry World Container Index](https://www.drewry.co.uk/supply-chain-advisors/supply-chain-expertise/world-container-index-assessed-by-drewry) ·
[Xeneta — FEU/TEU spreads](https://www.xeneta.com/blog/dramatic-increases-in-feu-and-teu-ocean-container-market-spreads-key-considerations-for-shippers) ·
[Container stuffing best practice](https://www.loadoptimizer.ai/blog/container-stuffing-guide/) ·
[Container loading guidance](https://incodocs.com/blog/container-loading/) ·
[MagicLogic — container planning](https://magiclogic.com/container-planning/) ·
[A 3D container loading algorithm for logistics packing (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S2192437625000160) ·
[Optimization models for the 3D CLP with practical constraints (Springer)](https://link.springer.com/chapter/10.1007/978-1-4614-4469-5_12) ·
[Hybrid multi-objective 3D container loading](https://www.researchgate.net/publication/383597071_A_hybrid_Multi-Objective_Optimization_Approach_for_Efficient_3D_Container_Loading_Problem) ·
[Fast optimization for a real-life 3D multiple bin-size bin packing problem (arXiv)](https://arxiv.org/pdf/2410.01445)
