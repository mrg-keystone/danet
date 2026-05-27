import type { Type, Cotr, HttpMethod } from "@types";
import { SwaggerModule } from "#danet/swagger";
import { DanetApplication } from "#danet/core";

export abstract class HttpAdapter {
  constructor(public defaultPort?: number) {}
  abstract listen(...args: unknown[]): Promise<void>;
  abstract grabComponent<T extends Type<any>>(cotr: T): InstanceType<T>;
}

export class DanetHttpAdapter extends HttpAdapter {
  app: DanetApplication = new DanetApplication();
  constructor(defaultPort?: number) {
    super(defaultPort);
  }

  async listen(rootModule: Type) {
    const port = this.defaultPort ?? 3000;
    await this.app.init(rootModule);
    await this.app.listen(port);
  }

  registerSwaggerDocument(atPath: string, document: Parameters<typeof SwaggerModule.setup>[2]) {
    SwaggerModule.setup(atPath, this.app, document);
  }

  registerRoute(
    method: Lowercase<HttpMethod>,
    path: string,
    handler: (...args: unknown[]) => unknown,
  ) {
    //@ts-ignore: methods are in router
    const registerFn = this.app.router[method];
    registerFn.call(this.app.router, path, handler);
  }

  grabComponent = <T extends Cotr>(cotr: T): InstanceType<T> => this.app.get(cotr);

  async stop() {
    await this.app.close();
  }
}
