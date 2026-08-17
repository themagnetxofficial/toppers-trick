import { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export const requireAdmin = async (
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

  try {
    const adminClerkUserId = process.env.ADMIN_CLERK_USER_ID;
    const isEnvAdmin = !!adminClerkUserId && clerkUserId === adminClerkUserId;

    // TEMP DEBUG — remove after admin access is confirmed
    logger.info({
      msg: "[ADMIN DEBUG] access check",
      clerkUserIdFromToken: clerkUserId,
      adminClerkUserIdFromEnv: adminClerkUserId ?? "(not set)",
      match: isEnvAdmin,
    });

    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, clerkUserId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!isEnvAdmin && !user?.isAdmin) {
      res.status(403).json({ error: "Forbidden: admin access required" });
      return;
    }

    if (user) req.userId = user.id;
    next();
  } catch (err) {
    logger.error({ err }, "Error in requireAdmin middleware");
    res.status(500).json({ error: "Internal server error" });
  }
};
