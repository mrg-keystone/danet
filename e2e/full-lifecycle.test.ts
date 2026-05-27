import "#reflect-metadata";
import { assertEquals, assertExists, assertStringIncludes } from "#assert";
import {
  bootstrapServer,
  DanetDocumentBuilder,
  DanetHttpAdapter,
  HttpAdapter,
  Server,
  setupWithSwagger,
  SwaggerDescription,
  InjectValue,
  InjectFactory,
  InjectClass,
} from "../src/bootstrap/mod.ts";
import { Controller, Get, Module } from "#danet/core";

// -- Verify all public exports exist --

Deno.test("e2e: all public exports are defined", () => {
  assertExists(bootstrapServer);
  assertExists(DanetDocumentBuilder);
  assertExists(DanetHttpAdapter);
  assertExists(HttpAdapter);
  assertExists(Server);
  assertExists(setupWithSwagger);
  assertExists(SwaggerDescription);
  assertExists(InjectValue);
  assertExists(InjectFactory);
  assertExists(InjectClass);
});

// -- Full lifecycle: bootstrap, serve, swagger, teardown --

@SwaggerDescription("Health API - system health checks")
@Controller("health")
class HealthController {
  @Get()
  check() {
    return { status: "ok" };
  }
}

@Module({
  controllers: [HealthController],
})
class TestAppModule {}

let port = 9100;

Deno.test("e2e: bootstrap server with swagger, hit endpoints, teardown", async () => {
  const p = port++;
  const server = await bootstrapServer(TestAppModule, { port: p });
  await server.listen();

  // Health endpoint works
  const healthRes = await fetch(`http://localhost:${p}/health`);
  const healthBody = await healthRes.json();
  assertEquals(healthRes.status, 200);
  assertEquals(healthBody.status, "ok");

  // Swagger index page is served
  const docsRes = await fetch(`http://localhost:${p}/docs`);
  const docsHtml = await docsRes.text();
  assertEquals(docsRes.status, 200);
  assertStringIncludes(docsHtml, "<html");

  await server.stop();
});

Deno.test("e2e: bootstrap server without swagger", async () => {
  const p = port++;
  const server = await bootstrapServer(TestAppModule, { port: p, swagger: false });
  await server.listen();

  const healthRes = await fetch(`http://localhost:${p}/health`);
  const healthBody = await healthRes.json();
  assertEquals(healthRes.status, 200);
  assertEquals(healthBody.status, "ok");

  const docsRes = await fetch(`http://localhost:${p}/docs`);
  await docsRes.text();
  assertEquals(docsRes.status, 404);

  await server.stop();
});

Deno.test("e2e: Server + DanetDocumentBuilder + setupWithSwagger integration", async () => {
  const server = Server.create();
  server.registerModule(TestAppModule);

  assertEquals(server.modules.length, 1);
  assertEquals(server.moduleNames, ["TestAppModule"]);

  // Build swagger docs through the coordinator
  const adapter = await setupWithSwagger(server);
  assertExists(adapter);

  const routes = adapter.app.router.routes;
  const getPaths = routes
    .filter((r: { method: string }) => r.method === "GET")
    .map((r: { path: string }) => r.path);

  assertEquals(getPaths.includes("/docs"), true);
});

Deno.test("e2e: InjectValue, InjectFactory, InjectClass constructors", () => {
  const val = new InjectValue("TOKEN_A", 42);
  assertEquals(val.provide, "TOKEN_A");
  assertEquals(val.useValue, 42);

  const factory = new InjectFactory("TOKEN_B", () => "built");
  assertEquals(factory.provide, "TOKEN_B");
  assertEquals((factory.useFactory as () => string)(), "built");

  const cls = new InjectClass("TOKEN_C", HealthController);
  assertEquals(cls.provide, "TOKEN_C");
  assertEquals(cls.useClass, HealthController);
});
