import { Router, IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, creditsTable, analysesTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
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
  const credits = await db
    .select()
    .from(creditsTable)
    .where(eq(creditsTable.userId, req.userId!))
    .limit(1)
    .then((rows) => rows[0]);

  if (!credits) {
    res.json(GetMyCreditsResponse.parse({
      creditsRemaining: 0,
      totalPurchased: 0,
      freeCreditUsed: false,
    }));
    return;
  }

  res.json(GetMyCreditsResponse.parse({
    creditsRemaining: credits.creditsRemaining,
    totalPurchased: credits.totalPurchased,
    freeCreditUsed: credits.freeCreditUsed,
  }));
});

router.get("/me/stats", requireAuth, async (req, res): Promise<void> => {
  const [credits, analyses] = await Promise.all([
    db
      .select()
      .from(creditsTable)
      .where(eq(creditsTable.userId, req.userId!))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select()
      .from(analysesTable)
      .where(eq(analysesTable.userId, req.userId!)),
  ]);

  const completedAnalyses = analyses.filter((a: typeof analyses[0]) => a.status === "completed");
  const subjects = [...new Set(completedAnalyses.map((a: typeof analyses[0]) => a.subject))];
  const creditsUsed = analyses.filter(
    (a: typeof analyses[0]) => a.status === "completed" || a.status === "processing"
  ).length;

  res.json(GetMyStatsResponse.parse({
    totalAnalyses: completedAnalyses.length,
    creditsUsed,
    subjectsAnalyzed: subjects,
    creditsRemaining: credits?.creditsRemaining ?? 0,
  }));
});

export default router;
