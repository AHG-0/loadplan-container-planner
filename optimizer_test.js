/* =============================================================================
   optimizer_test.js — regression suite for the SEARCH STAGE (GA over orders)
   Run:  node optimizer_test.js [cargo_load_planner_v4.html] [budget_ms]

   The search may only ever help. These checks hold it to that:
     1. never worse than the heuristic baseline (elitism actually works)
     2. deterministic — same seed, same answer (fixed-seed reproducibility)
     3. the returned order really reproduces the fitness it reported
        (re-decoded independently here, not taken on trust)
     4. every plan it produces is still physically valid — the search cannot
        buy utilization by breaking a constraint
     5. it measurably improves at least one real dataset
     6. the shipment scope can reduce container count / cost
   ========================================================================== */
const fs = require("fs");
const HTML = process.argv[2] || "cargo_load_planner_v4.html";
const BUDGET = +(process.argv[3] || 3000);
const html = fs.readFileSync(HTML, "utf8");

function braceMatch(from) {
  let d = 0;
  for (let j = html.indexOf("{", from); j < html.length; j++) {
    if (html[j] === "{") d++;
    else if (html[j] === "}") { d--; if (!d) return j + 1; }
  }
  throw new Error("unbalanced braces");
}
function fn(name) {
  const i = html.indexOf("function " + name + "(");
  if (i < 0) throw new Error("function not found: " + name);
  return html.slice(i, braceMatch(i));
}
function decl(name) {                       // const X = {...};  const X = (a,b) => {...};  const X = expr;
  const i = html.indexOf("const " + name);
  if (i < 0) throw new Error("const not found: " + name);
  const eq = html.indexOf("=", i);
  const firstLine = html.slice(i, html.indexOf("\n", i));
  const code = firstLine.replace(/\/\/.*$/, "").trimEnd();   // ignore trailing comments
  if (code.endsWith("{")) return html.slice(i, braceMatch(eq)) + ";";
  return firstLine;
}
const APP = new Function([
  decl("SHIP_STRATEGY"), fn("mulberry32"), fn("loadDepth"), fn("fitnessOf"), decl("fitBetter"),
  fn("searchOrders"), fn("pack"), fn("planShipment"), fn("heuristicRanks"),
  "return { pack, planShipment, searchOrders, fitnessOf, fitBetter, mulberry32, heuristicRanks };"
].join("\n"))();
const { pack, planShipment, searchOrders, fitnessOf, fitBetter, heuristicRanks } = APP;

const load = f => {
  const L = fs.readFileSync(f, "utf8").trim().split(/\r?\n/);
  const H = L[0].split(","), ix = n => H.indexOf(n);
  return L.slice(1).map(c => { const x = c.split(",");
    return { name:x[ix("name")], l:+x[ix("length_cm")], w:+x[ix("width_cm")], h:+x[ix("height_cm")],
             kg:+x[ix("weight_kg")], qty:+x[ix("qty")], fragile:x[ix("fragile")]==="True",
             stackable:x[ix("stackable")]!=="False", tip:x[ix("tip")]==="True",
             maxLoad:+x[ix("max_load_kg")], pri:+x[ix("priority")], dest:x[ix("destination")] }; });
};

let fail = 0;
const bad = m => { console.log("  ✗ FAIL:", m); fail++; };
const ok  = m => console.log("  ·", m);
const EPS = 0.5;

/* independent physics re-check, same discipline as pack_test.js */
function verify(plan, cont, label, rows) {
  const P = plan.placed;
  for (const b of P)
    if (b.x < -EPS || b.y < -EPS || b.z < -EPS ||
        b.x+b.l > cont.L+EPS || b.y+b.h > cont.H+EPS || b.z+b.w > cont.W+EPS)
      bad(`${label}: ${b.name}#${b.pieceNo} out of bounds`);
  for (let a = 0; a < P.length; a++) for (let c = a+1; c < P.length; c++) {
    const A = P[a], B = P[c];
    if (A.x < B.x+B.l-EPS && A.x+A.l > B.x+EPS && A.y < B.y+B.h-EPS && A.y+A.h > B.y+EPS &&
        A.z < B.z+B.w-EPS && A.z+A.w > B.z+EPS) bad(`${label}: overlap ${A.name}/${B.name}`);
  }
  for (const b of P) {
    if (b.y <= EPS) continue;
    let area = 0;
    for (const t of P) {
      if (t === b || Math.abs(t.y + t.h - b.y) > EPS) continue;
      const ox = Math.min(b.x+b.l, t.x+t.l) - Math.max(b.x, t.x);
      const oz = Math.min(b.z+b.w, t.z+t.w) - Math.max(b.z, t.z);
      if (ox > 0 && oz > 0) {
        area += ox*oz;
        if (t.fragile) bad(`${label}: ${b.name}#${b.pieceNo} rests on fragile ${t.name}`);
        if (t.step >= b.step) bad(`${label}: ${b.name}#${b.pieceNo} sequenced before its support`);
      }
    }
    if (area/(b.l*b.w) < 0.75 - 1e-6) bad(`${label}: ${b.name}#${b.pieceNo} support ${(100*area/(b.l*b.w)).toFixed(0)}%`);
  }
  const kg = P.reduce((s,b) => s+b.kg, 0);
  if (kg > cont.maxKg + 1e-6) bad(`${label}: payload ${kg} > ${cont.maxKg}`);
}

