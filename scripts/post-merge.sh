#!/bin/bash
set -euo pipefail

# Use the workspace-pinned pnpm version explicitly. The system `pnpm` binary
# may be an older Corepack shim that tries to bootstrap pnpm through a
# recursive `pnpm add`, which is unreliable in the post-merge environment.
corepack pnpm@11.17.0 install --frozen-lockfile

# Database schema pushes are intentionally kept out of this unattended hook:
# `drizzle-kit push` can ask to truncate existing data. Apply DB changes
# explicitly from a development shell after reviewing the generated plan.
corepack pnpm@11.17.0 run build
