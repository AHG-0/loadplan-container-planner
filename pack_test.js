const fs = require("fs");
const htmlPath = process.argv[2] || "/tmp/build/v4.html";
const html = fs.readFileSync(htmlPath, "utf8");
const s0 = html.indexOf("function pack(");
let i0 = html.indexOf("{", s0), d0 = 0, e0 = -1;
for (let j = i0; j < html.length; j++) {
  if (html[j] === "{") d0++;
  else if (html[j] === "}") { d0--; if (!d0) { e0 = j + 1; break; } }
}
const pack = eval("(" + html.slice(s0, e0).replace("function pack", "function") + ")");
const EPS = 0.5;
let failures = 0;
const bad = m => { console.log("   FAIL:", m); failures++; };

function verify(plan, cont, label, origRows) {
  const P = plan.placed;
  for (const b of P)
    if (b.x < -EPS || b.y < -EPS || b.z < -EPS || b.x+b.l > cont.L+EPS || b.y+b.h > cont.H+EPS || b.z+b.w > cont.W+EPS)
      bad(`${label}: OOB ${b.name}#${b.pieceNo}`);
  for (let a = 0; a < P.length; a++) for (let c = a+1; c < P.length; c++) {
    const A = P[a], B = P[c];
    if (A.x < B.x+B.l-EPS && A.x+A.l > B.x+EPS && A.y < B.y+B.h-EPS && A.y+A.h > B.y+EPS &&
        A.z < B.z+B.w-EPS && A.z+A.w > B.z+EPS) bad(`${label}: overlap ${A.name}/${B.name}`);
  }
  const loadOn = new Map(P.map(b => [b, 0]));
  for (const b of P) {
    if (b.y <= EPS) continue;
    let area = 0; const sup = [];
    for (const t of P) {
      if (t === b || Math.abs(t.y + t.h - b.y) > EPS) continue;
      const ox = Math.min(b.x+b.l, t.x+t.l) - Math.max(b.x, t.x);
      const oz = Math.min(b.z+b.w, t.z+t.w) - Math.max(b.z, t.z);
      if (ox > 0 && oz > 0) { area += ox*oz; sup.push(t); }
    }
    if (area/(b.l*b.w) < 0.75 - 1e-6) bad(`${label}: support ${b.name}#${b.pieceNo}`);
    for (const t of sup) {
      if (t.fragile) bad(`${label}: on fragile ${b.name}#${b.pieceNo}`);
      if (t.step >= b.step) bad(`${label}: sequence ${b.name}#${b.pieceNo}`);
    }
    const seen = new Set(); const st = [...sup];
    while (st.length) {
      const t = st.pop(); if (seen.has(t)) continue; seen.add(t);
      loadOn.set(t, loadOn.get(t) + b.kg);
      for (const u of P) {
        if (u === t || Math.abs(u.y + u.h - t.y) > EPS) continue;
        const ox = Math.min(t.x+t.l, u.x+u.l) - Math.max(t.x, u.x);
        const oz = Math.min(t.z+t.w, u.z+u.w) - Math.max(t.z, u.z);
        if (ox > 0 && oz > 0) st.push(u);
      }
    }
  }
  // Resolve the source row by NAME + geometry + weight, never by name alone:
  // merged datasets legitimately contain several different rows sharing a name
  // (e.g. three "Appliance box" rows with maxLoad 120 / 180 / 200), and a
  // name-only lookup silently checks a box against another row's capacity.
  const dimKey = (a, b2, c) => [a, b2, c].map(Number).sort((x, y) => x - y).join("x");
  const rowOf = b => origRows.find(r => r.name === b.name &&
                                        dimKey(r.l, r.w, r.h) === dimKey(b.l, b.w, b.h) &&
                                        Math.abs(r.kg - b.kg) < 1e-6) ||
                     origRows.find(r => r.name === b.name);
  for (const [b, load] of loadOn) {
    const row = rowOf(b);
    const cap = (b.fragile || (row && row.stackable === false)) ? 0 :
                (row && Number.isFinite(row.maxLoad) ? row.maxLoad : Infinity);
    if (load > cap + 1e-6) bad(`${label}: stack load ${load.toFixed(0)}kg > ${cap}kg on ${b.name}#${b.pieceNo}`);
  }
  const kg = P.reduce((s,b) => s+b.kg, 0);
  if (kg > cont.maxKg + 1e-6) bad(`${label}: payload`);
}

