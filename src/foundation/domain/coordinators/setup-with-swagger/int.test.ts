import "#reflect-metadata";
import { assertEquals, assertStringIncludes } from "#assert";
import { setupWithSwagger } from "./mod.ts";
import { SwaggerBuilder } from "@foundation/domain/business/swagger-builder/mod.ts";
import { Server } from "@foundation/domain/business/server/mod.ts";

// Simple test modules - no @Module decorator needed for Server.registerModule.
// ChildModule is reachable only through TestModule's imports, mirroring a real
// root module that wires feature modules.
class ChildModule {}
Reflect.defineMetadata("module", {}, ChildModule);
class TestModule {}
Reflect.defineMetadata("module", { imports: [ChildModule] }, TestModule);

Deno.test(
  "SwaggerBuilder - builds swagger docs and index page from server modules",
  async () => {
    const server = Server.create();
    server.registerModule(TestModule);
    const builder = new SwaggerBuilder();
    const { swaggerDocs, docsIndexHtml } = await builder.build(server);

    assertEquals(swaggerDocs.length, 2);
    const paths = swaggerDocs.map((d) => d.path).sort();
    assertEquals(paths, ["/child", "/test"]);
    const test = swaggerDocs.find((d) => d.path === "/test")!;
    assertEquals(test.doc.info.title, "Test");
    assertEquals(test.doc.info.version, "1.0");
    assertEquals(test.doc.openapi, "3.0.3");

    assertStringIncludes(docsIndexHtml, "<html");
    assertStringIncludes(docsIndexHtml, "Test");
    // Mount-relative so the index works at "/docs" standalone and "/api/docs" under Fresh.
    assertStringIncludes(docsIndexHtml, 'href="docs/test"');
    // Imported modules get an index card too, not just a /docs/<name> page.
    assertStringIncludes(docsIndexHtml, 'href="docs/child"');
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
