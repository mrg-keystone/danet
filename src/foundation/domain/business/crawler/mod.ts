import "#reflect-metadata";
import { Type } from "@types";

interface ModuleMetadata {
  imports?: Type[];
  controllers?: Type[];
  injectables?: Type[];
  exports?: Type[];
}

export class Crawler {
  private filters: string[] = [];
  constructor(...filters: string[]) {
    this.filters = filters;
  }

  private filter(modules: Type[]) {
    return modules.filter((m) => !this.filters.includes(m.name));
  }

  private moduleGuard(possibleModule: unknown): possibleModule is Type {
    return (
      typeof possibleModule === "function" &&
      "name" in possibleModule &&
      typeof possibleModule.name === "string"
    );
  }

  getModuleImports(module: Type) {
    const { imports } = Reflect.getMetadata("module", module) as ModuleMetadata;
    const processed = imports?.filter(Boolean);
    return processed ?? [];
  }

  crawl(_modules: unknown[], collected: Set<Type> = new Set()): Array<Type> {
    const modules = _modules.filter(this.moduleGuard);
    modules.forEach(collected.add.bind(collected));
    if (modules.length === 0) return this.filter(Array.from(collected));
    const newModules = modules.map(this.getModuleImports).flat();
    return this.crawl(newModules, collected);
  }
}
