# Docker development with automatic updates

From the repository root, run:

```sh
pnpm docker:dev
```

Keep this terminal running. The command builds and starts the existing **stack** project with a development overlay and enables Compose Watch. It uses the same stack database volumes and ports; it changes `server` and `ui` to development images. If you are running the separate unified/profiles deployment, stop those app services first to free ports; this command does not migrate their database volumes into the stack project.

- Web components, routes, translations and styles sync into the UI container. Next.js development mode refreshes the browser automatically.
- API and shared package source sync into the API container. Compose restarts that service and TypeScript recompiles before startup, preserving Nest decorator metadata. Requests may briefly fail while it restarts; you do not need to restart Docker yourself.
- Changing the lockfile or application package.json automatically rebuilds the affected development image. Run pnpm install when changing dependencies so the lockfile is current.
- Host node_modules, .next, dist and environment files are not synced. Dependencies and generated output stay in Linux containers.

Database migrations are deliberately not executed on every source edit. Add a new migration, then run the migration service explicitly:

```sh
docker compose --env-file .env -f deploy/docker/docker-compose.stack.yml run --rm migrate
```

If you changed the migration runner itself, build the migrate image first. Do not edit a migration already applied to the database.

Changes to `.env`, Compose configuration, root/workspace package manifests or workspace layout require restarting `pnpm docker:dev` so containers receive the updated configuration/build. Source edits made while Watch was stopped are included by `--build` on the next invocation. Do not run plain `docker compose restart` expecting environment changes to apply.

To return to the normal built application, stop the watch command and run `pnpm docker:stack:up`. No database volume deletion is needed.

This configuration uses Docker Compose Watch (`sync`, `sync+restart`, `rebuild`): https://docs.docker.com/compose/how-tos/file-watch/. Compose must support `sync+restart` (2.23+); validated with the installed 2.35.1 Compose schema. Keep development mode local; deploy with the normal stack/unified configuration.
