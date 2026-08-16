/* =============================================================================
   multi_pack_test.js — headless regression suite for the MULTI-CONTAINER layer
   Run:  node multi_pack_test.js [cargo_load_planner_v4.html]

   Same discipline as pack_test.js: the checks independently recompute what the
   shipment claims (conservation of pieces, payload per container, fleet counts)
   from the returned coordinates — engine internals are never trusted.

   Covers:
     1. every container-selection strategy (fewest / maxload / listed)
     2. piece conservation, payload caps, fleet count limits
     3. the "maxload" contract: the container opened first really is the
        highest-load-factor choice among the available types
     4. determinism (same fleet + manifest => identical plan)
     5. the fleet CSV importer on m2's real spec-sheet file (metres, semicolons,
        missing max_kg / count columns)
   ========================================================================== */
const fs = require("fs");
const path = require("path");
const HTML_PATH = process.argv[2] || "cargo_load_planner_v4.html";
const html = fs.readFileSync(HTML_PATH, "utf8");

/* ---- extract source pieces out of the single-file app ------------------- */
function braceMatch(from) {                       // index just past the matching }
  let d = 0;
  for (let j = html.indexOf("{", from); j < html.length; j++) {
    if (html[j] === "{") d++;
    else if (html[j] === "}") { d--; if (!d) return j + 1; }
  }
  throw new Error("unbalanced braces from " + from);
}
function fn(name) {                               // function declaration + body
  const i = html.indexOf("function " + name + "(");
  if (i < 0) throw new Error("function not found: " + name);
  return html.slice(i, braceMatch(i));
}
function decl(name) {                             // const NAME = {...};  or  const NAME = <expr>;
  const i = html.indexOf("const " + name);
  if (i < 0) throw new Error("const not found: " + name);
  const eq = html.indexOf("=", i);
  if (html.slice(eq + 1).trimStart().startsWith("{")) return html.slice(i, braceMatch(eq)) + ";";
  return html.slice(i, html.indexOf("\n", i));
}

const src = [
  decl("PRESETS"), decl("SHIP_STRATEGY"), decl("FLEET_ALIASES"),
  decl("DEFAULT_FLEET_KG"), decl("PRESET_COST"), decl("toCm"),
  fn("pack"), fn("planShipment"),
  fn("parseCsvText"), fn("knownMaxKg"), fn("knownCost"), fn("fleetModeOf"), fn("parseFleetCsv"),
  "return { pack, planShipment, parseFleetCsv, knownMaxKg, knownCost, PRESETS, SHIP_STRATEGY, PRESET_COST };"
].join("\n");
const APP = new Function(src)();
const { pack, planShipment, parseFleetCsv } = APP;

/* ---- load the tough scenario as the manifest under test ----------------- */
function loadCargo(file) {
  const L = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const H = L[0].split(","), ix = n => H.indexOf(n);
  return L.slice(1).map(c => {
    const x = c.split(",");
    return { name:x[ix("name")], l:+x[ix("length_cm")], w:+x[ix("width_cm")], h:+x[ix("height_cm")],
             kg:+x[ix("weight_kg")], qty:+x[ix("qty")],
             fragile:x[ix("fragile")] === "True", stackable:x[ix("stackable")] !== "False",
             tip:x[ix("tip")] === "True", maxLoad:+x[ix("max_load_kg")],
             pri:+x[ix("priority")], dest:x[ix("destination")] };
  });
}
const rows = loadCargo("scenario_tough.csv");
const totalPieces = rows.reduce((s, r) => s + r.qty, 0);
const orig = {}; rows.forEach(r => orig[r.name] = (orig[r.name] || 0) + r.qty);

let fail = 0;
const bad = m => { console.log("  ✗ FAIL:", m); fail++; };
const ok  = m => console.log("  ·", m);

