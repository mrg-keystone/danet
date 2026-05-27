import type { Server } from "@foundation/domain/business/server/mod.ts";
import { SwaggerBuilder } from "@foundation/domain/business/swagger-builder/mod.ts";
import { DanetHttpAdapter } from "@foundation/domain/data/http-adapter/mod.ts";

export class SwaggerSetup {
  private builder: SwaggerBuilder;

  constructor(...filters: string[]) {
    this.builder = new SwaggerBuilder(...filters);
  }

  async setup(server: Server) {
    const { docsIndexHtml, swaggerDocs } = await this.builder.build(server);
    const adapter = new DanetHttpAdapter();
    for (const { path, doc } of swaggerDocs) {
      adapter.registerSwaggerDocument(`/docs${path}`, doc);
    }
    adapter.registerRoute("get", "/docs", () =>
      new Response(docsIndexHtml, {
        headers: { "Content-Type": "text/html" },
      })
    );
    return adapter;
  }
}

export async function setupWithSwagger(server: Server, ...filters: string[]): Promise<DanetHttpAdapter> {
  return new SwaggerSetup(...filters).setup(server);
}
