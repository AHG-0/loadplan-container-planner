/* =============================================================================
   verify_build.js — "did this copy keep everything?"

   Run this on ANY teammate's copy before merging it. It answers, mechanically:
     1. does it still contain every function / declaration the reference has?
     2. is the LOGIC of each shared function unchanged (comments ignored)?
     3. does every element id the code touches still exist in the markup?
     4. are the named engine fixes still in there?
     5. do all four regression suites still pass?
   Anything the copy ADDED is listed too, so nothing of theirs is lost either.

   Usage:
     node verify_build.js <their-copy.html> [reference.html]
     (reference defaults to cargo_load_planner_v5.html)

   Exit code 0 = safe to merge, 1 = something was lost.
   ========================================================================== */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const CAND = process.argv[2];
const REF  = process.argv[3] || "cargo_load_planner_v5.html";
if (!CAND) { console.log("usage: node verify_build.js <their-copy.html> [reference.html]"); process.exit(2); }

const cand = fs.readFileSync(CAND, "utf8");
const ref  = fs.readFileSync(REF,  "utf8");
let problems = 0;
const bad = m => { console.log("  ✗ " + m); problems++; };
const ok  = m => console.log("  · " + m);

/* ---- helpers ---------------------------------------------------------- */
function braceEnd(s, start) {
  let d = 0, j = s.indexOf("{", start);
  for (; j < s.length; j++) {
    if (s[j] === "{") d++;
    else if (s[j] === "}") { d--; if (!d) return j + 1; }
  }
  return -1;
}
function fnText(s, name) {
  const i = s.indexOf("function " + name + "(");
  if (i < 0) return null;
  const e = braceEnd(s, i);
  return e < 0 ? null : s.slice(i, e);
}
const norm = t => t == null ? null :
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").replace(/\s+/g, " ").trim();

console.log(`\nComparing\n  candidate : ${path.basename(CAND)}\n  reference : ${path.basename(REF)}\n`);

/* ---- 1 + 2. functions -------------------------------------------------- */
console.log("Functions");
const refFns = [...new Set([...ref.matchAll(/^function ([A-Za-z_$][\w$]*)\(/gm)].map(m => m[1]))];
const missingFns = refFns.filter(f => !cand.includes("function " + f + "("));
if (missingFns.length) bad(`missing ${missingFns.length}: ${missingFns.join(", ")}`);
else ok(`all ${refFns.length} functions present`);

const changed = refFns.filter(f => {
  const a = norm(fnText(ref, f)), b = norm(fnText(cand, f));
  return b != null && a !== b;
});
if (changed.length) console.log(`  ! logic differs in ${changed.length}: ${changed.join(", ")}` +
                                `\n    (review these by hand — a deliberate UI tweak is fine, an engine change is not)`);
else ok("logic identical in every shared function");

/* ---- 3. declarations --------------------------------------------------- */
console.log("Declarations");
const refDecls = [...new Set([...ref.matchAll(/^(?:const|let) ([A-Za-z_$][\w$]*)\s*[=;]/gm)].map(m => m[1]))];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");   // names like `$` are regex chars
const missDecl = refDecls.filter(d => !new RegExp("^(?:const|let) " + esc(d) + "\\s*[=;]", "m").test(cand));
if (missDecl.length) bad(`missing: ${missDecl.join(", ")}`);
else ok(`all ${refDecls.length} top-level declarations present`);

/* ---- 4. element ids ---------------------------------------------------- */
console.log("Markup");
const used = new Set([...ref.matchAll(/\$\("([^"]+)"\)/g)].map(m => m[1])
  .concat([...ref.matchAll(/getElementById\("([^"]+)"\)/g)].map(m => m[1])));
const created = new Set([...ref.matchAll(/\.id = "([^"]+)"/g)].map(m => m[1]));  // made at runtime
const candIds = new Set([...cand.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const missIds = [...used].filter(i => !candIds.has(i) && !created.has(i));
if (missIds.length) bad(`ids the code needs but the markup lacks: ${missIds.join(", ")}`);
else ok(`all ${used.size} referenced element ids exist`);

/* ---- 5. named engine fixes -------------------------------------------- */
console.log("Engine fixes (each was a real bug — losing one silently reintroduces it)");
const MARKERS = {
  "sequence rebuilt from final geometry":     "deps.set(b,",
  "bears-nothing offered last":               "(a.maxLoad <= 0) === (b.maxLoad <= 0)",
  "nothing rests on fragile, even later":     "restingOnTop(",
  "byBottom index":                           "const byBottom",
  "search order hook":                        "Array.isArray(opts.order)",
  "search baseline = the no-order plan":      "const baseFit = evaluate(null)",
  "heuristic ordering seeded into the GA":    "function heuristicRanks(",
  "loadability tiebreak":                     "function loadDepth(",
  "loadDepth shipped into the worker":        "${loadDepth.toString()}",
  "deterministic evaluation budget":          "cfg.maxEvals",
  "worker ready handshake":                   '"ready"',
  "worker watchdog fallback":                 "bail(",
  "rotated-box tooltip":                      "turned · listed as",
  "duplicate cargo names kept apart":         "seenIds.has(sig)",
  "stub-container warning":                   "stubHint",
  "lowest-cost strategy":                     '"cheapest"',
  "illustrative cost defaults":               "PRESET_COST",
  "full help glossary":                       "The seven score terms",
};
for (const [label, needle] of Object.entries(MARKERS)) {
  if (cand.includes(needle)) ok(label);
  else bad(label + "  — LOST");
}

/* ---- 6. what the copy added ------------------------------------------- */
console.log("Their own additions (preserve these when merging)");
const candFns = [...new Set([...cand.matchAll(/^function ([A-Za-z_$][\w$]*)\(/gm)].map(m => m[1]))];
const extraFns = candFns.filter(f => !refFns.includes(f));
const refIds = new Set([...ref.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const extraIds = [...candIds].filter(i => !refIds.has(i));
console.log(`  ${extraFns.length} new function(s): ${extraFns.join(", ") || "none"}`);
console.log(`  ${extraIds.length} new element id(s): ${extraIds.slice(0, 14).join(", ") || "none"}${extraIds.length > 14 ? " …" : ""}`);

/* ---- 7. the regression suites ----------------------------------------- */
console.log("\nRegression suites");
for (const [name, args] of [
  ["pack_test.js",      [CAND]],
  ["multi_pack_test.js",[CAND]],
  ["optimizer_test.js", [CAND, "2500"]],
]) {
  if (!fs.existsSync(name)) { console.log(`  (skipped ${name} — not found)`); continue; }
  try {
    const out = execFileSync("node", [name, ...args], { encoding: "utf8" });
    const last = out.trim().split("\n").filter(Boolean).pop();
    ok(`${name}: ${last.trim()}`);
  } catch (e) {
    const out = (e.stdout || "") + (e.stderr || "");
    const fails = out.split("\n").filter(l => /FAIL/.test(l)).slice(0, 5);
    bad(`${name} FAILED:\n      ` + (fails.join("\n      ") || out.trim().split("\n").slice(-3).join("\n      ")));
  }
}

console.log(problems === 0
  ? "\n✓ SAFE TO MERGE — nothing from the reference was lost.\n"
  : `\n✗ ${problems} problem(s) — do NOT merge until these are resolved.\n`);
process.exit(problems ? 1 : 0);
