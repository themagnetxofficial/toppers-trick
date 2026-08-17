---
name: Admin + Blog route architecture
description: Key patterns and gotchas for admin.ts, blog-public.ts, contact.ts in api-server
---

## db.execute return type

`db.execute(sql`...`)` returns `{ rows: Record<string, unknown>[] }`, NOT a directly-destructurable array.

**Correct pattern** (from `credits.ts`):
```ts
const result = await db.execute(sql`SELECT ...`);
const row = result.rows[0] as { field: type };
```

**Use the sq() helper** (defined in admin.ts and blog-public.ts) to normalize both possible return types:
```ts
async function sq<T extends Record<string, unknown>>(query): Promise<T[]> {
  const result = await db.execute(query);
  return ((result as any).rows ?? result) as T[];
}
const [row] = await sq<{ total: string }>(sql`SELECT count(*) ...`);
```

**Why:** Some Drizzle versions return `{ rows: [] }`, others return an iterable array. The helper covers both.

## Zod in api-server

`zod` and `zod/v4` are NOT direct dependencies of `@workspace/api-server`. Importing them causes esbuild build failure. Use inline validation instead.

## Route ordering (blog-public.ts)

`/blog/sitemap` must be registered BEFORE `/blog/:slug`, otherwise "sitemap" is treated as a slug param and returns 404.

## Admin auth

`requireAdmin` middleware (in `adminAuth.ts`) checks:
1. Clerk JWT (standard auth)
2. Either `ADMIN_CLERK_USER_ID` env var matches the user's Clerk ID, OR `isAdmin=true` in the `users` DB table.

Bootstrap: set `ADMIN_CLERK_USER_ID` secret to your Clerk user ID (`user_xxxxxxxxx`).
