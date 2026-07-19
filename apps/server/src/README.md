# NestJS API Server

This package is the NestJS API server. It is intentionally separate from `apps/api`, which remains the legacy Fastify/reference package for historical review only.

DDD-oriented structure:

- `modules/*/interfaces/http`: Nest controllers and HTTP-only mapping.
- `shared/nest`: Nest guards, decorators, validation, and HTTP error mapping.
- Runtime code must not import from `apps/api/src` or `apps/api/dist`.
- Database access belongs in `modules/*/infrastructure` through repository ports.
- HTTP controllers should only validate/map requests and call application services.

Next migration step: implement the remaining domain modules in this structure, using Auth as the reference pattern.
