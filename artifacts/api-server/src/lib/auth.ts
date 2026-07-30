import { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable, creditsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

// Extend Request type to include userId
declare global {
  namespace Express {
    interface Request {
      userId?: number;
      clerkUserId?: string;
    }
  }
}

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;

  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.clerkUserId = clerkUserId;

  // JIT provision user in DB
  try {
    let user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, clerkUserId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!user) {
      const [newUser] = await db
        .insert(usersTable)
        .values({ clerkUserId })
        .returning();
      user = newUser;

      // Give 2 free credits
      await db.insert(creditsTable).values({
        userId: user.id,
        creditsRemaining: 2,
        totalPurchased: 0,
        freeCreditUsed: false,
      });

      logger.info({ userId: user.id }, "New user provisioned with 2 free credits");
    }

    req.userId = user.id;
    next();
  } catch (err) {
    logger.error({ err }, "Error in requireAuth JIT provisioning");
    res.status(500).json({ error: "Internal server error" });
  }
};
