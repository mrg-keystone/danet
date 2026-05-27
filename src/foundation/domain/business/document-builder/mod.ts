import { SwaggerModule, SpecBuilder } from "#danet/swagger";
import "#reflect-metadata";
import { Type } from "@types";
import { DanetApplication, Module } from "#danet/core";
import { getSwaggerDescription } from "@foundation/domain/business/swagger-description/mod.ts";

const dummy = (): ReturnType<SpecBuilder["build"]> => new SpecBuilder().build();
type Document = Awaited<ReturnType<typeof SwaggerModule.createDocument>>;

class Spec {
  static getCleanName(name: string): string {
    return name.replace(/Module$/, "");
  }
  constructor(
    public module: Type,
    public value: ReturnType<typeof dummy>,
  ) {}
}

export class DanetDocumentBuilder {
  createSpec(target: Type, description?: string, version = "1.0"): Spec {
    const name = Spec.getCleanName(target.name);
    const desc =
      description ?? getSwaggerDescription(target) ?? "Auto-generated docs";
    const value = new SpecBuilder()
      .setTitle(name)
      .setDescription(desc)
      .setVersion(version)
      .addSecurity("basic", { type: "http", scheme: "basic" })
      .build();
    return new Spec(target, value);
  }

  private async setupFacade(mod: Type) {
    const meta = Reflect.getMetadata("module", mod) ?? {};
    const dat = {
      ...meta,
      imports: [],
      controllers: meta.controllers ? [...meta.controllers] : undefined,
      providers: meta.providers ? [...meta.providers] : undefined,
      exports: meta.exports ? [...meta.exports] : undefined,
    };
    @Module(dat)
    class FacadeModule {}
    const origLog = console.log;
    const host = new DanetApplication();
    try {
      console.log = () => {};
      await host.init(FacadeModule);
      return host;
    } finally {
      console.log = origLog;
    }
  }

  normalizePath = (path: string): string => (path.startsWith("/") ? path : `/${path}`);

  async createDocument(spec: Spec): Promise<{ doc: Document; path: string }> {
    const swaggerModuleHost = await this.setupFacade(spec.module);
    const rawPath = `/${Spec.getCleanName(spec.module.name).toLowerCase()}`;
    const doc = await SwaggerModule.createDocument(swaggerModuleHost, spec.value);
    return {
      doc,
      path: this.normalizePath(rawPath),
    };
  }

  package(doc: Document, prefix: string): { doc: Document; path: string } {
    const normalizedPrefix = this.normalizePath(prefix);
    const path = `${normalizedPrefix.toLowerCase()}/${doc.info.title.toLowerCase()}`;
    return { doc, path };
  }
}
