import { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable, creditsTable, creditBatchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import {
  DATABASE_UNAVAILABLE_MESSAGE,
  isDatabaseUnavailable,
} from "./serviceAvailability";

type ClerkEmailAddress = {
  id?: unknown;
  email_address?: unknown;
};

type ClerkUserProfile = {
  email: string | null;
  name: string | null;
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getClerkSecretKey(): string | undefined {
  return process.env.NODE_ENV === "production"
    ? process.env.CLERK_SECRET_KEY
    : process.env.CLERK_TEST_SECRET_KEY ?? process.env.CLERK_SECRET_KEY;
}

export async function fetchClerkUserProfile(
  clerkUserId: string,
): Promise<ClerkUserProfile> {
  const secretKey = getClerkSecretKey();
  if (!secretKey) {
    logger.warn(
      { clerkUserId },
      "Clerk secret key unavailable while provisioning user profile",
    );
    return { email: null, name: null };
  }

  try {
    const response = await fetch(
      `https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(3_000),
      },
    );

    if (!response.ok) {
      throw new Error(`Clerk user lookup returned HTTP ${response.status}`);
    }

    const profile = (await response.json()) as {
      primary_email_address_id?: unknown;
      email_addresses?: unknown;
      first_name?: unknown;
      last_name?: unknown;
    };
    const primaryEmailAddressId = asNonEmptyString(
      profile.primary_email_address_id,
    );
    const emailAddresses = Array.isArray(profile.email_addresses)
      ? (profile.email_addresses as ClerkEmailAddress[])
      : [];
    const primaryEmail =
      emailAddresses.find(
        (address) =>
          primaryEmailAddressId &&
          asNonEmptyString(address.id) === primaryEmailAddressId,
      ) ?? emailAddresses[0];
    const email = asNonEmptyString(primaryEmail?.email_address);
    const nameParts = [
      asNonEmptyString(profile.first_name),
      asNonEmptyString(profile.last_name),
    ].filter((part): part is string => Boolean(part));

    return {
      email,
      name: nameParts.length > 0 ? nameParts.join(" ") : null,
    };
  } catch (err) {
    logger.warn(
      { err, clerkUserId },
      "Unable to fetch Clerk profile during user provisioning",
    );
    return { email: null, name: null };
  }
}

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
      const profile = await fetchClerkUserProfile(clerkUserId);
      const [newUser] = await db
        .insert(usersTable)
        .values({ clerkUserId, email: profile.email, name: profile.name })
        .returning();
      user = newUser;

      // Legacy credits row (kept for backward compatibility)
      await db.insert(creditsTable).values({
        userId: user.id,
        creditsRemaining: 1,
        totalPurchased: 0,
        freeCreditUsed: false,
      });

      // Free trial credits as a non-expiring batch
      await db.insert(creditBatchesTable).values({
        userId: user.id,
        creditsTotal: 1,
        creditsRemaining: 1,
        isPaid: false,
        expiresAt: null, // free credits never expire
      });

      logger.info({ userId: user.id }, "New user provisioned with 1 free credit");
    }

    req.userId = user.id;
    next();
  } catch (err) {
    logger.error({ err }, "Error in requireAuth JIT provisioning");
    if (isDatabaseUnavailable(err)) {
      res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
      return;
    }

    res.status(500).json({ error: "Unable to verify your account right now." });
  }
};
