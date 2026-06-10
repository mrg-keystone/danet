import type { Server } from "@foundation/domain/business/server/mod.ts";
import type { Type } from "@types";
import { Crawler } from "@foundation/domain/business/crawler/mod.ts";
import { DanetDocumentBuilder } from "@foundation/domain/business/document-builder/mod.ts";
import { IndexPageBuilder } from "@foundation/domain/business/index-page-builder/mod.ts";

export class SwaggerBuilder {
  private crawler: Crawler;
  private documentBuilder: DanetDocumentBuilder;
  private indexPageBuilder: IndexPageBuilder;

  constructor(...filters: string[]) {
    this.crawler = new Crawler(...filters);
    this.documentBuilder = new DanetDocumentBuilder();
    // particleCount left at the builder's modest default — 100 just bloated every rendered page.
    this.indexPageBuilder = new IndexPageBuilder({
      prefix: "/docs/",
    });
  }

  async build(server: Server) {
    const allModules = this.crawler.crawl(server.modules);
    const specs = allModules.map((m: Type) =>
      this.documentBuilder.createSpec(m)
    );
    const docs$ = specs.map((s) => this.documentBuilder.createDocument(s));
    const swaggerDocs = await Promise.all(docs$);
    const docsIndexHtml = this.indexPageBuilder.build(server.moduleNames);
    return { swaggerDocs, docsIndexHtml };
  }
}
