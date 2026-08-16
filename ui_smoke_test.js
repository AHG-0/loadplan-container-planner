/* =============================================================================
   ui_smoke_test.js — headless UI wiring check for the multi-container feature
   Run:  node ui_smoke_test.js [cargo_load_planner_v4.html]
   Needs jsdom:  npm i jsdom     (dev-only; the app itself has no dependencies)

   pack_test.js / multi_pack_test.js prove the ALGORITHMS. This file proves the
   WIRING: that the fleet table, the CSV import, the strategy dropdown, the
   "Plan shipment" button, the per-container tabs and the summary actually talk
   to each other in a real DOM. Three.js is replaced by a stub — no WebGL is
   needed, so this runs anywhere node runs.
   ========================================================================== */
const fs = require("fs");
const path = require("path");
let JSDOM;
try { ({ JSDOM } = require(process.env.JSDOM_PATH || "jsdom")); }
catch { console.log("SKIPPED — jsdom not installed (npm i jsdom)"); process.exit(0); }

const FILE = process.argv[2] || "cargo_load_planner_v4.html";
let html = fs.readFileSync(FILE, "utf8");

/* Replace the Three.js CDN tag with a stub: every constructor/property returns
   a chainable no-op proxy, so scene-graph calls succeed without a renderer. */
const STUB = `<script>
  function _s(){ const t=function(){};
    return new Proxy(t,{
      get(o,k){
        if (k === Symbol.toPrimitive) return () => 0;   // stubs must survive arithmetic
        if (k === "then") return undefined;             // never look thenable
        if (k === "isMesh" || k === "isVector3") return false;
        return k in o ? o[k] : (o[k] = _s());
      },
      set(o,k,v){ o[k]=v; return true; },
      apply:()=>_s(), construct:()=>_s() });
  }
  window.THREE = _s();
  HTMLCanvasElement.prototype.getContext = () => _s();
  Element.prototype.scrollIntoView = function(){};       // not implemented by jsdom
</script>`;
html = html.replace(/<script src="https:\/\/cdnjs[^"]*"><\/script>/, STUB);

const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true,
                              url: "file://" + path.resolve(FILE) });
const { window } = dom;
const doc = window.document;
const $ = id => doc.getElementById(id);

let fail = 0;
const bad = m => { console.log("  ✗ FAIL:", m); fail++; };
const ok  = m => console.log("  ·", m);
const click = id => $(id).dispatchEvent(new window.MouseEvent("click", { bubbles:true }));
const fire  = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles:true }));
const rows = sel => doc.querySelectorAll(sel);
// the app defers packing through setTimeout(…, 50)
const tick = ms => new Promise(r => setTimeout(r, ms));
const hideToastIfAny = () => window.hideToast && window.hideToast();
const showToastForTest = m => window.showToast(m);

