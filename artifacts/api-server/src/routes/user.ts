import { Router, IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, analysesTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { getCreditInfo } from "../lib/credits";
import { GetMeResponse, GetMyCreditsResponse, GetMyStatsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/me", requireAuth, async (req, res): Promise<void> => {
  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(GetMeResponse.parse({
    id: user.id,
    clerkUserId: user.clerkUserId,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  }));
});

router.get("/me/credits", requireAuth, async (req, res): Promise<void> => {
  const info = await getCreditInfo(req.userId!);

  res.json(GetMyCreditsResponse.parse({
    creditsRemaining: info.creditsRemaining,
    totalPurchased: info.totalPurchased,
    freeCreditUsed: info.freeCreditUsed,
    nextExpiresAt: info.nextExpiresAt ?? null,
    batches: info.batches.map((b) => ({
      credits: b.credits,
      isPaid: b.isPaid,
      expiresAt: b.expiresAt ?? null,
    })),
  }));
});

router.get("/me/stats", requireAuth, async (req, res): Promise<void> => {
  const [creditInfo, analyses] = await Promise.all([
    getCreditInfo(req.userId!),
    db
      .select()
      .from(analysesTable)
      .where(eq(analysesTable.userId, req.userId!)),
  ]);

  const completedAnalyses = analyses.filter((a) => a.status === "completed");
  const subjects = [...new Set(completedAnalyses.map((a) => a.subject))];
  const creditsUsed = analyses.filter(
    (a) => a.status === "completed" || a.status === "processing"
  ).length;

  res.json(GetMyStatsResponse.parse({
    totalAnalyses: completedAnalyses.length,
    creditsUsed,
    subjectsAnalyzed: subjects,
    creditsRemaining: creditInfo.creditsRemaining,
  }));
});

export default router;
