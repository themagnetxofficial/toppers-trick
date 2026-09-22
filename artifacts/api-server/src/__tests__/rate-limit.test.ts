import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../middlewares/rateLimit";
import { ANALYSIS_CREATION_RATE_LIMIT } from "../routes/analyses";
import {
  CLERK_AUTH_RATE_LIMIT,
  isClerkSignInOrSignUpMutation,
} from "../middlewares/rateLimit";

describe("analysis creation rate limiting", () => {
  it("is configured for five new analyses per minute", () => {
    expect(ANALYSIS_CREATION_RATE_LIMIT).toEqual({
      windowMs: 60_000,
      maxRequests: 5,
    });
  });

  it("returns a helpful 429 after the per-user allowance is exhausted", async () => {
    const app = express();
    app.use(express.json());
    app.post(
      "/analyses",
      (req, _res, next) => {
        req.userId = 42;
        next();
      },
      createRateLimiter({
        windowMs: 60_000,
        maxRequests: 2,
        keyGenerator: (req) => `user:${req.userId}`,
        message:
          "You're creating analyses too quickly. Please wait a minute and try again.",
      }),
      (_req, res) => res.status(201).json({ ok: true }),
    );

    expect((await request(app).post("/analyses")).status).toBe(201);
    expect((await request(app).post("/analyses")).status).toBe(201);

    const limited = await request(app).post("/analyses");
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      error:
        "You're creating analyses too quickly. Please wait a minute and try again.",
    });
    expect(limited.headers["retry-after"]).toBeDefined();
  });

  it("tracks authenticated users separately", async () => {
    const app = express();
    let userId = 1;
    app.post(
      "/analyses",
      (req, _res, next) => {
        req.userId = userId;
        next();
      },
      createRateLimiter({
        windowMs: 60_000,
        maxRequests: 1,
        keyGenerator: (req) => `user:${req.userId}`,
        message: "Please wait before creating another analysis.",
      }),
      (_req, res) => res.status(201).json({ ok: true }),
    );

    expect((await request(app).post("/analyses")).status).toBe(201);
    expect((await request(app).post("/analyses")).status).toBe(429);

    userId = 2;
    expect((await request(app).post("/analyses")).status).toBe(201);
  });
});

describe("Clerk sign-in and sign-up rate limiting", () => {
  it("is configured for ten attempts per minute per IP", () => {
    expect(CLERK_AUTH_RATE_LIMIT).toEqual({
      windowMs: 60_000,
      maxRequests: 10,
    });
  });

  it("recognizes only Clerk sign-in and sign-up POST requests", () => {
    const matching = {
      method: "POST",
      originalUrl: "/api/__clerk/v1/client/sign_ins/attempts",
    } as express.Request;
    const readOnly = {
      method: "GET",
      originalUrl: "/api/__clerk/v1/client/sign_ins",
    } as express.Request;
    const tokenRefresh = {
      method: "POST",
      originalUrl: "/api/__clerk/v1/client/sessions/session_1/tokens/app",
    } as express.Request;

    expect(isClerkSignInOrSignUpMutation(matching)).toBe(true);
    expect(isClerkSignInOrSignUpMutation(readOnly)).toBe(false);
    expect(isClerkSignInOrSignUpMutation(tokenRefresh)).toBe(false);
  });
});