/* ---- independent checks recomputed from the returned plan --------------- */
function checkConservation(P, tag) {
  const seen = {};
  P.containers.forEach(c => c.plan.placed.forEach(b => seen[b.name] = (seen[b.name] || 0) + 1));
  P.leftoverRows.forEach(r => seen[r.name] = (seen[r.name] || 0) + r.qty);
  for (const t in orig) if ((seen[t] || 0) !== orig[t]) bad(`${tag} conservation ${t}: ${seen[t] || 0} vs ${orig[t]}`);
  if (P.summary.placedPieces + P.summary.leftoverPieces !== totalPieces)
    bad(`${tag} total mismatch: ${P.summary.placedPieces}+${P.summary.leftoverPieces} != ${totalPieces}`);
}
function checkPayload(P, tag) {
  P.containers.forEach((c, i) => {
    const kg = c.plan.placed.reduce((s, b) => s + b.kg, 0);
    if (kg > c.type.maxKg + 1e-6) bad(`${tag} container #${i+1} payload ${kg} > ${c.type.maxKg}`);
  });
}
function checkFits(P, tag) {                      // every box inside its own container
  P.containers.forEach((c, i) => c.plan.placed.forEach(b => {
    if (b.x < -0.5 || b.y < -0.5 || b.z < -0.5 ||
        b.x + b.l > c.type.L + 0.5 || b.y + b.h > c.type.H + 0.5 || b.z + b.w > c.type.W + 0.5)
      bad(`${tag} container #${i+1}: "${b.name}" out of bounds`);
  }));
}
function checkCounts(P, fleet, tag) {
  const used = {};
  P.containers.forEach(c => used[c.type.name] = (used[c.type.name] || 0) + 1);
  fleet.forEach(f => {
    if (f.count != null && (used[f.name] || 0) > f.count)
      bad(`${tag} used ${used[f.name]} × "${f.name}" but only ${f.count} available`);
  });
}
const utilOf = P => (P.summary.avgUtil * 100).toFixed(1) + "%";

/* ---- fleets ------------------------------------------------------------- */
const ISO = [
  { name:"20 ft Standard",  L:590,  W:235, H:239, doorW:234, doorH:229, maxKg:28230, cost:2800, count:null },
  { name:"40 ft Standard",  L:1203, W:235, H:239, doorW:234, doorH:229, maxKg:26700, cost:4255, count:null },
  { name:"40 ft High Cube", L:1202, W:235, H:270, doorW:234, doorH:260, maxKg:26460, cost:4450, count:null },
  { name:"45 ft High Cube", L:1357, W:235, H:270, doorW:234, doorH:260, maxKg:27700, cost:4950, count:null },
];
const ONLY20 = [{ ...ISO[0] }];

console.log(`\nManifest: scenario_tough.csv — ${rows.length} types / ${totalPieces} pieces\n`);

/* ===== 1. single-type fleet, unlimited: must open several containers ===== */
console.log("Fleet A — 20 ft Standard × unlimited");
const A = planShipment(ONLY20, rows, "fill", {});
console.log(`  ${A.summary.containersUsed} containers · ${A.summary.placedPieces} placed · ` +
            `${A.summary.leftoverPieces} leftover · avg util ${utilOf(A)}`);
console.log("  leftover:", A.leftoverRows.map(r => `${r.qty}× ${r.name} (${r.reason})`).join(", ") || "none");
checkConservation(A, "A"); checkPayload(A, "A"); checkFits(A, "A");
if (A.summary.containersUsed < 2) bad("A expected at least 2 containers");

/* ===== 2. every strategy on the full ISO fleet =========================== */
const runs = {};
for (const strategy of Object.keys(APP.SHIP_STRATEGY)) {
  console.log(`\nFleet B — full ISO × unlimited · strategy "${strategy}"`);
  const P = planShipment(ISO, rows, "fill", { strategy });
  runs[strategy] = P;
  console.log(`  ${P.summary.containersUsed} containers ${JSON.stringify(P.summary.usageByType)} · ` +
              `${P.summary.placedPieces} placed · ${P.summary.leftoverPieces} leftover · avg util ${utilOf(P)}`);
  console.log("  leftover:", P.leftoverRows.map(r => `${r.qty}× ${r.name} (${r.reason})`).join(", ") || "none");
  checkConservation(P, strategy); checkPayload(P, strategy); checkFits(P, strategy);
  if (P.summary.strategy !== strategy) bad(`${strategy}: summary reports "${P.summary.strategy}"`);
}

