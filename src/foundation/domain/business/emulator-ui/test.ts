import { assert, assertEquals, assertStringIncludes } from "#assert";
import { emulatorShellHtml, orderedEndpoints } from "./mod.ts";
import type { OpenApiDocument } from "@types";

// A two-endpoint cake-style doc: create (order 1) → fetch (order 2, depends on create, binds id).
const doc: OpenApiDocument = {
  info: { title: "Users" },
  paths: {
    "/users": {
      post: {
        operationId: "create",
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateUserDto" },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UserDto" },
              },
            },
          },
        },
        "x-keep-process": {
          order: 1,
          dependsOn: [],
          bind: {},
          method: "post",
          path: "",
        },
      },
    },
    "/users/fetch": {
      post: {
        operationId: "fetch",
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UserRefDto" },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UserDto" },
              },
            },
          },
        },
        "x-keep-process": {
          order: 2,
          dependsOn: ["create"],
          bind: { id: "create.id" },
          method: "post",
          path: "fetch",
        },
      },
    },
  },
  components: {
    schemas: {
      CreateUserDto: { properties: { name: { type: "string" } } },
      UserRefDto: { properties: { id: { type: "string" } } },
      UserDto: {
        properties: { id: { type: "string" }, name: { type: "string" } },
      },
    },
  },
};

Deno.test("orderedEndpoints - sorts by process order + dependency, extracts fields", () => {
  const eps = orderedEndpoints(doc);
  assertEquals(eps.map((e) => e.id), ["create", "fetch"]);
  assertEquals(eps[1].dependsOn, ["create"]);
  assertEquals(eps[1].bind, { id: "create.id" });
  assertEquals(eps[0].inputFields, ["name"]);
  assertEquals(eps[1].inputFields, ["id"]);
});

Deno.test("orderedEndpoints - carries typed field schemas for the body editor", () => {
  const eps = orderedEndpoints(doc);
  assertEquals(eps[0].inputSchema, [
    { name: "name", type: "string", required: false, example: "" },
  ]);
  assertEquals(eps[1].inputSchema, [
    { name: "id", type: "string", required: false, example: "" },
  ]);
});

Deno.test("emulatorShellHtml - renders an ordered, chainable page", () => {
  const html = emulatorShellHtml("Users", doc);
  assertStringIncludes(html, "<title>Users · emulator</title>");
  assertStringIncludes(html, "process emulator");
  assertStringIncludes(html, "Run all in order");
  // The endpoint payload (ids, order, bind) is embedded for the client.
  assertStringIncludes(html, '"id":"create"');
  assertStringIncludes(html, '"id":"fetch"');
  assertStringIncludes(html, '"bind":{"id":"create.id"}');
  // create (order 1) appears before fetch (order 2) in the embedded list.
  assert(html.indexOf('"id":"create"') < html.indexOf('"id":"fetch"'));
});

Deno.test("emulatorShellHtml - embeds the composed producers index in the payload", () => {
  const html = emulatorShellHtml("Users", doc, {
    producers: { memberId: "members:enroll" },
  });
  assertStringIncludes(html, '"producers":{"memberId":"members:enroll"}');
  // Without the option the index is still present — just empty.
  const bare = emulatorShellHtml("Users", doc);
  assertStringIncludes(bare, '"producers":{}');
});

Deno.test("emulatorShellHtml - dev reload script injected only when opts.dev", () => {
  // The poller hits the sibling `_dev` endpoint — its fetch is the script's signature.
  const dev = emulatorShellHtml("Users", doc, { dev: true });
  assertStringIncludes(dev, 'fetch("_dev")');

  const plain = emulatorShellHtml("Users", doc);
  assert(!plain.includes('fetch("_dev")'));
  const off = emulatorShellHtml("Users", doc, { dev: false });
  assert(!off.includes('fetch("_dev")'));
});

Deno.test("emulatorShellHtml - spec text cannot break out of the inline script tag", () => {
  const hostile = structuredClone(doc);
  hostile.paths!["/users"].post.description =
    '</script><script>alert("pwned")</script>';
  const html = emulatorShellHtml("Users", hostile);
  // `<` is unicode-escaped inside the JSON payload, so the literal tag never appears.
  assert(!html.includes("</script><script>alert"));
  assertStringIncludes(html, "\\u003c/script>");
});
