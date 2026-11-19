# Security upgrade compatibility

The overrides in `pnpm-workspace.yaml` select patched transitive dependencies.
Two API adapters keep Expo SDK 53 working with those versions:

- `metro@0.82.5.patch` uses the named `imageSize` export introduced in
  `image-size` 2 and reads image files into buffers before decoding. The old
  callable CommonJS export and direct filesystem path input no longer exist.
- `decode-uri-component@0.5.1.patch` exposes the patched decoder as CommonJS
  for `query-string` 7, used by Expo Linking. Only the module format changes;
  the upstream decoding algorithm and its DoS fixes remain unchanged.

Keep these patches in dependency installation contexts, including Docker and
deployment archives. Remove each adapter after upgrading its consumer to a
version that supports the new API. Verify with
`pnpm exec vitest run tests/unit/tooling/dependency-compatibility.test.ts`.
