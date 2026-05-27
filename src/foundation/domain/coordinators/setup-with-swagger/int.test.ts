import "#reflect-metadata";
import { assertEquals, assertStringIncludes } from "#assert";
import { setupWithSwagger } from "./mod.ts";
import { SwaggerBuilder } from "@foundation/domain/business/swagger-builder/mod.ts";
import { Server } from "@foundation/domain/business/server/mod.ts";

// Simple test module - no @Module decorator needed for Server.registerModule
class TestModule {}
Reflect.defineMetadata("module", {}, TestModule);

Deno.test(
  "SwaggerBuilder - builds swagger docs and index page from server modules",
  async () => {
    const server = Server.create();
    server.registerModule(TestModule);
    const builder = new SwaggerBuilder();
    const { swaggerDocs, docsIndexHtml } = await builder.build(server);

    assertEquals(swaggerDocs.length, 1);
    assertEquals(swaggerDocs[0].path, "/test");
    assertEquals(swaggerDocs[0].doc.info.title, "Test");
    assertEquals(swaggerDocs[0].doc.info.version, "1.0");
    assertEquals(swaggerDocs[0].doc.openapi, "3.0.3");

    assertStringIncludes(docsIndexHtml, "<html");
    assertStringIncludes(docsIndexHtml, "Test");
    assertStringIncludes(docsIndexHtml, 'href="/docs/test"');
  },
);

Deno.test(
  "setupWithSwagger - registers swagger doc and index route",
  async () => {
    const server = Server.create();
    server.registerModule(TestModule);
    const adapter = await setupWithSwagger(server);

    const routes = adapter.app.router.routes;
    const getPaths = routes
      .filter((r: { method: string }) => r.method === "GET")
      .map((r: { path: string }) => r.path);

    assertEquals(getPaths.includes("/docs"), true);
    assertEquals(getPaths.includes("/docs/test"), true);
  },
);
