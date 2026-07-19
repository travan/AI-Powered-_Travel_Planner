# API Server Structure

The active server is NestJS, bootstrapped from `src/index.ts` and composed in `src/app.ts`.

DDD boundaries are organized per module:

- `domain`: business rules and policies that should not depend on HTTP or database libraries.
- `application`: use-case services that orchestrate domain rules and repositories/stores.
- `dto`: contract validation schemas shared by HTTP and tests.
- `interfaces/http`: NestJS controllers, guards, and HTTP-specific mapping only.

Infrastructure adapters currently live in `src/db`, `src/lib`, and `src/workers`. The legacy Fastify HTTP composition is preserved in `src/legacy-fastify` only for review and parity checks while the NestJS migration is validated.
