---
name: Build worker limits
description: How to distinguish a Replit process-capacity incident from an application build failure.
---

When Vite, esbuild, or Vitest cannot create worker threads, inspect the process table before changing app dependencies or build scripts. A recursive `pnpm add pnpm@...` bootstrap chain can consume the workspace process quota long after the original install attempt.

**Why:** The resulting `EAGAIN`, Node worker assertion, or Go `newosproc` errors look like frontend or package failures, but the application can typecheck and build normally once stale package-manager workers are cleared.

**How to apply:** Stop only the identified stale package-manager chain, then rerun the build in an idle workspace. Do not commit thread-limit environment variables as a workaround unless the clean build still needs them.