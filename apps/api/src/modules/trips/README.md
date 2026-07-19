# Trips Module Structure

This module follows a lightweight NestJS/DDD-style layering while keeping the
current Fastify runtime:

- `dto/`: Zod request DTOs and route param validation.
- `application/`: use-case services. Routes call services instead of reaching
  directly into repositories.
- `domain/`: pure business rules such as group permissions, approval behavior,
  and split calculation.
- `../../db/trip-store.ts`: PostgreSQL repository adapter. It owns SQL and
  persistence mapping only.

Routes under `src/routes/trips.ts` should stay thin:

1. authenticate user
2. parse params/body with DTOs
3. call `TripService`
4. map service result to HTTP response

When adding a new trip feature, start by adding or updating the DTO, then model
the use-case in `TripService`, and keep SQL in the repository adapter.
