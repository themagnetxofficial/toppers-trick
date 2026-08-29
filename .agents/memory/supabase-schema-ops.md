---
name: Supabase schema operations
description: Operational constraint for keeping the external Supabase database aligned with the Drizzle schema.
---

The external Supabase database may lag the Drizzle schema after code changes. The normal Drizzle push can stop in a non-interactive workflow when it detects unrelated constraint differences and asks whether to truncate existing data.

**Why:** A broad forced push can make an unrelated schema change or destructive data decision while fixing a single missing column.

**How to apply:** Inspect the live schema first. For a known additive mismatch, apply only the required `ADD COLUMN IF NOT EXISTS` statements transactionally through the existing database connection, then restart the API and verify the affected query path.