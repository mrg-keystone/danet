export {
  Server,
  DanetHttpAdapter,
  HttpAdapter,
  SwaggerDescription,
  setupWithSwagger,
  DanetDocumentBuilder,
  bootstrapServer,
  InjectValue,
  InjectFactory,
  InjectClass,
} from "@foundation/mod-root.ts";

export function safeStart(cb: () => Promise<void>): Promise<void> | undefined {
  if (import.meta.main) {
    return cb();
  }
}
