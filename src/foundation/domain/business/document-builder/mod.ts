import { SwaggerModule, SpecBuilder } from "#danet/swagger";
import "#reflect-metadata";
import { Type } from "@types";
import { DanetApplication, Module } from "#danet/core";
import { getSwaggerDescription } from "@foundation/domain/business/swagger-description/mod.ts";

// Type-only helper: the shape returned by SpecBuilder.build(), used to type Spec.value.
const emptySpec = (): ReturnType<SpecBuilder["build"]> => new SpecBuilder().build();
type Document = Awaited<ReturnType<typeof SwaggerModule.createDocument>>;

class Spec {
  static getCleanName(name: string): string {
    return name.replace(/Module$/, "");
  }
  constructor(
    public module: Type,
    public value: ReturnType<typeof emptySpec>,
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
    // A standalone copy of the module's metadata with `imports` stripped, so we can build the
    // Swagger doc for THIS module in isolation (without recursively pulling in its imports).
    const facadeMetadata = {
      ...meta,
      imports: [],
      controllers: meta.controllers ? [...meta.controllers] : undefined,
      providers: meta.providers ? [...meta.providers] : undefined,
      exports: meta.exports ? [...meta.exports] : undefined,
    };
    @Module(facadeMetadata)
    class FacadeModule {}
    const origLog = console.log;
    const host = new DanetApplication();
    try {
      // DanetApplication.init() prints banner/init noise to console.log; silence it just for
      // this throwaway facade init so building docs doesn't spam the host app's logs. Restored
      // in the finally below (and on throw).
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
