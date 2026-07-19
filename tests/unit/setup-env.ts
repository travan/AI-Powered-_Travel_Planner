process.env.NODE_ENV ??= "test";
process.env.DATABASE_PROVIDER ??= "postgres";
process.env.POSTGRES_URL ??= "postgres://test:test@localhost:5432/travel_planner_test";
process.env.MONGODB_URI ??= "mongodb://localhost:27017/travel_planner_test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "unit-test-secret-with-at-least-32-chars";
