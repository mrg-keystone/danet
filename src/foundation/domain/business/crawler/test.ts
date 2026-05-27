import { assertEquals, assertExists } from "#assert";
import { Module } from "#danet/core";
import { Crawler } from "./mod.ts";

Deno.test("it should work", () => {
  assertExists(new Crawler());
});

Deno.test("it should get all import constructors from a module", () => {
  @Module({})
  class ImportedModuleA {}

  @Module({})
  class ImportedModuleC {}

  @Module({
    imports: [ImportedModuleA, ImportedModuleC],
  })
  class ImportedModuleB {}

  const crawler = new Crawler();
  const imports = crawler.getModuleImports(ImportedModuleB);
  assertEquals(imports.length, 2);
  assertEquals(imports, [ImportedModuleA, ImportedModuleC]);
});

Deno.test("it should crawl all modules", () => {
  @Module({})
  class ImportedModuleA {}

  @Module({
    imports: [ImportedModuleA],
  })
  class ImportedModuleC {}

  @Module({
    imports: [ImportedModuleA, ImportedModuleC],
  })
  class ImportedModuleB {}

  const crawler = new Crawler();
  const allModules = crawler.crawl([ImportedModuleB]);
  assertEquals(allModules.length, 3);
  assertEquals(allModules, [ImportedModuleB, ImportedModuleA, ImportedModuleC]);
});
