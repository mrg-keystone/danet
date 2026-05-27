import "#reflect-metadata";
import { assertEquals, assertStringIncludes } from "#assert";
import { SwaggerBuilder } from "./mod.ts";
import { Server } from "@foundation/domain/business/server/mod.ts";

class TestModule {}
Reflect.defineMetadata("module", {}, TestModule);

Deno.test("SwaggerBuilder - builds swagger docs and index page from server", async () => {
  const server = Server.create();
  server.registerModule(TestModule);

  const builder = new SwaggerBuilder();
  const { swaggerDocs, docsIndexHtml } = await builder.build(server);

  assertEquals(swaggerDocs.length, 1);
  assertEquals(swaggerDocs[0].path, "/test");
  assertEquals(swaggerDocs[0].doc.info.title, "Test");
  assertEquals(swaggerDocs[0].doc.info.version, "1.0");
  assertStringIncludes(docsIndexHtml, "<html");
  assertStringIncludes(docsIndexHtml, "Test");
  assertStringIncludes(docsIndexHtml, 'href="/docs/test"');
});

Deno.test("SwaggerBuilder - respects filters", async () => {
  class ModuleA {}
  Reflect.defineMetadata("module", {}, ModuleA);
  class ModuleB {}
  Reflect.defineMetadata("module", {}, ModuleB);

  const server = Server.create();
  server.registerModule(ModuleA);
  server.registerModule(ModuleB);

  const builder = new SwaggerBuilder("ModuleB");
  const { swaggerDocs } = await builder.build(server);

  assertEquals(swaggerDocs.length, 1);
  assertEquals(swaggerDocs[0].doc.info.title, "ModuleA");
});
