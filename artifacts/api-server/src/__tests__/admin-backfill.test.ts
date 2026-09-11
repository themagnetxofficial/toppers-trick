import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  analysesTable,
  blogPostsTable,
  contactSubmissionsTable,
  creditBatchesTable,
  db,
  fetchClerkUserProfile,
  logger,
  paymentsTable,
  tokenUsageLogsTable,
  updateCalls,
  usersTable,
} = vi.hoisted(() => {
  const usersTable = {
    id: "users.id",
    clerkUserId: "users.clerk_user_id",
    email: "users.email",
  };
  const updateCalls: Array<{ table: unknown; values: unknown; where: unknown }> = [];
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() =>
          Promise.resolve([
            { id: 10, clerkUserId: "user_success" },
            { id: 11, clerkUserId: "user_lookup_failed" },
          ]),
        ),
      })),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: unknown) => ({
        where: vi.fn(async (where: unknown) => {
          updateCalls.push({ table, values, where });
        }),
      })),
    })),
    execute: vi.fn(),
  };

  return {
    analysesTable: {},
    blogPostsTable: {},
    contactSubmissionsTable: {},
    creditBatchesTable: {},
    db,
    fetchClerkUserProfile: vi.fn(),
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    paymentsTable: {},
    tokenUsageLogsTable: {},
    updateCalls,
    usersTable,
  };
});

vi.mock("@workspace/db", () => ({
  analysesTable,
  blogPostsTable,
  contactSubmissionsTable,
  creditBatchesTable,
  db,
  paymentsTable,
  tokenUsageLogsTable,
  usersTable,
}));
vi.mock("../lib/adminAuth", () => ({
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/auth", () => ({ fetchClerkUserProfile }));
vi.mock("../lib/logger", () => ({ logger }));

import adminRouter from "../routes/admin";

describe("POST /admin/backfill-user-emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateCalls.length = 0;
    fetchClerkUserProfile.mockImplementation(async (clerkUserId: string) =>
      clerkUserId === "user_success"
        ? {
            email: "student@example.com",
            name: "Asha Sharma",
            failureReason: null,
          }
        : {
            email: null,
            name: null,
            failureReason: "Unable to fetch profile from Clerk",
          },
    );
  });

  it("updates available Clerk profiles and reports per-user lookup failures", async () => {
    const app = express().use(express.json()).use(adminRouter);

    const response = await request(app).post("/admin/backfill-user-emails");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      matched: 2,
      updated: 1,
      failed: 1,
      failures: [
        {
          userId: 11,
          reason: "Unable to fetch profile from Clerk",
        },
      ],
    });
    expect(fetchClerkUserProfile).toHaveBeenCalledTimes(2);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({
      table: usersTable,
      values: {
        email: "student@example.com",
        name: "Asha Sharma",
      },
    });
  });
});