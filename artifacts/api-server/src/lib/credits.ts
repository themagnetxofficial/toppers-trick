/**
 * Credit batch helpers — all credit balance reads and mutations go through here.
 *
 * Design:
 *  - Free signup credits: stored with expiresAt = NULL (never expire)
 *  - Paid purchase credits: stored with expiresAt = purchasedAt + 30 days
 *  - Deduction order: soonest-expiring paid credits first, free credits last
 *  - Refund: credits are returned to the oldest non-full non-expired batch; if
 *    none exists (all expired), a tiny free non-expiring batch is created so the
 *    user never silently loses a refund.
 */

import { db, creditBatchesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export interface CreditBatchInfo {
  credits: number;
  isPaid: boolean;
  expiresAt: Date | null;
  purchasedAt: Date;
}

export interface CreditInfo {
  creditsRemaining: number;
  totalPurchased: number;
  freeCreditUsed: boolean;
  /** Earliest expiry date among non-expired paid batches, null if only free credits remain */
  nextExpiresAt: Date | null;
  /** All non-empty, non-expired batches (for detailed display) */
  batches: CreditBatchInfo[];
}

/** Sum of all non-expired credits for a user. */
export async function getAvailableCredits(userId: number): Promise<number> {
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(credits_remaining), 0)::integer AS total
    FROM credit_batches
    WHERE user_id = ${userId}
      AND credits_remaining > 0
      AND (expires_at IS NULL OR expires_at > NOW())
  `);
  return (result.rows[0] as { total: number }).total;
}

/** Full credit info for the /me/credits endpoint. */
export async function getCreditInfo(userId: number): Promise<CreditInfo> {
  const batches = await db
    .select()
    .from(creditBatchesTable)
    .where(eq(creditBatchesTable.userId, userId))
    .orderBy(creditBatchesTable.purchasedAt);

  const now = new Date();

  // Only count non-expired batches with credits remaining
  const activeBatches = batches.filter(
    (b) => b.creditsRemaining > 0 && (b.expiresAt === null || b.expiresAt > now)
  );

  const creditsRemaining = activeBatches.reduce((s, b) => s + b.creditsRemaining, 0);

  // totalPurchased = sum of all paid batches ever created
  const totalPurchased = batches
    .filter((b) => b.isPaid)
    .reduce((s, b) => s + b.creditsTotal, 0);

  // Earliest expiry among active paid batches
  const activePaidBatches = activeBatches
    .filter((b) => b.isPaid && b.expiresAt !== null)
    .sort((a, b) => a.expiresAt!.getTime() - b.expiresAt!.getTime());
  const nextExpiresAt = activePaidBatches.length > 0 ? activePaidBatches[0].expiresAt : null;

  return {
    creditsRemaining,
    totalPurchased,
    freeCreditUsed: false, // kept for backward compat; free credits never expire
    nextExpiresAt,
    batches: activeBatches.map((b) => ({
      credits: b.creditsRemaining,
      isPaid: b.isPaid,
      expiresAt: b.expiresAt,
      purchasedAt: b.purchasedAt,
    })),
  };
}

/**
 * Atomically deduct 1 credit from the oldest non-expired batch.
 * Paid/expiring batches are consumed before free/non-expiring ones.
 * Returns null if no credits are available (caller should 402).
 */
export async function deductOneCredit(
  userId: number
): Promise<{ batchId: number } | null> {
  const result = await db.execute(sql`
    WITH target AS (
      SELECT id
      FROM credit_batches
      WHERE user_id = ${userId}
        AND credits_remaining > 0
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY
        CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END ASC,
        expires_at ASC NULLS LAST
      LIMIT 1
    )
    UPDATE credit_batches
    SET credits_remaining = credits_remaining - 1
    WHERE id = (SELECT id FROM target)
      AND credits_remaining > 0
    RETURNING id
  `);
  const rows = result.rows as { id: number }[];
  if (!rows.length) return null;
  return { batchId: rows[0].id };
}

/**
 * Refund 1 credit back into the oldest non-full non-expired batch.
 * If no valid batch exists (all expired), creates a 1-credit free batch
 * so refunds are never silently lost.
 */
export async function refundOneCredit(userId: number): Promise<void> {
  const result = await db.execute(sql`
    WITH target AS (
      SELECT id
      FROM credit_batches
      WHERE user_id = ${userId}
        AND credits_remaining < credits_total
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY
        CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END ASC,
        expires_at ASC NULLS LAST
      LIMIT 1
    )
    UPDATE credit_batches
    SET credits_remaining = credits_remaining + 1
    WHERE id = (SELECT id FROM target)
    RETURNING id
  `);
  const rows = result.rows as { id: number }[];
  if (!rows.length) {
    // No valid batch to refund into → create a non-expiring free batch
    await db.insert(creditBatchesTable).values({
      userId,
      creditsTotal: 1,
      creditsRemaining: 1,
      isPaid: false,
      expiresAt: null,
    });
  }
}