const cont = { L:590, W:235, H:239, maxKg:28200 };
const rows = [
  { name:"Pallet crate",   l:120, w:100, h:110, kg:220, qty:8,  fragile:false, stackable:true,  tip:false, maxLoad:400, pri:3, dest:"A" },
  { name:"Appliance box",  l:80,  w:70,  h:90,  kg:45,  qty:14, fragile:false, stackable:true,  tip:false, maxLoad:120, pri:3, dest:"A" },
  { name:"Carton (large)", l:60,  w:40,  h:40,  kg:12,  qty:40, fragile:false, stackable:true,  tip:true,  maxLoad:60,  pri:3, dest:"B" },
  { name:"Carton (small)", l:40,  w:30,  h:30,  kg:6,   qty:60, fragile:false, stackable:true,  tip:true,  maxLoad:40,  pri:2, dest:"B" },
  { name:"Glassware",      l:50,  w:40,  h:35,  kg:9,   qty:12, fragile:true,  stackable:false, tip:false, maxLoad:0,   pri:5, dest:"A" },
];

for (const mode of ["easy","fill","balanced"]) {
  const plan = pack(cont, rows, mode, {});
  console.log(`mode ${mode}: ${plan.placed.length}/${plan.placed.length + plan.unfit.length}`);
  verify(plan, cont, mode, rows);
}
{
  const plan = pack(cont, rows, "fill", {});
  for (const b of plan.placed) {
    const r = rows.find(x => x.name === b.name);
    if (r && !r.tip && Math.abs(b.h - r.h) > EPS) bad(`upright violated: ${b.name}#${b.pieceNo}`);
  }
  console.log("upright orientation check done");
}
{
  const plan = pack(cont, rows, "easy", { groupDest:true });
  const mean = d => { const g = plan.placed.filter(b => b.dest === d); return g.reduce((s,b) => s+b.x+b.l/2, 0) / g.length; };
  const mA = mean("A"), mB = mean("B");
  if (!(mA > mB)) bad(`destination LIFO: A ${mA.toFixed(0)} vs B ${mB.toFixed(0)}`);
  console.log(`destination LIFO: A mean x ${mA.toFixed(0)}cm vs B ${mB.toFixed(0)}cm`);
  verify(plan, cont, "groupDest", rows);
}
/* --- reject-reason split: weight-crush vs non-stackable base (v4) --- */
{
  const cbox = { L:100, W:100, H:100, maxKg:1e6 };
  // Case 1 — weight crush: stackable base with a small finite cap; heavy topper must stack on it.
  const wc = pack(cbox, [
    { name:"WC-base",   l:100, w:100, h:40, kg:10, qty:1, fragile:false, stackable:true, tip:false, maxLoad:10, pri:5, dest:"" },
    { name:"WC-topper", l:100, w:100, h:40, kg:50, qty:1, fragile:false, stackable:true, tip:false, maxLoad:0,  pri:3, dest:"" },
  ], "fill", {});
  const wcTop = wc.unfit.find(u => u.name === "WC-topper");
  if (!wcTop || wcTop.reason !== "stack weight limit")
    bad(`reason split: WC-topper expected 'stack weight limit', got '${wcTop ? wcTop.reason : "placed"}'`);

  // Case 2 — no stackable surface: non-stackable base fills the floor; topper can only go on top.
  // NOTE (v0.6): no-load pieces are now offered LAST, so the base must be pinned to the
  // floor another way — destination grouping (later drop = loaded deepest/first) does it,
  // and is a realistic way for a non-stackable slab to end up under everything else.
  const ns = pack(cbox, [
    { name:"NS-base",   l:100, w:100, h:40, kg:10, qty:1, fragile:false, stackable:false, tip:false, maxLoad:0, pri:5, dest:"B" },
    { name:"NS-topper", l:100, w:100, h:40, kg:5,  qty:1, fragile:false, stackable:true,  tip:false, maxLoad:0, pri:3, dest:"A" },
  ], "fill", { groupDest:true });
  const nsTop = ns.unfit.find(u => u.name === "NS-topper");
  if (!nsTop || nsTop.reason !== "no stackable surface")
    bad(`reason split: NS-topper expected 'no stackable surface', got '${nsTop ? nsTop.reason : "placed"}'`);
  console.log("reject-reason split check done");
}
/* --- door aperture: piece too tall/wide for the door opening is refused (v4) --- */
{
  const dbox = { L:400, W:300, H:300, maxKg:1e6, doorW:100, doorH:100 };
  const plan = pack(dbox, [
    // fits inside (h 150 < 300) but taller than the 100 door; tip off so height is fixed
    { name:"TallCab", l:50, w:50, h:150, kg:20, qty:1, fragile:false, stackable:true, tip:false, maxLoad:0, pri:5, dest:"" },
    // passes the door (all dims <= 100) -> should be placed
    { name:"SmallBox", l:50, w:50, h:90,  kg:5,  qty:1, fragile:false, stackable:true, tip:false, maxLoad:0, pri:3, dest:"" },
  ], "fill", {});
  const tall = plan.unfit.find(u => u.name === "TallCab");
  if (!tall || tall.reason !== "too big for door")
    bad(`door: TallCab expected 'too big for door', got '${tall ? tall.reason : "placed"}'`);
  if (!plan.placed.find(b => b.name === "SmallBox"))
    bad(`door: SmallBox should pass the door and be placed`);
  console.log("door aperture check done");
}
/* --- too big for CONTAINER: piece larger than interior refused distinctly from door (v4) --- */
{
  const cbox = { L:200, W:200, H:200, maxKg:1e6, doorW:190, doorH:190 };
  const plan = pack(cbox, [
    { name:"OverTall", l:50, w:50, h:250, kg:20, qty:1, fragile:false, stackable:true, tip:false, maxLoad:0, pri:5, dest:"" }, // 250 > 200 interior
    { name:"FitsBox",  l:50, w:50, h:90,  kg:5,  qty:1, fragile:false, stackable:true, tip:false, maxLoad:0, pri:3, dest:"" },
  ], "fill", {});
  const ot = plan.unfit.find(u => u.name === "OverTall");
  if (!ot || ot.reason !== "too big for container")
    bad(`container: OverTall expected 'too big for container', got '${ot ? ot.reason : "placed"}'`);
  if (!plan.placed.find(b => b.name === "FitsBox"))
    bad(`container: FitsBox should be placed`);
  console.log("too-big-for-container check done");
}
/* --- a tall fragile item must NOT collapse the load via headroom reservation (v4) --- */
{
  const cbox = { L:600, W:240, H:240, maxKg:1e6, doorW:240, doorH:240 };
  const plan = pack(cbox, [
    { name:"BigBox",    l:100, w:100, h:100, kg:20, qty:12, fragile:false, stackable:true,  tip:false, maxLoad:500, pri:3, dest:"" },
    { name:"TallGlass", l:40,  w:15,  h:180, kg:10, qty:1,  fragile:true,  stackable:false, tip:false, maxLoad:0,   pri:5, dest:"" }, // 180 > H/2
  ], "fill", {});
  const bigPlaced = plan.placed.filter(b => b.name === "BigBox").length;
  if (bigPlaced < 6) bad(`fragile-reservation: tall fragile collapsed the load — only ${bigPlaced}/12 BigBox placed`);
  console.log(`tall-fragile no-collapse check: ${bigPlaced}/12 BigBox placed`);
}
/* --- nothing may come to rest on a fragile piece EVEN IF the fragile piece is
   placed later (v0.6e). The support test only looks down, so a piece slid under
   an existing overhang used to become an illegal supporter after the fact. Here
   "Top" overhangs "Base" by 20 cm; the only floor slot under that overhang is
   exactly 20 cm wide, and "Frag" (fragile, offered last) must refuse it and go
   somewhere else rather than end up carrying Top. --- */
{
  const cbox = { L:300, W:100, H:100, maxKg:1e6, doorW:100, doorH:100 };
  const rows2 = [
    { name:"Base", l:100, w:100, h:40, kg:20, qty:1, fragile:false, stackable:true, tip:false, maxLoad:500, pri:5, dest:"" },
    { name:"Top",  l:120, w:100, h:40, kg:30, qty:1, fragile:false, stackable:true, tip:false, maxLoad:500, pri:4, dest:"" },
    { name:"Frag", l:20,  w:100, h:40, kg:5,  qty:1, fragile:true,  stackable:false, tip:false, maxLoad:0, pri:1, dest:"" },
  ];
  const plan = pack(cbox, rows2, "fill", {});
  const frag = plan.placed.find(b => b.name === "Frag");
  const top  = plan.placed.find(b => b.name === "Top");
  verify(plan, cbox, "slid-under-fragile", rows2);
  if (!frag) console.log("slid-under-fragile check: Frag was rejected (acceptable — it refused the illegal slot)");
  else if (top && Math.abs(frag.y + frag.h - top.y) < EPS &&
           Math.min(frag.x+frag.l, top.x+top.l) - Math.max(frag.x, top.x) > 0)
    bad("slid-under-fragile: Frag ended up underneath Top — fragile is carrying load");
  else console.log(`slid-under-fragile check: Frag placed clear of the overhang at x=${frag.x}`);
}
/* --- bears-nothing (fragile OR non-stackable) must be offered LAST (v0.6).
   Both carry maxLoad = 0, so either one placed early kills the column above it.
   Asserted structurally: with no searched ordering, every no-load piece must be
   sequenced into the pack after the ordinary stackable ones of the same drop. --- */
{
  const cbox = { L:600, W:240, H:240, maxKg:1e6, doorW:240, doorH:240 };
  const mixed = [
    { name:"Drum",  l:60, w:60, h:90, kg:50, qty:6,  fragile:false, stackable:false, tip:false, maxLoad:0,   pri:3, dest:"" },
    { name:"Glass", l:50, w:40, h:35, kg:9,  qty:4,  fragile:true,  stackable:false, tip:false, maxLoad:0,   pri:3, dest:"" },
    { name:"Box",   l:60, w:40, h:40, kg:12, qty:20, fragile:false, stackable:true,  tip:true,  maxLoad:100, pri:3, dest:"" },
  ];
  const plan = pack(cbox, mixed, "fill", {});
  const firstNoLoad = Math.min(...plan.placed.filter(b => b.maxLoad <= 0).map(b => b.step));
  const lastStackable = Math.max(...plan.placed.filter(b => b.maxLoad > 0).map(b => b.step));
  const drums = plan.placed.filter(b => b.name === "Drum").length;
  if (!(firstNoLoad > 0)) bad("bears-nothing: no no-load piece was placed at all");
  const order = plan.placed.slice().sort((a,b) => a.step - b.step).map(b => b.maxLoad <= 0 ? "N" : "S").join("");
  if (/N.*S/.test(order.replace(/^S+/, "")) && firstNoLoad < lastStackable)
    console.log(`bears-nothing ordering: interleaved (sequence is topological, not offer order) — ${drums}/6 drums placed`);
  else
    console.log(`bears-nothing ordering: no-load pieces come after the stackable ones — ${drums}/6 drums placed`);
  verify(plan, cbox, "bears-nothing", mixed);
}
/* --- loading SEQUENCE must cover every touching box, not just the >=75% supporters.
   Regression for the v0.5 bug the user's 3-dataset screenshot exposed: a small
   carton can end up under the overhang of a box placed earlier. It carries none
   of that box's weight, so the support test still passed, but the sequence put
   it AFTER the box above it — physically un-loadable (zero clearance) and it
   showed as a floating box in playback. verify() already checks this; it needed
   a dense enough manifest to trigger. Uses the demo cargo + the two scenario
   files merged, which is exactly what the user ran. --- */
{
  const load = f => {
    const L = fs.readFileSync(f, "utf8").trim().split(/\r?\n/);
    const H = L[0].split(","), ix = n => H.indexOf(n);
    return L.slice(1).map(c => { const x = c.split(",");
      return { name:x[ix("name")], l:+x[ix("length_cm")], w:+x[ix("width_cm")], h:+x[ix("height_cm")],
               kg:+x[ix("weight_kg")], qty:+x[ix("qty")], fragile:x[ix("fragile")]==="True",
               stackable:x[ix("stackable")]!=="False", tip:x[ix("tip")]==="True",
               maxLoad:+x[ix("max_load_kg")], pri:+x[ix("priority")], dest:x[ix("destination")] }; });
  };
  if (fs.existsSync("scenario_tough.csv") && fs.existsSync("scenario_medium.csv")) {
    const big = [...rows, ...load("scenario_tough.csv"), ...load("scenario_medium.csv")];
    const hc = { name:"45 ft High Cube", L:1357, W:235, H:270, doorW:234, doorH:260, maxKg:27700 };
    const before = failures;
    for (const mode of ["easy", "fill"]) verify(pack(hc, big, mode, {}), hc, `seq-${mode}`, big);
    console.log(`slid-under sequence check: ${big.reduce((s,r)=>s+r.qty,0)} pieces, ` +
                (failures === before ? "order is loadable" : "SEQUENCE BROKEN"));
  } else {
    console.log("slid-under sequence check skipped (scenario CSVs not found)");
  }
}
console.log(failures === 0 ? "\nALL V4 CHECKS PASS ✓" : `\n${failures} FAILURE(S) ✗`);
process.exit(failures ? 1 : 0);