/* ===== 3. strategy contracts ============================================= */
console.log("\nStrategy contracts");
// "fewest" must open the largest container in the fleet first (bin-level FFD).
{
  const biggest = [...ISO].sort((a, b) => b.L*b.W*b.H - a.L*a.W*a.H)[0];
  const chosen = runs.fewest.containers[0].type.name;
  if (chosen !== biggest.name) bad(`fewest opened "${chosen}", expected the largest "${biggest.name}"`);
  else ok(`fewest opens the largest container first (${biggest.name})`);
}
// "maxload" must open the highest-load-factor container — recompute every
// candidate independently and confirm the chosen one is the argmax.
{
  const cands = ISO.map(t => {
    const p = pack(t, rows, "fill", {});
    return { name:t.name, ratio: p.placed.reduce((v, b) => v + b.l*b.w*b.h, 0) / (t.L*t.W*t.H) };
  }).sort((a, b) => b.ratio - a.ratio);
  const chosen = runs.maxload.containers[0].type.name;
  console.log("  load factors:", cands.map(c => `${c.name} ${(c.ratio*100).toFixed(1)}%`).join(" · "));
  if (Math.abs(cands.find(c => c.name === chosen).ratio - cands[0].ratio) > 1e-9)
    bad(`maxload opened "${chosen}" but "${cands[0].name}" has the higher load factor`);
  else ok(`maxload opens the highest-load-factor container (${chosen})`);
}
// "listed" must respect table order: first listed type that holds anything.
{
  const listedFirst = ISO.find(t => pack(t, rows, "fill", {}).placed.length > 0).name;
  const chosen = runs.listed.containers[0].type.name;
  if (chosen !== listedFirst) bad(`listed opened "${chosen}", expected "${listedFirst}"`);
  else ok(`listed opens the first usable container in table order (${listedFirst})`);
}
// "cheapest" must open the container with the lowest price per m³ actually loaded.
{
  const cands = ISO.map(t => {
    const p = pack(t, rows, "fill", {});
    const vol = p.placed.reduce((v, b) => v + b.l*b.w*b.h, 0) / 1e6;   // m³
    return { name:t.name, per: t.cost / vol };
  }).sort((a, b) => a.per - b.per);
  const chosen = runs.cheapest.containers[0].type.name;
  console.log("  cost per m³ loaded:", cands.map(c => `${c.name} ${c.per.toFixed(2)}`).join(" · "));
  if (Math.abs(cands.find(c => c.name === chosen).per - cands[0].per) > 1e-9)
    bad(`cheapest opened "${chosen}" but "${cands[0].name}" is cheaper per m³`);
  else ok(`cheapest opens the lowest cost-per-m³ container (${chosen})`);
  const bill = runs.cheapest.containers.reduce((s, c) => s + c.type.cost, 0);
  if (runs.cheapest.summary.totalCost !== bill)
    bad(`totalCost ${runs.cheapest.summary.totalCost} != sum of container prices ${bill}`);
  else if (!runs.cheapest.summary.costed) bad("costed flag should be true when every container is priced");
  else ok(`freight bill adds up: ${bill.toLocaleString()} over ${runs.cheapest.summary.containersUsed} container(s)`);
  // an unpriced fleet must not claim a cost
  const free = planShipment(ISO.map(t => ({ ...t, cost:0 })), rows, "fill", { strategy:"fewest" });
  if (free.summary.costed || free.summary.totalCost !== 0)
    bad("an unpriced fleet must report costed=false and no total");
  else ok("unpriced fleet reports no freight cost instead of a fake one");
}

/* ===== 4. count limits are respected, leftovers explained ================ */
console.log("\nFleet C — 40 ft Standard × 1 only (fleet deliberately too small)");
const C_FLEET = [{ ...ISO[1], count: 1 }];
const C = planShipment(C_FLEET, rows, "fill", {});
console.log(`  ${C.summary.containersUsed} containers · ${C.summary.placedPieces} placed · ` +
            `${C.summary.leftoverPieces} leftover`);
checkConservation(C, "C"); checkPayload(C, "C"); checkCounts(C, C_FLEET, "C");
if (C.summary.containersUsed !== 1) bad(`C used ${C.summary.containersUsed} containers, only 1 was available`);
if (!C.summary.leftoverPieces) bad("C expected leftovers with a single 40 ft Standard");
else if (!C.leftoverRows.every(r => r.reason === "no container left in the fleet"))
  bad("C leftovers should be explained by the exhausted fleet, got: " +
      [...new Set(C.leftoverRows.map(r => r.reason))].join(" / "));
else ok(`count limit honoured · ${C.summary.leftoverPieces} piece(s) reported as "no container left in the fleet"`);

