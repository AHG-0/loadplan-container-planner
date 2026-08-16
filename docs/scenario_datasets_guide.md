# Scenario Datasets — Reference & Talking Points

Three hand-built demo datasets, graded by difficulty. All use **realistic densities
(110–251 kg/m³)**, unlike the raw Kaggle set (~2,000 kg/m³), so weight never
artificially dominates and the *packing* is what's being shown.

**Key framing for the meeting:** difficulty in container loading is not about box
count — it's about how much *slack* the constraints have. Four drivers:
heterogeneity (size variety), constraint density (fragile / non-stackable /
orientation / door), fit tightness (cargo volume ÷ container volume), and
multi-drop LIFO ordering. Easy = all four slack; tough = all four bind at once.

| Driver | Easy | Medium | Tough |
|---|---|---|---|
| Box types | 4, uniform | 6, mixed | 11, extreme ratios |
| Fragile / non-stackable | none | some | many |
| Destinations (LIFO) | 1 | 3 | 4 |
| Volume fit | ~54% (loose) | ~45% (loose) | ~80% (tight) |
| Door limits hit | no | no | yes (3 pieces) |
| Outcome | 460/460, 0 rejects | 174/174, 0 rejects | 211/228, all reject types |

---

## Easy — `scenario_easy.csv`

**Target:** 20 ft Standard · **Pieces:** 460 (4 types) · **Volume:** 17.8 m³ ·
**Weight:** 3,615 kg · **Result:** 460/460 packed, **53.8% util**, 0 rejections (~0.1 s)

| Item | L×W×H (cm) | Qty | Notes |
|---|---|---|---|
| Standard carton | 40×30×30 | 120 | stackable, tip |
| Medium box | 60×40×40 | 90 | stackable |
| Small parcel | 30×25×20 | 150 | stackable, tip |
| Book carton | 35×30×25 | 100 | stackable |

All stackable, none fragile, single destination.

**What it demonstrates / what to say:** the baseline. Homogeneous, stackable cargo
with one drop and plenty of spare room — every hard constraint is slack, so the
greedy heuristic fills cleanly with nothing rejected. This is the "it just works"
control case that proves the core placement is correct.

---

## Medium — `scenario_medium.csv`

**Target:** 40 ft Standard · **Pieces:** 174 (6 types) · **Volume:** 30.2 m³ ·
**Weight:** 4,604 kg · **Result:** 174/174 packed, **44.7% util**, 0 rejections (~0.05 s)

| Item | L×W×H (cm) | Qty | Dest | Notes |
|---|---|---|---|---|
| Pallet crate | 120×100×110 | 8 | A | heavy base, Max↑ 500 |
| Appliance box | 80×70×90 | 14 | B | Max↑ 180 |
| Carton large | 60×40×40 | 50 | B | tip |
| Carton small | 40×30×30 | 70 | C | tip |
| Glassware | 50×40×35 | 20 | A | **fragile** (nothing on top) |
| Steel drum | 60×60×90 | 12 | C | **non-stackable** |

**What it demonstrates / what to say:** constraints are now *active* but still
satisfiable. The engine must load fragile items last and put nothing on them, treat
the drums as no-load surfaces, and honor 3-drop LIFO (drop C loaded deepest, drop A
nearest the door for first unload). Everything still fits — but only because ~45%
fill leaves room to obey all those rules. This shows the engine *planning*, not just
stacking.

---

## Tough — `scenario_tough.csv`

**Target:** 40 ft High Cube · **Pieces:** 228 (11 types) · **Volume:** 60.9 m³ ·
**Weight:** 10,267 kg · **Result:** 211/228 packed, **69.1% util** (~0.06 s)
**Rejections:** 3 × too big for door · 10 × stack weight limit · 4 × no stackable surface

| Item | L×W×H (cm) | Qty | Dest | Notes |
|---|---|---|---|---|
| Machinery crate | 220×110×120 | 4 | A | heavy, Max↑ 800 |
| Tall cabinet | 90×80×265 | 3 | A | **265 cm > 260 cm door → rejected** |
| Pallet crate | 120×100×100 | 10 | B | Max↑ 600 |
| Appliance box | 80×70×90 | 18 | B | Max↑ 200 |
| Heavy carton | 60×50×50 | 40 | C | tip |
| Medium carton | 50×40×40 | 50 | C | tip |
| Small parcel | 35×30×25 | 45 | D | tip |
| Glass panel | 120×15×180 | 8 | A | **fragile**, tall/thin |
| Electronics | 55×45×40 | 24 | B | **fragile** |
| Steel drum | 60×60×90 | 16 | C | **non-stackable** |
| Pipe bundle | 300×20×20 | 10 | D | long, awkward |

**What it demonstrates / what to say:** multiple hard constraints binding at once on
a tight (~80% full) load. Extreme aspect ratios (3 m pipes, tall thin panels) leave
awkward gaps; the high fragile/non-stackable fraction kills stacking surfaces;
4-drop LIFO fragments placement; and the tall cabinets physically can't pass through
the 260 cm door, so they're rejected regardless of packing skill. This one surfaces
**every rejection reason** the engine has, including the new door constraint, and is
exactly where a future search stage would raise utilization.

---

## One-line summary

The datasets are graded by **constraint slack, not box count** — a 460-piece "easy"
set packs perfectly, while a 228-piece "tough" set leaves 17 behind because fragile,
non-stackable, door, and tight-fit constraints all bind together.
