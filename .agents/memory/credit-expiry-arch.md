---
name: Credit expiry architecture
description: How the credit_batches table works, FIFO deduction, test mock patterns for db.execute
---

## The rule
Paid credits (from Razorpay purchases) expire 30 days after purchase. Free signup credits never expire. All credit reads/writes go through `artifacts/api-server/src/lib/credits.ts`.

**Why:** Per-batch tracking lets us give free credits a NULL expiry while paid credits get `purchasedAt + 30d`. FIFO deduction (soonest-expiring paid batch first, free last) ensures paid credits are always consumed before free ones.

## How to apply
- `credit_batches` table: `id, user_id, credits_total, credits_remaining, is_paid, purchased_at, expires_at (nullable), payment_id (nullable)`
- `creditsTable` (legacy) is still written to on signup for backward compat but never read for balance checks
- All credit helpers use raw SQL (`db.execute`) for the FIFO CTE UPDATE to guarantee atomicity
- `getCreditInfo` uses ORM `db.select().from(creditBatchesTable)` — fine for reads
- API response adds `nextExpiresAt` (ISO string, earliest paid batch expiry) and `batches[]` to `GetMyCreditsResponse`

## Test mock patterns
`@workspace/db` mock in `api-flow.test.ts`:
- `db.execute` mock default: `{ rows: [{ total: dbState.credits.creditsRemaining, id: 1 }] }` — satisfies both `getAvailableCredits` (reads `.total`) and `deductOneCredit` (reads `.id`)
- When credits = 0: returns `{ rows: [{ total: 0, id: 1 }] }` → `getAvailableCredits` returns 0 → 402 before `deductOneCredit` is ever called
- For "race: credits drained between pre-check and deduction" test: use `vi.mocked(db.execute).mockResolvedValueOnce(...)` twice — first for getAvailableCredits (returns 2), second for deductOneCredit (returns `{ rows: [] }`)
- `creditBatchesTable` in select mock returns a synthetic batch mirroring `dbState.credits.creditsRemaining`
- Credit deduction removed from `db.update` call chain in retry tests — retry now makes 1 `db.update` (slot claim) for happy path, 2 `db.update` (slot claim + status revert) for drained-credits path

## One-time migration
```sql
INSERT INTO credit_batches (user_id, credits_total, credits_remaining, is_paid, expires_at)
SELECT c.user_id, c.credits_remaining, c.credits_remaining, false, NULL
FROM credits c
WHERE c.credits_remaining > 0
  AND NOT EXISTS (SELECT 1 FROM credit_batches cb WHERE cb.user_id = c.user_id);
```
Run after first deploy. Already run in dev DB.
