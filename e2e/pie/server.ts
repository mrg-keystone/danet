import "reflect-metadata";
import { bootstrapServer } from "@mrg-keystone/keep";
import { httpModule } from "./src/pie/entrypoints/http/mod.ts";

// One module per rune; keep serves the process emulator at /docs/pie.
export const api = await bootstrapServer("pie", httpModule, { port: 8723 });

if (import.meta.main) {
  await api.listen();
  console.log("🥧 pie app on http://localhost:8723 — emulator at /docs/pie");
}
