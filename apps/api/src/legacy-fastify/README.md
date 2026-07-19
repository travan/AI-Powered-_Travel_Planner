# Legacy Fastify API

The active API server now boots through NestJS from `src/index.ts`.

This folder intentionally preserves the previous Fastify composition layer so the original route wiring and business-flow mapping can be reviewed while the NestJS/DDD migration is validated. Business logic remains in `src/modules/**/application`, `src/modules/**/domain`, and `src/db/**`, so both the legacy reference and the new Nest controllers point at the same core behavior during the transition.

Do not register new API routes here. Add new HTTP entrypoints under each module's `interfaces/http` folder.
