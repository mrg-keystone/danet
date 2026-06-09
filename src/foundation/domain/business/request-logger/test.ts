import { assertEquals, assertExists, assertStringIncludes } from "#assert";
import { Hono } from "#hono";
import { Logger } from "@foundation/domain/business/logger/mod.ts";
import { createRequestLoggingMiddleware } from "./mod.ts";

function captureInfo() {
  const calls: unknown[][] = [];
  const orig = console.info;
  console.info = (...a: unknown[]) => void calls.push(a);
  return { calls, restore: () => void (console.info = orig) };
}

Deno.test("request logger redacts a credential in the ?token query param", async () => {
  const logger = new Logger();
  logger.configure({ appName: "test" });
  const app = new Hono();
  app.use(createRequestLoggingMiddleware(logger));
  app.get("/x", (c) => c.text("ok"));

  const cap = captureInfo();
  try {
    await app.fetch(new Request("http://app/x?token=SECRET123&foo=bar"));
  } finally {
    cap.restore();
  }

  // The logger emits `console.info(message, attributes)`; find the ingress line.
  const ingress = cap.calls.find(
    (a) => typeof a[0] === "string" && (a[0] as string).includes("[ingress"),
  );
  assertExists(ingress, "expected an ingress log line");
  const attrs = JSON.stringify(ingress![1]);

  assertStringIncludes(attrs, '"token":"***"'); // token redacted
  assertStringIncludes(attrs, '"foo":"bar"'); // other params untouched
  assertEquals(attrs.includes("SECRET123"), false); // the real token never appears
});