const HC = { name:"40 ft High Cube", L:1202, W:235, H:270, doorW:234, doorH:260, maxKg:26460, cost:4450 };
const ISO = [
  { name:"20 ft Standard",  L:590,  W:235, H:239, doorW:234, doorH:229, maxKg:28230, cost:2800, count:null },
  { name:"40 ft Standard",  L:1203, W:235, H:239, doorW:234, doorH:229, maxKg:26700, cost:4255, count:null },
  { name:"40 ft High Cube", L:1202, W:235, H:270, doorW:234, doorH:260, maxKg:26460, cost:4450, count:null },
  { name:"45 ft High Cube", L:1357, W:235, H:270, doorW:234, doorH:260, maxKg:27700, cost:4950, count:null },
];

console.log(`\nSearch stage — budget ${BUDGET} ms per run\n`);

/* ===== 1-4. single container ============================================= */
for (const file of ["scenario_tough.csv", "scenario_medium.csv"]) {
  if (!fs.existsSync(file)) { console.log(`(skipped ${file})`); continue; }
  const rows = load(file);
  const opts = {};
  console.log(`${file} → ${HC.name} (${rows.length} cargo types, ${rows.reduce((s,r)=>s+r.qty,0)} pieces)`);

  const withOrder = order => order == null ? opts : { ...opts, order };
  const evaluate = order => fitnessOf("container", pack(HC, rows, "fill", withOrder(order)), opts);
  const res  = searchOrders(rows.length, evaluate, { budgetMs: BUDGET, seed: 12345,
                                                     baselineOrder: heuristicRanks(rows) });
  const base = pack(HC, rows, "fill", opts);
  const best = pack(HC, rows, "fill", { ...opts, order: res.order });
  const volOf = p => p.placed.reduce((v,b) => v + b.l*b.w*b.h, 0);
  const util = p => (volOf(p) / (HC.L*HC.W*HC.H) * 100).toFixed(1) + "%";

  console.log(`  baseline ${util(base)} (${base.placed.length} pcs) → best ${util(best)} ` +
              `(${best.placed.length} pcs) · ${res.evals} orders / ${res.gens} generations`);

  // 1. never worse — and the baseline must be the REAL heuristic plan, not row order
  const trueBase = fitnessOf("container", base, opts);
  if (JSON.stringify(res.baseFit) !== JSON.stringify(trueBase))
    bad(`baseFit is not the no-order plan: ${res.baseFit} vs ${trueBase}`);
  else ok("baseline measured against the actual heuristic plan (no order hook)");
  if (fitBetter(res.baseFit, res.fit)) bad("search returned a plan WORSE than the heuristic baseline");
  else ok("never worse than the baseline (elitism holds)");

  // 3. the reported fitness is reproducible from the returned order
  const reFit = fitnessOf("container", best, opts);
  if (JSON.stringify(reFit) !== JSON.stringify(res.fit))
    bad(`returned order does not reproduce the reported fitness: ${reFit} vs ${res.fit}`);
  else ok("returned order reproduces the reported fitness exactly");

  // 4. the improved plan is still physically legal
  verify(best, HC, file, rows);
  ok("optimized plan passes the full physics re-check");

  // 2. determinism
  const again = searchOrders(rows.length, evaluate, { budgetMs: BUDGET, seed: 12345,
                                                     baselineOrder: heuristicRanks(rows) });
  if (JSON.stringify(again.fit) !== JSON.stringify(res.fit))
    bad("same seed gave a different result — search is not reproducible");
  else ok("deterministic under a fixed seed");

  // a different seed must be allowed to differ (it is a stochastic search)
  const other = searchOrders(rows.length, evaluate, { budgetMs: BUDGET, seed: 999,
                                                     baselineOrder: heuristicRanks(rows) });
  if (fitBetter(res.baseFit, other.fit)) bad("seed 999 fell below the baseline");
  else ok(`a different seed also stays >= baseline (${(volOf(pack(HC, rows, "fill", { order: other.order }))/1e6).toFixed(2)} m³)`);

  if (res.improved) ok(`IMPROVED: ${util(base)} → ${util(best)} volume utilization`);
  else console.log("    (no improvement found on this set within the budget — allowed, not a failure)");
  console.log("");
}