/* ===== 5. determinism ==================================================== */
{
  const sig = P => JSON.stringify(P.containers.map(c =>
    [c.type.name, c.plan.placed.map(b => [b.name, b.x, b.y, b.z])]));
  if (sig(planShipment(ISO, rows, "fill", { strategy:"maxload" })) !== sig(runs.maxload))
    bad("planShipment is not deterministic across runs");
  else ok("deterministic: identical plan on a repeat run");
}

/* ===== 6. fleet CSV importer on m2's real file =========================== */
console.log("\nFleet CSV importer — m2's container.csv (semicolons, metres, no max_kg/count)");
const m2 = path.join("Teammates", "container.csv");
if (!fs.existsSync(m2)) {
  console.log("  (skipped — Teammates/container.csv not found)");
} else {
  const { rows: F, warn } = parseFleetCsv(fs.readFileSync(m2, "utf8"));
  console.log(`  parsed ${F.length} container types` +
              (warn.kg.length ? ` · payload defaulted for: ${warn.kg.join(", ")}` : " · all payloads recovered from the presets") +
              (warn.door.length ? ` · door defaulted for: ${warn.door.join(", ")}` : ""));
  F.forEach(f => console.log(`    ${f.mode.padEnd(4)} ${f.name.padEnd(18)} ${f.L}×${f.W}×${f.H} cm · ` +
    `door ${f.doorW}×${f.doorH} · ${f.maxKg} kg · count ${f.count === null ? "∞" : f.count}`));
  if (F.length !== 8) bad(`expected 8 container types, got ${F.length}`);
  if (warn.kg.length) bad(`payload not recovered for: ${warn.kg.join(", ")}`);
  const unpriced = F.filter(f => !(f.cost > 0)).map(f => f.name);
  if (unpriced.length) bad(`cost not recovered for: ${unpriced.join(", ")}`);
  else ok("illustrative freight costs filled in for every imported type");
  F.forEach(f => {
    if (f.L < 50 || f.W < 50 || f.H < 50) bad(`"${f.name}" looks like metres, not cm: ${f.L}×${f.W}×${f.H}`);
    if (f.doorW > f.W || f.doorH > f.H) bad(`"${f.name}" door ${f.doorW}×${f.doorH} exceeds interior ${f.W}×${f.H}`);
    if (f.count !== null) bad(`"${f.name}" count should default to unlimited, got ${f.count}`);
    if (!(f.maxKg > 0)) bad(`"${f.name}" has no payload`);
  });
  const std20 = F.find(f => /20/.test(f.name));
  if (!std20 || std20.L !== 590 || std20.W !== 235 || std20.H !== 239)
    bad(`20 ft Standard should convert to 590×235×239 cm, got ${std20 && [std20.L, std20.W, std20.H].join("×")}`);
  else ok("metres → cm conversion matches the built-in preset (590×235×239)");
  const modes = [...new Set(F.map(f => f.mode))].sort().join(",");
  if (modes !== "air,land,sea") bad(`unexpected transport modes: ${modes}`);
  else ok("transport modes mapped: sea & rail → sea, road → land, air → air");

  const D = planShipment(F.filter(f => f.mode === "sea"), rows, "fill", { strategy:"fewest" });
  console.log(`  planned from the imported fleet: ${D.summary.containersUsed} containers · ` +
              `${D.summary.placedPieces}/${totalPieces} pieces · avg util ${utilOf(D)}`);
  checkConservation(D, "imported"); checkPayload(D, "imported"); checkFits(D, "imported");
}

/* ===== 7. our own template schema (cm, commas, explicit counts) ========== */
{
  const csv = "mode,name,length_cm,width_cm,height_cm,door_w_cm,door_h_cm,max_kg,count\n" +
              "sea,20 ft Standard,590,235,239,234,229,28230,2\n" +
              "sea,40 ft High Cube,1202,235,270,234,260,26460,\n";
  const { rows: F } = parseFleetCsv(csv);
  if (F.length !== 2) bad("template schema: expected 2 rows");
  if (F[0].count !== 2) bad(`template schema: count should be 2, got ${F[0].count}`);
  if (F[1].count !== null) bad("template schema: blank count should mean unlimited");
  if (F[0].L !== 590 || F[1].H !== 270) bad("template schema: centimetre values must pass through unchanged");
  ok("our own cm/comma template parses · blank count = unlimited");
}

console.log(fail === 0 ? "\nMULTI-CONTAINER CHECKS PASS ✓\n" : `\n${fail} FAILURE(S) ✗\n`);
process.exit(fail ? 1 : 0);
