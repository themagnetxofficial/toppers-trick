---
name: Post-merge setup
description: Constraints for reliable unattended setup after task merges.
---

Use `corepack pnpm@11.17.0` explicitly in post-merge and managed workflow commands rather than relying on the system `pnpm` shim.

**Why:** The system shim can recursively bootstrap the workspace-pinned pnpm version with `pnpm add`, which may abort under Replit process/resource limits.

Keep database schema pushes out of unattended post-merge hooks unless the operation is guaranteed non-interactive and non-destructive.

**Why:** Drizzle can prompt to truncate populated tables when reconciling schema drift; stdin is closed during post-merge setup, and auto-approving that prompt risks data loss.

**How to apply:** Let the post-merge hook install dependencies and run a build. Apply reviewed database changes explicitly, and use the validated artifact configuration flow when changing managed service commands.