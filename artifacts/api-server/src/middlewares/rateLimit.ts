import type { NextFunction, Request, RequestHandler, Response } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  keyGenerator: (req: Request) => string | null;
  message: string;
  skip?: (req: Request) => boolean;
  onLimit?: (req: Request) => void;
}

export function createRateLimiter({
  windowMs,
  maxRequests,
  keyGenerator,
  message,
  skip,
  onLimit,
}: RateLimiterOptions): RequestHandler {
  const entries = new Map<string, RateLimitEntry>();
  let nextSweepAt = Date.now() + windowMs;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (skip?.(req)) {
      next();
      return;
    }

    const key = keyGenerator(req);
    if (!key) {
      next();
      return;
    }

    const now = Date.now();
    if (now >= nextSweepAt) {
      for (const [storedKey, entry] of entries) {
        if (entry.resetAt <= now) entries.delete(storedKey);
      }
      nextSweepAt = now + windowMs;
    }

    let entry = entries.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      entries.set(key, entry);
    }

    const remaining = Math.max(0, maxRequests - entry.count);
    res.setHeader("RateLimit-Limit", maxRequests);
    res.setHeader("RateLimit-Remaining", Math.max(0, remaining - 1));
    res.setHeader("RateLimit-Reset", Math.ceil(entry.resetAt / 1000));

    if (entry.count >= maxRequests) {
      res.setHeader(
        "Retry-After",
        Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      );
      onLimit?.(req);
      res.status(429).json({ error: message });
      return;
    }

    entry.count += 1;
    next();
  };
}

export const CLERK_AUTH_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 10,
} as const;

function getClientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  const firstForwardedIp = (
    Array.isArray(forwarded) ? forwarded[0] : forwarded
  )
    ?.split(",")[0]
    ?.trim();

  return firstForwardedIp || req.socket.remoteAddress || null;
}

export function isClerkSignInOrSignUpMutation(req: Request): boolean {
  return (
    req.method === "POST" &&
    /\/v1\/client\/sign_(?:ins|ups)(?:\/|$)/.test(req.originalUrl)
  );
}

export const limitClerkSignInAndSignUp = createRateLimiter({
  ...CLERK_AUTH_RATE_LIMIT,
  keyGenerator: (req) => {
    const clientIp = getClientIp(req);
    return clientIp ? `ip:${clientIp}` : null;
  },
  skip: (req) => !isClerkSignInOrSignUpMutation(req),
  message:
    "Too many sign-in or sign-up attempts. Please wait a minute and try again.",
});