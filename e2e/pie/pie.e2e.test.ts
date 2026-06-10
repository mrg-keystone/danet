// End-to-end acceptance for the rune -> keep flow, exercised through the pie module
// (rune-generated from src/pie/pie.rune, bodies filled to chain deterministically). Mirrors e2e/cake.
// Run from the keep root: `deno task test:e2e:pie` (in-process), or `KEEP_BROWSER=1 deno task
// test:e2e:pie` to add the interactive-emulator browser stage (`deno task pie` runs it headed).
import "reflect-metadata";
import { assert, assertEquals, assertExists, assertStringIncludes } from "#assert";
import { bootstrapServer, exerciseEndpoints } from "@mrg-keystone/keep";
import { httpModule } from "@/src/pie/entrypoints/http/mod.ts";

let port = 8810;

const CHAIN = ["gatherFruit", "makeFilling", "rollDough", "assemblePie", "bakePie", "slicePie"];

// The exact HTTP routes the generated controller should expose, in any order — the contract the
// spec/Swagger surface must hold. `CHAIN` (above) is the matching source of truth for the count.
const EXPECTED_PATHS = [
  "/http/gather-fruit",
  "/http/make-filling",
  "/http/roll-dough",
  "/http/assemble-pie",
  "/http/bake-pie",
  "/http/slice-pie",
];

// Stage 1/2 — the generated controller exposes 6 ordered, chained, schema'd endpoints.
Deno.test("pie e2e — 6 endpoints with schemas + x-keep-process chain", async () => {
  const api = await bootstrapServer("pie", httpModule, { port: port++ });
  try {
    const doc = api.docs[0].doc;
    assertEquals(Object.keys(doc.paths ?? {}).sort(), [...EXPECTED_PATHS].sort());
    assertExists(doc.components?.schemas?.FruitDto);
    assertExists(doc.components?.schemas?.SlicesDto);
    // Last step's process metadata is fully derived from the DTO field graph.
    const slice = doc.paths!["/http/slice-pie"].post!["x-keep-process"];
    assertEquals(slice?.order, 6);
    assertEquals(slice?.dependsOn, ["bakePie"]);
    assertEquals(slice?.bind, { bakedPieId: "bakePie.bakedPieId" });
  } finally {
    await api.stop();
  }
});

// Stage 5 — the headless runner drives the whole chain green in-process (no browser).
Deno.test("pie e2e — exerciseEndpoints chains all 6 green in-process", async () => {
  const api = await bootstrapServer("pie", httpModule, { port: port++ });
  try {
    const report = await exerciseEndpoints({ api });
    assertEquals(report.order, CHAIN);
    assertEquals(report.cycles, []);
    assertEquals(report.failed.map((r) => r.id), []);
    assertEquals(report.passed.length, CHAIN.length);
  } finally {
    await api.stop();
  }
});

// Stage 7 — the deeper-inspection surfaces are reachable (no browser needed): the emulator page,
// the standard Swagger UI, and the raw OpenAPI spec (served to the loopback caller).
Deno.test("pie e2e — emulator page, Swagger UI, and raw spec are all served", async () => {
  const p = port++;
  const api = await bootstrapServer("pie", httpModule, { port: p });
  await api.listen();
  try {
    const base = `http://localhost:${p}`;

    const emulator = await fetch(`${base}/docs/pie`);
    assertEquals(emulator.status, 200);
    assertStringIncludes(await emulator.text(), "process emulator");

    const swagger = await fetch(`${base}/docs/pie/swagger`);
    assertEquals(swagger.status, 200);
    assertStringIncludes(await swagger.text(), "swagger-ui");

    const spec = await fetch(`${base}/docs/pie/json`); // loopback is trusted, so it's served
    assertEquals(spec.status, 200);
    const doc = await spec.json();
    assertEquals(Object.keys(doc.paths).sort(), [...EXPECTED_PATHS].sort());
  } finally {
    await api.stop();
  }
});