/* ===== 5. improvement must happen somewhere ============================== */
{
  const rows = load("scenario_tough.csv");
  const opts = {};
  const evaluate = order => fitnessOf("container", pack(HC, rows, "fill", order == null ? opts : { ...opts, order }), opts);
  const res = searchOrders(rows.length, evaluate, { budgetMs: Math.max(BUDGET, 4000), seed: 12345,
                                                    baselineOrder: heuristicRanks(rows) });
  if (!res.improved) bad("the search found no improvement at all on the tough set — check the order hook");
  else ok(`search demonstrably beats the heuristic on the tough set (+${
    (((res.fit[0] - res.baseFit[0]) / res.baseFit[0]) * 100).toFixed(1)}% volume)`);
}

/* ===== 6. shipment scope ================================================= */
{
  const rows = [...load("scenario_tough.csv"), ...load("scenario_medium.csv")];
  const opts = { strategy: "fewest" };
  console.log(`\nShipment scope — ${rows.length} types / ${rows.reduce((s,r)=>s+r.qty,0)} pieces, full ISO fleet`);
  const evaluate = order =>
    fitnessOf("shipment", planShipment(ISO, rows, "fill", order == null ? opts : { ...opts, order }), opts);
  const res  = searchOrders(rows.length, evaluate, { budgetMs: Math.max(BUDGET, 4000), seed: 12345,
                                                     baselineOrder: heuristicRanks(rows) });
  const base = planShipment(ISO, rows, "fill", opts);
  const best = planShipment(ISO, rows, "fill", { ...opts, order: res.order });
  console.log(`  baseline ${base.summary.containersUsed} containers / ${base.summary.placedPieces} pcs ` +
              `→ best ${best.summary.containersUsed} containers / ${best.summary.placedPieces} pcs ` +
              `· ${res.evals} orders`);
  const trueShipBase = fitnessOf("shipment", base, opts);
  if (JSON.stringify(res.baseFit) !== JSON.stringify(trueShipBase))
    bad(`shipment baseFit is not the no-order plan: ${res.baseFit} vs ${trueShipBase}`);
  else ok("shipment baseline measured against the actual heuristic plan");
  if (fitBetter(res.baseFit, res.fit)) bad("shipment search returned a worse plan than the baseline");
  else ok("shipment search never worse than the baseline");
  if (res.improved && best.summary.containersUsed < base.summary.containersUsed)
    ok(`search REMOVED a container: ${base.summary.containersUsed} -> ${best.summary.containersUsed}`);
  const reFit = fitnessOf("shipment", best, opts);
  if (JSON.stringify(reFit) !== JSON.stringify(res.fit))
    bad(`shipment order does not reproduce its fitness: ${reFit} vs ${res.fit}`);
  else ok("shipment order reproduces the reported fitness (order survives the per-round regrouping)");
  best.containers.forEach((c, i) => verify(c.plan, c.type, `ship c${i+1}`, rows));
  ok("every container in the optimized shipment passes the physics re-check");
  /* Loadability: the empty space must end up at the DOOR, not behind the cargo.
     Measured as the volume-weighted centroid along the length — it must stay in
     the front half, i.e. the search may not turn a wedge into a floating block. */
  best.containers.forEach((c, i) => {
    const v = c.plan.placed.reduce((s,b) => s + b.l*b.w*b.h, 0);
    const m = c.plan.placed.reduce((s,b) => s + b.l*b.w*b.h * (b.x + b.l/2), 0);
    const centroid = v ? (m / v) / c.type.L : 0;
    if (centroid > 0.5)
      bad(`optimized container #${i+1}: load centroid at ${(centroid*100).toFixed(0)}% of the length — void is behind the cargo, not at the door`);
    else ok(`container #${i+1} loads far-wall first (centroid ${(centroid*100).toFixed(0)}% of length, void at the door)`);
  });
  const seen = {}, orig = {};
  rows.forEach(r => orig[r.name] = (orig[r.name] || 0) + r.qty);
  best.containers.forEach(c => c.plan.placed.forEach(b => seen[b.name] = (seen[b.name] || 0) + 1));
  best.leftoverRows.forEach(r => seen[r.name] = (seen[r.name] || 0) + r.qty);
  for (const t in orig) if ((seen[t] || 0) !== orig[t]) bad(`conservation ${t}: ${seen[t]||0} vs ${orig[t]}`);
  ok("no piece created or lost by the search");
}

console.log(fail === 0 ? "\nOPTIMIZER CHECKS PASS ✓\n" : `\n${fail} FAILURE(S) ✗\n`);
process.exit(fail ? 1 : 0);
