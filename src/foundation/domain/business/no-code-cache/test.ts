import { assert, assertEquals } from "#assert";
import { noCodeCache } from "./mod.ts";

const NO_STORE = "Cache-Control";

/** Drives the middleware with a request URL and a canned downstream response. */
async function run(
  url: string,
  res: Response,
  options?: Parameters<typeof noCodeCache>[0],
) {
  const mw = noCodeCache(options);
  return await mw({
    req: new Request(url),
    next: () => Promise.resolve(res),
  });
}

function busted(res: Response): boolean {
  return res.headers.get(NO_STORE)?.includes("no-store") === true &&
    res.headers.get("Surrogate-Control") === "no-store" &&
    !res.headers.has("ETag");
}

Deno.test("busts an HTML page response (by content-type)", async () => {
  const out = await run(
    "http://app/",
    new Response("<h1>hi</h1>", {
      headers: { "content-type": "text/html; charset=utf-8", ETag: '"abc"' },
    }),
  );
  assert(busted(out), "html should be marked no-store");
  assertEquals(out.headers.get("Pragma"), "no-cache");
  assertEquals(out.headers.get("Expires"), "0");
});

Deno.test("busts a code file by extension even with a generic content-type", async () => {
  const out = await run(
    "http://app/assets/app.js",
    new Response("console.log(1)", {
      headers: { "content-type": "application/octet-stream" },
    }),
  );
  assert(busted(out));
});

Deno.test("busts everything under /_fresh/", async () => {
  const out = await run(
    "http://app/_fresh/island-chunk",
    new Response("…", {
      headers: { "content-type": "application/octet-stream" },
    }),
  );
  assert(busted(out));
});

Deno.test("leaves a non-code response (image) cacheable and untouched", async () => {
  const out = await run(
    "http://app/logo.png",
    new Response("\x89PNG", {
      headers: { "content-type": "image/png", ETag: '"img-1"' },
    }),
  );
  assertEquals(out.headers.get(NO_STORE), null);
  assertEquals(out.headers.get("ETag"), '"img-1"', "ETag must be preserved");
  assert(!busted(out));
});

Deno.test("respects custom extensions (merged with defaults)", async () => {
  const out = await run(
    "http://app/sitemap.xml",
    new Response("<urlset/>", {
      headers: { "content-type": "application/octet-stream" },
    }),
    { extensions: [".xml"] },
  );
  assert(busted(out));

  // Defaults still apply alongside the custom one.
  const css = await run(
    "http://app/site.css",
    new Response("body{}", {
      headers: { "content-type": "application/octet-stream" },
    }),
    { extensions: [".xml"] },
  );
  assert(busted(css));
});

Deno.test("preserves the response body and status while mutating headers", async () => {
  const out = await run(
    "http://app/api/users",
    new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }),
  );
  assert(busted(out));
  assertEquals(out.status, 201);
  assertEquals(await out.json(), { ok: true });
});
