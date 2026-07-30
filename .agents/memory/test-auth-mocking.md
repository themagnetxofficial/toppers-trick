---
name: Test auth mocking patterns
description: How to mock Clerk auth and the database in vitest for the api-server package
---

# Test auth mocking patterns (api-server vitest)

## Rule
Use `vi.hoisted()` + `vi.mock()` to set up mutable shared state that vitest
mock factories can access before ES module imports are resolved.

**Why:** `vi.mock()` factories are hoisted before imports and can't reference
variables declared later in the file.  `vi.hoisted()` hoists alongside them.

**How to apply:** Any test file that needs to reconfigure mock DB responses
per-test should declare state with `vi.hoisted()` and mutate it in `beforeEach`
or inside the test body.

## Key specifics

### DB mock (fluent chain)
The Drizzle query chain (`db.select().from(t).where().limit().then(fn)`) needs
a custom chain object where `.then()` is a thenable that captures the `rows`
variable set by `.from(table)`.  Use a closure that reads `rows` lazily.

### Clerk auth mock
`getAuth` **must be `vi.fn(...)`** inside the `vi.mock("@clerk/express")` factory —
not a plain arrow function — so individual tests can call
`vi.mocked(clerkMod.getAuth).mockReturnValueOnce(...)`.

### File path validation in analyses.ts
`POST /api/analyses` validates that uploaded paths start with
`path.join(process.cwd(), "uploads")`.  In vitest, `process.cwd()` is the
package root (`artifacts/api-server`), so test fixtures must be written to
`<cwd>/uploads/` (not a temp dir) to pass the security check.

### Zod schema gotchas
`GetAnalysisResponse.aiResponse.chapters[].marks_weightage` is `zod.string()`
(not number).  `priority` is `zod.enum(['High','Medium','Low'])` — capitalised.
The `aiResponse` object also requires top-level `subject` and `category` fields.
