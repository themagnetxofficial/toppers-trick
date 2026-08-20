---
name: Hostinger build environment
description: Hostinger deployment shell behavior that affects workspace builds.
---

Hostinger's managed deployment can run pnpm for dependency installation, yet its later application-build shell does not expose `pnpm` on `PATH`.

**Why:** A root build script that delegates to workspace scripts through `pnpm --filter` fails after dependencies install successfully, with `pnpm: command not found`.

**How to apply:** Keep the deployment-facing root build command dependent only on Node and local project files/binaries. Do not assume the package manager used by the install phase is also available when Hostinger executes the configured build command.

For an application configured as Hostinger's **Other** type, the dashboard must be told the server entry file explicitly.

**Why:** Hostinger can report a green build while returning 503 when it has built the assets but has no configured Node entry file to run.

**How to apply:** Provide a stable root `.mjs` entrypoint that starts the compiled server, then set that exact relative file in Hostinger's Deployment settings. Make the server tolerate a missing `PORT` with a conventional fallback, while still honoring Hostinger's injected port when present.