import { Type } from "@types";
import { Server } from "@foundation/domain/business/server/mod.ts";
import { SwaggerBuilder } from "@foundation/domain/business/swagger-builder/mod.ts";
import { DanetHttpAdapter } from "@foundation/domain/data/http-adapter/mod.ts";

interface BootstrapOptions {
  port?: number;
  swagger?: boolean | { filters: string[] };
}

export class BootstrapServer {
  private adapter: DanetHttpAdapter;
  private module: Type;

  private constructor(module: Type, adapter: DanetHttpAdapter) {
    this.module = module;
    this.adapter = adapter;
  }

  static async create(module: Type, options?: BootstrapOptions) {
    const { port = 3000, swagger = true } = options ?? {};

    const server = Server.create();
    server.registerModule(module);

    const adapter = new DanetHttpAdapter(port);

    if (swagger) {
      const filters = typeof swagger === "object" ? swagger.filters : [];
      const builder = new SwaggerBuilder(...filters);
      const { swaggerDocs, docsIndexHtml } = await builder.build(server);
      for (const { path, doc } of swaggerDocs) {
        adapter.registerSwaggerDocument(`/docs${path}`, doc);
      }
      adapter.registerRoute("get", "/docs", () =>
        new Response(docsIndexHtml, {
          headers: { "Content-Type": "text/html" },
        })
      );
    }

    return new BootstrapServer(module, adapter);
  }

  listen() {
    return this.adapter.listen(this.module);
  }

  stop() {
    return this.adapter.stop();
  }
}

export async function bootstrapServer(module: Type, options?: BootstrapOptions): Promise<{ listen: () => Promise<void>; stop: () => Promise<void> }> {
  const server = await BootstrapServer.create(module, options);
  return {
    listen: () => server.listen(),
    stop: () => server.stop(),
  };
}
