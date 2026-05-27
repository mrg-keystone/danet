# @mrg-keystone/danet

Core module for the Danet framework. Provides server bootstrapping with automatic OpenAPI/Swagger documentation generation.

## Quick Start

```typescript
import "reflect-metadata";
import { bootstrapServer, SwaggerDescription } from "@mrg-keystone/danet";
import { Controller, Get, Module } from "@danet/core";

@Controller("health")
class HealthController {
  @Get()
  check() {
    return { status: "ok" };
  }
}

@SwaggerDescription("Users API")
@Controller("users")
class UsersController {
  @Get()
  list() {
    return [{ id: 1, name: "Alice" }];
  }
}

@Module({ controllers: [HealthController] })
class HealthModule {}

@Module({ controllers: [UsersController] })
class UsersModule {}

@Module({ imports: [HealthModule, UsersModule] })
class AppModule {}

const server = await bootstrapServer(AppModule, { port: 3000 });
await server.listen();
```

This starts a server on port 3000 with:
- `/health` and `/users` endpoints
- `/docs` landing page with links to per-module Swagger specs

## API

### `bootstrapServer(module, options)`

Creates and configures a server with optional Swagger documentation.

- `module` — Root application module class
- `options.port` — Port number (default: 3000)
- `options.swagger` — `true` (default), `false`, or `{ filters: string[] }` to exclude modules

Returns `{ listen(), stop() }`.

### `setupWithSwagger(server)`

Lower-level alternative. Takes an existing `Server` instance and returns a configured `HttpAdapter` with Swagger routes registered, without starting it.

### `@SwaggerDescription(description)`

Decorator to attach a custom description to a module's Swagger documentation.

### `Server`

Module registry. Create with `Server.create()`, register modules with `registerModule()`.

### `DanetDocumentBuilder`

Generates OpenAPI 3.0 specification objects from module metadata.

### `InjectValue`, `InjectFactory`, `InjectClass`

Dependency injection container builders for configuring injectable services.

## Testing

```sh
deno test -A --unstable-raw-imports
```
