---
name: Hostinger build environment
description: Hostinger deployment shell behavior that affects workspace builds.
---

Hostinger's managed deployment can run pnpm for dependency installation, yet its later application-build shell does not expose `pnpm` on `PATH`.

**Why:** A root build script that delegates to workspace scripts through `pnpm --filter` fails after dependencies install successfully, with `pnpm: command not found`.

**How to apply:** Keep the deployment-facing root build command dependent only on Node and local project files/binaries. Do not assume the package manager used by the install phase is also available when Hostinger executes the configured build command.