(async () => {
  console.log(`\nUI smoke test — ${path.basename(FILE)}\n`);

  /* ---- 1. the fleet table renders from the presets at startup ---------- */
  console.log("Fleet table");
  const fleetRowCount = () => rows("#fleetTbl tbody tr").length;
  const n0 = fleetRowCount();
  if (n0 < 4) bad(`expected the standard fleet at startup, got ${n0} row(s)`);
  else ok(`starts with the standard fleet (${n0} container types)`);
  if ($("fleetTypes").textContent !== String(n0)) bad("fleet summary count out of sync with the table");
  else ok(`summary bar agrees: ${$("fleetTypes").textContent} types · ${$("fleetAvail").textContent} available`);

  /* ---- 2. add / edit / delete / reorder --------------------------------- */
  click("addFleetRow");
  if (fleetRowCount() !== n0 + 1) bad("“+ Add container” did not add a row");
  else ok("add container works");

  // drag a row to the top: the "As listed" strategy walks the table in order
  {
    const before = [...rows("#fleetTbl input[data-fk='name']")].map(i => i.value);
    const trs = rows("#fleetTbl tbody tr");
    const from = trs[2], to = trs[0];
    const dt = { effectAllowed:"", data:{}, setData(k,v){ this.data[k]=v; }, getData(k){ return this.data[k]; } };
    const drag = (el, type, y) => {
      const e = new window.Event(type, { bubbles:true, cancelable:true });
      e.dataTransfer = dt; e.clientY = y;
      el.dispatchEvent(e);
    };
    to.getBoundingClientRect = () => ({ top:0, height:20, bottom:20, left:0, right:100, width:100 });
    drag(from.querySelector(".grip"), "dragstart", 100);
    drag(to.querySelector(".grip"), "dragover", 2);
    drag(to.querySelector(".grip"), "drop", 2);
    const after = [...rows("#fleetTbl input[data-fk='name']")].map(i => i.value);
    if (after[0] === before[0]) bad(`drag-reorder did nothing (still starts with "${after[0]}")`);
    else ok(`drag-reorder works: "${before[2]}" moved to the top of the fleet`);
  }

  const countInput = doc.querySelector('#fleetTbl input[data-fk="count"]');
  countInput.value = "3"; fire(countInput, "input");
  if ($("fleetAvail").textContent === "unlimited" && !$("fleetCap").textContent.includes("unlimited"))
    bad("count edit did not refresh the summary");
  else ok("count column is editable (blank = unlimited, a number = limited)");

  const nameInput = doc.querySelector('#fleetTbl input[data-fk="name"]');
  nameInput.value = "Edited box"; fire(nameInput, "input");
  ok("name / dimension cells accept edits");

  const delBtn = doc.querySelector('#fleetTbl button[data-fdel]');
  delBtn.dispatchEvent(new window.MouseEvent("click", { bubbles:true }));
  if (fleetRowCount() !== n0) bad("delete row did not work");
  else ok("delete container works");

  click("fleetClearBtn");
  if (fleetRowCount() !== 1 || !doc.querySelector("#fleetTbl tbody td").textContent.includes("No containers"))
    bad("clear fleet did not show the empty state");
  else ok("clear fleet shows an empty-state row");

  /* ---- 3. importing m2's container.csv --------------------------------- */
  console.log("\nFleet CSV import (m2's container.csv)");
  const m2 = path.join("Teammates", "container.csv");
  if (!fs.existsSync(m2)) {
    console.log("  (skipped — Teammates/container.csv not found)");
    click("fleetStdBtn");
  } else {
    const res = window.importFleetCsv(fs.readFileSync(m2, "utf8"));
    if (res.types !== 8) bad(`expected 8 imported types, got ${res.types}`);
    else ok(`imported ${res.types} container types straight into the table`);
    if (fleetRowCount() !== 8) bad(`table shows ${fleetRowCount()} rows after import`);
    else ok("table re-rendered with the imported fleet");
    if ($("fleetAvail").textContent !== "unlimited") bad("imported counts should default to unlimited");
    else ok("imported counts default to unlimited");
    const modeCell = doc.querySelector('#fleetTbl select[data-fk="mode"]');
    if (!modeCell || !modeCell.value) bad("mode cell did not render as a dropdown");
    else ok(`mode rendered as a dropdown (row 1 = "${modeCell.value}")`);
  }

  /* ---- 4. strategy dropdown -------------------------------------------- */
  console.log("\nStrategy selector");
  const opts = [...$("stratSel").options].map(o => o.value);
  if (!opts.includes("fewest") || !opts.includes("maxload"))
    bad(`strategy dropdown is missing modes: ${opts.join(", ")}`);
  else ok(`offers ${opts.length} strategies: ${opts.join(", ")}`);
  const d0 = $("stratDesc").textContent;
  $("stratSel").value = "maxload"; fire($("stratSel"), "change");
  if (!$("stratDesc").textContent || $("stratDesc").textContent === d0)
    bad("strategy description did not update on change");
  else ok("description strip follows the selected strategy");

  /* ---- 4b. demo data menu + fleet tabs as the container picker ---------- */
  console.log("\nDemo data + container tabs");
  const demoOpts = [...$("demoSel").options].map(o => o.value);
  if (!demoOpts.includes("fleet")) bad(`demo menu is missing the fleet-sized set: ${demoOpts.join(", ")}`);
  else ok(`demo menu offers ${demoOpts.length} datasets incl. a fleet-sized one`);
  $("demoSel").value = "tough";
  click("demoBtn");
  if (!rows("#cargoTbl tbody tr").length) bad("demo data did not populate the cargo table");
  else ok(`“Tough” loaded ${$("sumPieces").textContent} pieces and selected ${$("selName").textContent}`);
  // the imported fleet spells it "40 ft. High Cube", so compare loosely
  {
    const key = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (key($("selName").textContent) !== key("40 ft High Cube"))
      bad(`demo set should auto-select its container, got "${$("selName").textContent}"`);
    else ok(`demo auto-selects the container it was designed for ("${$("selName").textContent}")`);
  }

  {
    const tabs0 = rows("#ctabs button");
    if (!tabs0.length) bad("no fleet tabs — the tab strip replaced the header dropdown");
    else ok(`${tabs0.length} fleet tab(s) act as the container picker (header dropdown removed)`);
    if (doc.getElementById("contSel")) bad("the old header container dropdown is still in the DOM");
    else ok("header container dropdown is gone");
    const nameBefore = $("selName").textContent;
    tabs0[0].dispatchEvent(new window.MouseEvent("click", { bubbles:true }));
    if ($("selName").textContent === nameBefore && tabs0.length > 1)
      bad("clicking a fleet tab did not change the selected container");
    else ok(`fleet tab click selects a container (now ${$("selName").textContent})`);
    if (!doc.querySelector("#fleetTbl tbody tr.selected")) bad("fleet table does not highlight the selected container");
    else ok("fleet table highlights the selected row");
  }

  /* ---- 5. plan a shipment ---------------------------------------------- */
  console.log("\nPlan shipment");
  // a deliberately small fleet + a big manifest, so the plan needs several boxes
  click("fleetClearBtn");
  window.importFleetCsv("mode,name,length_cm,width_cm,height_cm,door_w_cm,door_h_cm,max_kg,cost,count\n" +
                        "sea,20 ft Standard,590,235,239,234,229,28230,2800,\n");
  $("demoSel").value = "sample"; click("demoBtn");     // 5 cargo types
  rows('#cargoTbl input[data-k="qty"]').forEach(inp => { inp.value = "80"; fire(inp, "input"); });
  $("stratSel").value = "fewest"; fire($("stratSel"), "change");
  $("fleetModeOnly").checked = false;
  click("planBtn");
  for (let i = 0; i < 60 && !(+$("shipCount").textContent >= 1); i++) await tick(500);

  const used = +$("shipCount").textContent;
  if (!(used >= 1)) bad("shipment summary did not report any container");
  else ok(`summary: ${used} container(s) · ${$("shipPieces").textContent} pieces · ${$("shipUtil").textContent} avg utilization`);
  const cards = rows("#shipList li");
  if (!cards.length || cards[0].classList.contains("empty")) bad("shipment list is empty after planning");
  else ok(`shipment list rendered ${cards.length} row(s), first = "${cards[0].textContent.trim().slice(0, 48)}…"`);
  if (!$("shipNote").textContent.includes("×")) bad("shipment note missing the per-type breakdown");
  else ok(`breakdown: ${$("shipNote").textContent}`);

  /* ---- 6. overview + per-container tabs + 3D view switching ------------- */
  console.log("\nPer-container views");
  const allTab = doc.querySelector("#ctabs button.all");
  if (used > 1 && !allTab) bad("no “All containers” tab for a multi-container shipment");
  else if (used > 1) {
    ok(`overview tab present and opens by default (${allTab.classList.contains("active") ? "active" : "NOT active"})`);
    if (!allTab.classList.contains("active")) bad("planning should open on the overview");
    if (!/All containers/.test($("hud").textContent)) bad("HUD does not describe the overview");
    else ok(`overview HUD: "${$("hud").textContent.replace(/\s+/g," ").trim().slice(0, 70)}"`);
    if (!/of \d+ shipped/.test($("mPack").textContent)) bad("overview metrics are not shipment-level");
    else ok(`overview metrics are shipment-level (${$("mPack").textContent.trim()}, util ${$("mVol").textContent})`);
    if (!/Open a container/.test($("manifest").textContent)) bad("overview should explain the empty step manifest");
    else ok("step manifest explains itself in overview");
  }
  const tabs = [...rows("#ctabs button")].filter(b => !b.classList.contains("all"));
  if (used > 1 && tabs.length !== used) bad(`expected ${used} container tabs, got ${tabs.length}`);
  else ok(`${tabs.length} container tab(s) over the 3D stage`);
  if (used > 1 && !$("ctabs").classList.contains("on")) bad("tab strip stayed hidden for a multi-container shipment");
  else if (used > 1) ok("tab strip is visible");

  if (tabs.length > 1) {
    tabs[0].dispatchEvent(new window.MouseEvent("click", { bubbles:true }));   // leave the overview
    await tick(50);
    const hud0 = $("hud").textContent, man0 = rows("#manifest li").length;
    tabs[1].dispatchEvent(new window.MouseEvent("click", { bubbles:true }));
    await tick(50);
    if ($("hud").textContent === hud0 && rows("#manifest li").length === man0)
      bad("clicking a tab did not switch the displayed container");
    else ok(`tab click switches the stage — HUD now: "${$("hud").textContent.replace(/\s+/g," ").trim().slice(0, 60)}"`);
    if (!doc.querySelector("#ctabs button.active")) bad("no tab marked active");
    else ok("active tab is highlighted");
    if (!doc.querySelector("#shipList li.current")) bad("shipment list does not highlight the viewed container");
    else ok("shipment list highlights the viewed container");
    if (!$("mVol").textContent.includes("%")) bad("metrics panel did not follow the viewed container");
    else ok(`metrics follow the view (volume ${$("mVol").textContent}, pieces ${$("mPack").textContent.trim()})`);
    // pieces that move to a later container must NOT be reported as rejected
    if (!/shipped/.test($("mPack").textContent))
      bad(`"pieces packed" should be shipment-relative, got "${$("mPack").textContent.trim()}"`);
    else if (!/carried on|not shipped|Container \d+ of/.test($("unfitNote").textContent))
      bad(`unfit note should explain the carry-over, got "${$("unfitNote").textContent}"`);
    else ok(`carry-over stated honestly: "${$("unfitNote").textContent}"`);
    const rejFirst = doc.querySelector("#rejected li");
    if (!/Nothing rejected|not shipped|no container/i.test(rejFirst.textContent))
      bad(`rejected panel should show shipment leftovers, got "${rejFirst.textContent.slice(0,60)}"`);
    else ok(`rejected panel is shipment-level: "${rejFirst.textContent.trim().slice(0, 56)}"`);
  }

  /* ---- 7. single-container packing still works and clears the shipment -- */
  console.log("\nSingle-container flow still intact");
  click("packBtn");
  await tick(400);
  if (doc.querySelector("#ctabs button.all")) bad("“Pack cargo” left the shipment overview tab on screen");
  else ok("“Pack cargo” exits the shipment view (tabs fall back to the fleet)");
  if (rows("#shipList li")[0].className !== "empty") bad("shipment summary not reset after a single-container pack");
  else ok("shipment summary resets");
  if (!$("mVol").textContent.includes("%")) bad("single-container metrics missing after pack");
  else ok(`single-container pack still reports metrics (${$("mVol").textContent})`);

  /* ---- 8. cost column + lowest-cost strategy ---------------------------- */
  console.log("\nCost model");
  click("fleetStdBtn");
  {
    const costs = [...rows("#fleetTbl input[data-fk='cost']")].map(i => i.value);
    if (costs.some(v => !(+v > 0))) bad(`standard fleet has unpriced containers: ${costs.join(", ")}`);
    else ok(`cost column seeded with illustrative rates (${costs.slice(0, 4).join(" / ")} …)`);
  }
  $("stratSel").value = "cheapest"; fire($("stratSel"), "change");
  if (!/cost/i.test($("stratDesc").textContent)) bad("lowest-cost strategy has no description");
  else ok("lowest-cost strategy is selectable and described");
  {
    const c0 = doc.querySelector("#fleetTbl input[data-fk='cost']");
    const keep = c0.value;
    c0.value = ""; fire(c0, "input");                    // one unpriced container
    hideToastIfAny();
    click("planBtn");
    await tick(200);
    if (!/Lowest cost|price|Cost/i.test($("toast").textContent))
      bad("lowest-cost should refuse to run with a missing price");
    else ok(`refuses to invent a price: "${$("toastMsg").textContent.slice(0, 64)}…"`);
    c0.value = keep; fire(c0, "input");
  }
  $("demoSel").value = "fleet"; click("demoBtn");        // 536 pcs, needs several containers
  if (+$("sumPieces").textContent !== 536)
    bad(`fleet demo should import all 536 pieces, got ${$("sumPieces").textContent} — rows are being dropped`);
  else ok("fleet demo imports all 536 pieces (same-name rows from different sets are kept)");
  $("fleetModeOnly").checked = true;
  click("planBtn");
  for (let i = 0; i < 60 && !(+$("shipCount").textContent >= 1); i++) await tick(500);
  if ($("shipCost").textContent === "–") bad("priced fleet should report a total freight cost");
  else ok(`fleet demo planned: ${$("shipCount").textContent} containers · ${$("shipPieces").textContent} pcs · ` +
          `${$("shipUtil").textContent} util · cost ${$("shipCost").textContent}`);

  /* ---- 8b. help overlay + optimizer panel ------------------------------- */
  console.log("\nHelp and optimizer");
  click("helpBtn");
  if (!$("helpOverlay").classList.contains("on")) bad("the ⓘ button did not open the help overlay");
  else {
    const t = $("helpBody").textContent;
    const missing = ["snug", "grow", "fTop", "Max fill", "Balanced", "door", "genetic", "NP-hard",
                     "Lowest cost", "illustrative"].filter(k => !t.includes(k));
    if (missing.length) bad(`help is missing: ${missing.join(", ")}`);
    else ok(`help overlay explains the modes, all 7 score terms, constraints and the optimizer (${t.length.toLocaleString()} chars)`);
    const heads = [...$("helpBody").querySelectorAll("h3")].length;
    ok(`${heads} help sections, reachable from the top bar`);
    click("helpClose");
    if ($("helpOverlay").classList.contains("on")) bad("help ✕ did not close the overlay");
    else ok("help closes with ✕ (and Esc)");
  }
  {
    const chips = rows(".infoBtn").length;
    if (!chips) bad("no inline ⓘ chips on the section headers");
    else ok(`${chips} inline ⓘ chips jump into the matching help section`);
  }
  if (!$("optRunBtn") || !$("optBudget")) bad("optimizer controls missing");
  else {
    const budgets = [...$("optBudget").options].map(o => o.textContent).join(" / ");
    ok(`optimizer panel present with effort presets: ${budgets}`);
    if (!$("optCancelBtn").disabled) bad("Cancel should be disabled while idle");
    else ok("Cancel is disabled until a search is running");
  }

  /* ---- 9. guard rails + toast ------------------------------------------- */
  console.log("\nGuard rails and toast");
  showToastForTest("test message");
  if (!$("toast").classList.contains("show")) bad("toast did not show");
  else {
    click("toastX");
    if ($("toast").classList.contains("show")) bad("toast ✕ did not dismiss it");
    else ok("toast has a working ✕ (and auto-hides on a timer)");
  }
  click("fleetClearBtn");
  click("planBtn");
  await tick(200);
  if (!$("toast").classList.contains("show") || !/fleet|container/i.test($("toast").textContent))
    bad("planning with an empty fleet did not warn the user");
  else ok(`empty fleet is refused: "${$("toastMsg").textContent.slice(0, 56)}…"`);

  console.log(fail === 0 ? "\nUI SMOKE TEST PASS ✓\n" : `\n${fail} FAILURE(S) ✗\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("HARNESS ERROR:", e.stack); process.exit(2); });
