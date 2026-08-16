/* LoadPlan — benchmark runner.
   Runs the packing engine extracted from the HTML across every dataset in
   ./datasets, in all three optimization modes, and writes
   datasets/baseline_results.csv.

   Usage:  node benchmark.js [path-to-html]
   Default html: ./cargo_load_planner_v4.html
*/
const fs = require("fs");
const path = require("path");

const HTML = process.argv[2] || path.join(__dirname, "cargo_load_planner_v4.html");
const DIR  = path.join(__dirname, "datasets");

// ---- extract pack() from the single-file app by brace matching ----
function extractPack(htmlPath) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const s = html.indexOf("function pack(");
  if (s < 0) throw new Error("pack() not found in " + htmlPath);
  let i = html.indexOf("{", s), d = 0, e = -1;
  for (let j = i; j < html.length; j++) {
    if (html[j] === "{") d++;
    else if (html[j] === "}") { d--; if (!d) { e = j + 1; break; } }
  }
  const src = html.slice(s, e).replace("function pack", "function");
  const pack = eval("(" + src + ")");
  return pack;
}

// BR reference container (Bischoff & Ratcliff 1995): 587 x 233 x 220 cm
const CONT = { L:587, W:233, H:220, maxKg:28200 };

function readCsv(file) {
  const lines = fs.readFileSync(file, "utf8").trim().split("\n").slice(1);
  return lines.map(l => {
    const c = l.split(",");
    return { name:c[0], l:+c[1], w:+c[2], h:+c[3], kg:+c[4], qty:+c[5], fragile:c[6] === "yes" };
  });
}

function main() {
  const pack = extractPack(HTML);
  const files = fs.readdirSync(DIR)
    .filter(f => f.endsWith(".csv") && !f.startsWith("baseline"))
    .sort();

  const out = [["dataset","pieces","mode","placed","rejected","util_pct","solve_ms"]];
  const sums = {};

  for (const f of files) {
    const rows = readCsv(path.join(DIR, f));
    const n = rows.reduce((s, r) => s + r.qty, 0);
    for (const mode of ["easy","fill","balanced"]) {
      const t0 = Date.now();
      const p = pack(CONT, rows, mode, {});
      const ms = Date.now() - t0;
      const util = p.placed.reduce((s,b) => s + b.l*b.w*b.h, 0) /
                   (CONT.L*CONT.W*CONT.H) * 100;
      out.push([f.replace(".csv",""), n, mode, p.placed.length, p.unfit.length, util.toFixed(1), ms]);
      sums[mode] = sums[mode] || { u:0, n:0, ms:0 };
      sums[mode].u += util; sums[mode].n++;
      sums[mode].ms = Math.max(sums[mode].ms, ms);
    }
  }

  fs.writeFileSync(path.join(DIR, "baseline_results.csv"), out.map(r => r.join(",")).join("\n"));

  console.log(`datasets: ${files.length}  ->  datasets/baseline_results.csv\n`);
  console.log("mode        mean_util   max_solve_ms");
  for (const m of ["easy","fill","balanced"])
    console.log(`${m.padEnd(12)}${(sums[m].u/sums[m].n).toFixed(1)}%       ${sums[m].ms}`);
}

main();