// Stage 4 — the interactive emulator, driven in headless chromium. Each pie step is emulated
// explicitly, in order, as its own named t.step so the run output reads like the process itself:
// gather fruit -> make filling -> roll dough -> assemble pie -> bake pie -> slice pie. Every step
// asserts it's unlocked, the next step is still locked, its request body was auto-filled with the
// value captured from the previous step, and a checkmark appears after it runs. Opt-in (needs
// `deno run -A npm:playwright install chromium chromium-headless-shell`; `deno task pie` provisions).
Deno.test({
  name: "pie e2e — emulator drives all 6 steps: progressive unlock + autofill + checkmarks",
  ignore: Deno.env.get("KEEP_BROWSER") !== "1",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async (t) => {
    const p = port++;
    const api = await bootstrapServer("pie", httpModule, { port: p });
    await api.listen();
    const { chromium } = await import("#playwright");
    // KEEP_HEADED=1 launches a visible browser and slows actions so you can watch the
    // emulator walk the chain (`deno task pie`); otherwise it runs headless.
    const headed = Deno.env.get("KEEP_HEADED") === "1";
    const browser = await chromium.launch({ headless: !headed, slowMo: headed ? 500 : 0 });
    try {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${p}/docs/pie`);

      const emulate = page.locator("button.emulate"); // the six "Emulate process" buttons, in order
      const rows = page.locator("li"); // the six endpoint rows, in order
      const unlocked = async (i: number) => !(await emulate.nth(i).isDisabled());
      const bodyOf = (i: number) => rows.nth(i).locator("textarea").inputValue();
      const runStep = async (i: number) => {
        await emulate.nth(i).click();
        await rows.nth(i).locator(".dot.ok").waitFor({ timeout: 10000 }); // wait for its checkmark
      };

      // ── Inspect a step's request ─────────────────────────────────────────────
      // Click into a bullet (not the button) to expand it and reveal the generated curl request.
      await t.step("expand a step to see its curl request", async () => {
        await rows.nth(0).locator(".path").click();
        const curl = await rows.nth(0).locator(".curl").textContent();
        assert(curl?.includes("curl -X POST"), `curl request not rendered: ${curl}`);
        assert(curl?.includes("/http/gather-fruit"), `curl missing the endpoint path: ${curl}`);
      });

      // ── Step 1 — gather fruit ────────────────────────────────────────────────
      // The first step needs no upstream data (it seeds `orchard`), so it starts unlocked.
      await t.step("step 1 — gather fruit", async () => {
        assertEquals(await unlocked(0), true, "step 1 (gather fruit) should start unlocked");
        assertEquals(await unlocked(1), false, "step 2 (make filling) should be locked until step 1 runs");
        await runStep(0); // -> returns { fruitId: "fruit-7" }
      });

      // ── Step 2 — make filling ────────────────────────────────────────────────
      await t.step("step 2 — make filling (fruitId autofilled from step 1)", async () => {
        assertEquals(await unlocked(1), true, "step 2 (make filling) should unlock after step 1");
        assertEquals(await unlocked(2), false, "step 3 (roll dough) should be locked until step 2 runs");
        const body = await bodyOf(1);
        assert(body.includes("fruit-7"), `step 2 not autofilled with fruitId "fruit-7": ${body}`);
        await runStep(1); // -> returns { fillingId: "filling-fruit-7" }
      });

      // ── Step 3 — roll dough ──────────────────────────────────────────────────
      await t.step("step 3 — roll dough (fillingId autofilled from step 2)", async () => {
        assertEquals(await unlocked(2), true, "step 3 (roll dough) should unlock after step 2");
        assertEquals(await unlocked(3), false, "step 4 (assemble pie) should be locked until step 3 runs");
        const body = await bodyOf(2);
        assert(body.includes("filling-fruit-7"), `step 3 not autofilled with fillingId "filling-fruit-7": ${body}`);
        await runStep(2); // -> returns { crustId: "crust-filling-fruit-7" }
      });

      // ── Step 4 — assemble pie ────────────────────────────────────────────────
      await t.step("step 4 — assemble pie (crustId autofilled from step 3)", async () => {
        assertEquals(await unlocked(3), true, "step 4 (assemble pie) should unlock after step 3");
        assertEquals(await unlocked(4), false, "step 5 (bake pie) should be locked until step 4 runs");
        const body = await bodyOf(3);
        assert(body.includes("crust-filling-fruit-7"), `step 4 not autofilled with crustId "crust-filling-fruit-7": ${body}`);
        await runStep(3); // -> returns { rawPieId: "raw-crust-filling-fruit-7" }
      });

      // ── Step 5 — bake pie ────────────────────────────────────────────────────
      await t.step("step 5 — bake pie (rawPieId autofilled from step 4)", async () => {
        assertEquals(await unlocked(4), true, "step 5 (bake pie) should unlock after step 4");
        assertEquals(await unlocked(5), false, "step 6 (slice pie) should be locked until step 5 runs");
        const body = await bodyOf(4);
        assert(body.includes("raw-crust-filling-fruit-7"), `step 5 not autofilled with rawPieId "raw-crust-filling-fruit-7": ${body}`);
        await runStep(4); // -> returns { bakedPieId: "baked-raw-crust-filling-fruit-7" }
      });

      // ── Step 6 — slice pie ───────────────────────────────────────────────────
      await t.step("step 6 — slice pie (bakedPieId autofilled from step 5)", async () => {
        assertEquals(await unlocked(5), true, "step 6 (slice pie) should unlock after step 5");
        const body = await bodyOf(5);
        assert(body.includes("baked-raw-crust-filling-fruit-7"), `step 6 not autofilled with bakedPieId "baked-raw-crust-filling-fruit-7": ${body}`);
        await runStep(5); // -> returns { sliceCount: 8 }
      });

      // ── All six steps green ──────────────────────────────────────────────────
      await t.step("all six steps show a checkmark", async () => {
        assertEquals(await page.locator("li .dot.ok").count(), CHAIN.length);
      });

      // ── "Run all in order" replays the whole chain from a fresh load ──────────
      await t.step("run all in order greens the whole chain", async () => {
        await page.reload();
        await page.locator("#runall").click();
        await page.waitForFunction(
          `document.querySelectorAll('li .dot.ok').length === ${CHAIN.length}`,
          { timeout: 10000 },
        );
      });

      // Hold the all-green state on screen briefly when watching headed.
      if (headed) await new Promise((r) => setTimeout(r, 2500));
    } finally {
      await browser.close();
      await api.stop();
    }
  },
});
