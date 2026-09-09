import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  creditBatchesTable,
  creditsTable,
  db,
  dbState,
  getAuth,
  insertValues,
  logger,
  usersTable,
} = vi.hoisted(() => {
  const usersTable = { table: "users" };
  const creditsTable = { table: "credits" };
  const creditBatchesTable = { table: "credit_batches" };
  const dbState = {
    existingUser: null as { id: number; clerkUserId: string } | null,
  };
  const insertValues: Array<{ table: unknown; values: unknown }> = [];

  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() =>
            Promise.resolve(
              dbState.existingUser ? [dbState.existingUser] : [],
            ),
          ),
        })),
      })),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => {
        insertValues.push({ table, values });
        if (table === usersTable) {
          return {
            returning: vi.fn(() =>
              Promise.resolve([{ id: 42, ...(values as object) }]),
            ),
          };
        }
        return Promise.resolve([]);
      }),
    })),
  };

  return {
    creditBatchesTable,
    creditsTable,
    db,
    dbState,
    getAuth: vi.fn(),
    insertValues,
    logger: {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
    usersTable,
  };
});

vi.mock("@clerk/express", () => ({ getAuth }));
vi.mock("@workspace/db", () => ({
  creditBatchesTable,
  creditsTable,
  db,
  usersTable,
}));
vi.mock("../lib/logger", () => ({ logger }));

import { requireAuth } from "../lib/auth";

function makeResponse() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
}

describe("requireAuth user profile provisioning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.existingUser = null;
    insertValues.length = 0;
    getAuth.mockReturnValue({ userId: "user_new" });
    process.env.NODE_ENV = "test";
    process.env.CLERK_TEST_SECRET_KEY = "test_secret";
  });

  it("stores the primary Clerk email and full name for a new user", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          primary_email_address_id: "email_primary",
          email_addresses: [
            { id: "email_other", email_address: "other@example.com" },
            { id: "email_primary", email_address: "student@example.com" },
          ],
          first_name: "Asha",
          last_name: "Sharma",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const req = {} as Parameters<typeof requireAuth>[0];
    const res = makeResponse();
    const next = vi.fn();

    await requireAuth(
      req,
      res as unknown as Parameters<typeof requireAuth>[1],
      next,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(insertValues[0]).toEqual({
      table: usersTable,
      values: {
        clerkUserId: "user_new",
        email: "student@example.com",
        name: "Asha Sharma",
      },
    });
    expect(req.userId).toBe(42);
    expect(next).toHaveBeenCalledOnce();
  });

  it("continues provisioning with null profile fields when Clerk fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const req = {} as Parameters<typeof requireAuth>[0];
    const res = makeResponse();
    const next = vi.fn();

    await requireAuth(
      req,
      res as unknown as Parameters<typeof requireAuth>[1],
      next,
    );

    expect(insertValues[0]).toEqual({
      table: usersTable,
      values: {
        clerkUserId: "user_new",
        email: null,
        name: null,
      },
    });
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
  });

  it("does not call Clerk for an existing database user", async () => {
    dbState.existingUser = { id: 7, clerkUserId: "user_existing" };
    getAuth.mockReturnValue({ userId: "user_existing" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const req = {} as Parameters<typeof requireAuth>[0];
    const res = makeResponse();
    const next = vi.fn();

    await requireAuth(
      req,
      res as unknown as Parameters<typeof requireAuth>[1],
      next,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(req.userId).toBe(7);
    expect(next).toHaveBeenCalledOnce();
  });
});