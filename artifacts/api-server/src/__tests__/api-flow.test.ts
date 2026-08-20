/**
 * API Integration Tests: upload → analysis → PDF download flow
 *
 * All external dependencies (DB, Clerk auth, OpenAI, PDF gen) are mocked so
 * these tests run without a live database or API keys.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import path from "path";
import os from "os";
import fs from "fs";

// ---------------------------------------------------------------------------
// Shared mutable state — vi.hoisted() ensures it exists before vi.mock() runs
// ---------------------------------------------------------------------------
const { dbState, uploadsDir } = vi.hoisted(() => {
  // vi.hoisted runs before ES imports so we must use require() here
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const _fs = require("fs") as typeof import("fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const _path = require("path") as typeof import("path");

  // Must match UPLOADS_BASE in analyses.ts: path.join(process.cwd(), "uploads")
  // Vitest runs with process.cwd() = the package root (artifacts/api-server).
  const tmpDir = _path.join(process.cwd(), "uploads");
  _fs.mkdirSync(tmpDir, { recursive: true });

  return {
    uploadsDir: tmpDir,
    dbState: {
      user: { id: 1, clerkUserId: "test_clerk_user_id" },
      credits: { id: 1, userId: 1, creditsRemaining: 1 },
      /** Set per-test to control what GET /analyses/:id returns */
      analysis: null as Record<string, unknown> | null,
      /** Used by insert(analysesTable).returning() */
      insertedAnalysis: {
        id: 42,
        userId: 1,
        category: "school",
        classOrCourse: "12th",
        boardOrUniversity: "CBSE",
        subject: "Physics",
        status: "processing",
        inputFilePaths: [],
        pdfFilePath: null,
        aiResponseJson: null,
        errorMessage: null,
        yearsAnalyzed: null,
        createdAt: new Date().toISOString(),
      } as Record<string, unknown>,
    },
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Prevent DATABASE_URL check from throwing and stub all DB operations
vi.mock("@workspace/db", () => {
  const analysesTable = { _tag: "analysesTable" } as unknown;
  const creditsTable = { _tag: "creditsTable" } as unknown;
  const creditBatchesTable = { _tag: "creditBatchesTable" } as unknown;
  const usersTable = { _tag: "usersTable" } as unknown;
  const tokenUsageLogsTable = { _tag: "tokenUsageLogsTable" } as unknown;

  /** Build a chainable query object that resolves to `rows` */
  const makeChain = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {};
    const resolve = () => Promise.resolve(rows);
    chain.from = vi.fn().mockReturnThis();
    chain.where = vi.fn().mockReturnThis();
    chain.limit = vi.fn().mockReturnThis();
    chain.orderBy = vi.fn().mockReturnThis();
    chain.set = vi.fn().mockReturnThis();
    chain.values = vi.fn().mockReturnThis();
    chain.returning = vi.fn().mockImplementation(resolve);
    chain.then = vi
      .fn()
      .mockImplementation((fn: (v: unknown[]) => unknown) => resolve().then(fn));
    chain.catch = vi
      .fn()
      .mockImplementation((fn: (e: unknown) => unknown) =>
        resolve().catch(fn),
      );
    return chain;
  };

  const db = {
    select: vi.fn().mockImplementation(() => {
      // Intercept .from(table) to route to the right fixture data
      let rows: unknown[] = [];
      const chain: Record<string, unknown> = {};
      chain.from = vi.fn().mockImplementation((table: unknown) => {
        if (table === usersTable)
          rows = dbState.user ? [dbState.user] : [];
        else if (table === creditsTable)
          rows = dbState.credits ? [dbState.credits] : [];
        else if (table === creditBatchesTable) {
          // Return a single non-expiring free batch mirroring dbState.credits
          const rem = dbState.credits?.creditsRemaining ?? 0;
          rows = rem > 0
            ? [{ id: 1, userId: 1, creditsTotal: rem, creditsRemaining: rem,
                 isPaid: false, purchasedAt: new Date(), expiresAt: null }]
            : [];
        }
        else if (table === analysesTable)
          rows = dbState.analysis ? [dbState.analysis] : [];
        else rows = [];
        return chain;
      });
      chain.where = vi.fn().mockReturnThis();
      chain.limit = vi.fn().mockReturnThis();
      chain.orderBy = vi.fn().mockReturnThis();
      chain.then = vi
        .fn()
        .mockImplementation((fn: (v: unknown[]) => unknown) =>
          Promise.resolve(rows).then(fn),
        );
      chain.catch = vi
        .fn()
        .mockImplementation((fn: (e: unknown) => unknown) =>
          Promise.resolve(rows).catch(fn),
        );
      return chain;
    }),

    insert: vi.fn().mockImplementation((table: unknown) => {
      let returning: unknown[] = [];
      if (table === analysesTable) returning = [dbState.insertedAnalysis];
      else if (table === usersTable) returning = [dbState.user];
      // creditBatches, credits, tokenUsage inserts resolve empty
      return makeChain(returning);
    }),

    update: vi.fn().mockImplementation(() => makeChain([])),

    /**
     * execute is used by the credit helper functions:
     *   getAvailableCredits  → reads rows[0].total
     *   deductOneCredit      → reads rows[0].id (present = success, absent = null)
     *   refundOneCredit      → reads rows[0].id (present = updated, absent = insert fallback)
     *
     * Default: succeed when credits > 0; return total=0 otherwise.
     * Individual tests can call vi.mocked(db.execute).mockResolvedValueOnce() to override.
     */
    execute: vi.fn().mockImplementation(async () => {
      const available = dbState.credits?.creditsRemaining ?? 0;
      return {
        rows: [
          {
            total: available,
            ...(available > 0 ? { id: 1 } : {}),
          },
        ],
      };
    }),
    transaction: vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(db)
    ),
  };

  return { db, analysesTable, creditsTable, creditBatchesTable, usersTable, tokenUsageLogsTable };
});

// Bypass Clerk auth — make every request appear as userId = 1
// getAuth is a vi.fn() so individual tests can override it with mockReturnValueOnce
vi.mock("@clerk/express", () => ({
  clerkMiddleware:
    () =>
    (_req: unknown, _res: unknown, next: () => void) =>
      next(),
  getAuth: vi.fn(() => ({ userId: "test_clerk_user_id" })),
}));

vi.mock("@clerk/shared/keys", () => ({
  publishableKeyFromHost: () => "pk_test_dummy",
}));

// Stub the Clerk proxy middleware (used in app.ts)
vi.mock("../middlewares/clerkProxyMiddleware", () => ({
  CLERK_PROXY_PATH: "/__clerk",
  clerkProxyMiddleware:
    () =>
    (_req: unknown, _res: unknown, next: () => void) =>
      next(),
  getClerkProxyHost: () => null,
}));

// Stub AI so tests don't call OpenAI
vi.mock("../lib/openai", () => ({
  analyzeWithAI: vi.fn().mockResolvedValue({
    result: {
      subject: "Physics",
      years_analyzed: ["Paper 1"],
      topics: [
        {
          topic_name: "Newton's Laws of Motion",
          priority: "High",
          frequency: 5,
          years_appeared: ["Paper 1"],
          confidence_level: "High",
          marks_weightage: "20 marks",
          question_type_breakdown: {
            mcq: "None",
            short: "None",
            long: "5×",
            case_study: "None",
          },
          study_note: {
            kya_padhna_hai: "Newton's Laws aur equations of motion",
            kaise_poochha_jaata_hai: "Long answer 10-15 marks ka",
            repeat_pattern: "Har saal aata hai",
          },
          key_terms: ["Newton's Laws", "Equations of Motion"],
        },
      ],
      related_topic_pairs: [],
      overall_strategy_tip: "Start with Newton's Laws",
    },
    inputTokens: 100,
    outputTokens: 200,
  }),
}));

// Stub PDF generation
vi.mock("../lib/pdfService", () => ({
  getUploadsDir: () => uploadsDir,
  getPdfOutputDir: () => uploadsDir,
  generateStudyGuidePdf: vi.fn().mockResolvedValue("study-guide-42.pdf"),
}));

// Stub text extraction
vi.mock("../lib/extractText", () => ({
  extractTextFromFiles: vi
    .fn()
    .mockResolvedValue("Question 1: Describe Newton's laws (10 marks)"),
  extractTextFromFilesWithLabels: vi.fn().mockResolvedValue({
    text: "--- Year: Paper 1 ---\n\nQuestion 1: Describe Newton's laws (10 marks)",
    yearLabels: ["Paper 1"],
  }),
}));

// ---------------------------------------------------------------------------
// Import the app AFTER all mocks are registered
// ---------------------------------------------------------------------------
import app from "../app";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal file that passes multer's extension filter */
function makeFakePdf(name = "test-paper.pdf"): Buffer & { name: string } {
  const buf = Buffer.from("%PDF-1.4 fake content for upload test") as Buffer & {
    name: string;
  };
  buf.name = name;
  return buf;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/upload", () => {
  it("rejects requests without authentication", async () => {
    // Override getAuth for this one call to simulate no session
    const clerkMod = await import("@clerk/express");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(clerkMod.getAuth).mockReturnValueOnce({ userId: null } as any);

    const res = await request(app)
      .post("/api/upload")
      .attach("files", makeFakePdf(), "test-paper.pdf");

    expect(res.status).toBe(401);
  });

  it("returns a safe 503 when account provisioning cannot reach the database", async () => {
    const { db } = await import("@workspace/db");
    const uploadedBefore = fs.readdirSync(uploadsDir).sort();
    vi.mocked(db.select).mockImplementationOnce(() => {
      throw new Error("getaddrinfo ENOTFOUND db.example.supabase.co");
    });

    const res = await request(app)
      .post("/api/upload")
      .attach("files", makeFakePdf(), "database-down.pdf");

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/temporarily unavailable/i);
    expect(fs.readdirSync(uploadsDir).sort()).toEqual(uploadedBefore);
  });

  it("returns 400 when no files are sent", async () => {
    const res = await request(app).post("/api/upload");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no files/i);
  });

  it("returns filePaths for a valid PDF upload", async () => {
    const res = await request(app)
      .post("/api/upload")
      .attach("files", makeFakePdf(), "physics-2023.pdf");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.filePaths)).toBe(true);
    expect(res.body.filePaths).toHaveLength(1);
    expect(res.body.filePaths[0]).toMatch(/\.pdf$/);
  });

  it("accepts up to 5 files", async () => {
    const req = request(app).post("/api/upload");
    for (let i = 1; i <= 5; i++) {
      req.attach("files", makeFakePdf(), `paper-${i}.pdf`);
    }
    const res = await req;

    expect(res.status).toBe(200);
    expect(res.body.filePaths).toHaveLength(5);
  });

  it("rejects unsupported file types", async () => {
    const txtBuf = Buffer.from("not a pdf") as Buffer & { name: string };
    const res = await request(app)
      .post("/api/upload")
      .attach("files", txtBuf, "notes.txt");

    // multer rejects non-PDF/image files → should not be 200
    expect(res.status).not.toBe(200);
  });
});

// ---------------------------------------------------------------------------

describe("POST /api/analyses", () => {
  it("returns 400 for missing required fields", async () => {
    const res = await request(app)
      .post("/api/analyses")
      .send({ category: "school" }); // missing subject + filePaths

    expect(res.status).toBe(400);
  });

  it("returns 402 when user has no credits", async () => {
    // Temporarily give 0 credits
    const original = dbState.credits;
    dbState.credits = { ...original, creditsRemaining: 0 };

    const res = await request(app)
      .post("/api/analyses")
      .send({
        category: "school",
        subject: "Physics",
        filePaths: [],
      });

    dbState.credits = original;
    expect(res.status).toBe(402);
  });

  it("creates an analysis and responds 201 with status=processing", async () => {
    // Write a real file so the path-existence check passes
    const fakePath = path.join(uploadsDir, "physics-2023.pdf");
    fs.writeFileSync(fakePath, "%PDF-1.4 test");

    const res = await request(app)
      .post("/api/analyses")
      .send({
        category: "school",
        classOrCourse: "12th",
        boardOrUniversity: "CBSE",
        subject: "Physics",
        filePaths: [fakePath],
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("processing");
    expect(typeof res.body.id).toBe("number");
  });

  it("rolls back the credit deduction and cleans up uploads when analysis creation fails", async () => {
    const fakePath = path.join(uploadsDir, "analysis-start-failure.pdf");
    fs.writeFileSync(fakePath, "%PDF-1.4 test");
    const { db, analysesTable } = await import("@workspace/db");

    vi.mocked(db.execute).mockClear();
    vi.mocked(db.transaction).mockClear();
    const originalInsert = vi.mocked(db.insert).getMockImplementation();
    vi.mocked(db.insert).mockImplementation((table: unknown) => {
      if (table === analysesTable) {
        throw new Error("getaddrinfo ENOTFOUND db.example.supabase.co");
      }
      return originalInsert!(table);
    });

    let res;
    try {
      res = await request(app)
        .post("/api/analyses")
        .send({
          category: "school",
          subject: "Physics",
          filePaths: [fakePath],
        });
    } finally {
      vi.mocked(db.insert).mockImplementation(originalInsert!);
    }

    expect(res!.status).toBe(503);
    expect(res!.body.error).toMatch(/temporarily unavailable/i);
    expect(fs.existsSync(fakePath)).toBe(false);
    expect(vi.mocked(db.transaction)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.execute)).toHaveBeenCalledTimes(1);
  });

  it("removes valid uploads when another submitted file path is invalid", async () => {
    const validPath = path.join(uploadsDir, "cleanup-valid-upload.pdf");
    fs.writeFileSync(validPath, "%PDF-1.4 test");

    const res = await request(app)
      .post("/api/analyses")
      .send({
        category: "school",
        subject: "Physics",
        filePaths: [validPath, "/not-an-upload/missing.pdf"],
      });

    expect(res.status).toBe(400);
    expect(fs.existsSync(validPath)).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("GET /api/analyses/:id", () => {
  beforeEach(() => {
    // Default: return a processing analysis
    dbState.analysis = {
      id: 42,
      userId: 1,
      category: "school",
      classOrCourse: "12th",
      boardOrUniversity: "CBSE",
      subject: "Physics",
      status: "processing",
      yearsAnalyzed: null,
      pdfFilePath: null,
      aiResponseJson: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
    };
  });

  it("returns 404 for unknown analysis id", async () => {
    dbState.analysis = null;
    const res = await request(app).get("/api/analyses/9999");
    expect(res.status).toBe(404);
  });

  it("returns the analysis with status=processing", async () => {
    const res = await request(app).get("/api/analyses/42");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(42);
    expect(res.body.status).toBe("processing");
    expect(res.body.hasPdf).toBe(false);
  });

  it("returns the analysis with status=completed and aiResponse", async () => {
    dbState.analysis = {
      ...dbState.analysis!,
      status: "completed",
      yearsAnalyzed: 1,
      pdfFilePath: "study-guide-42.pdf",
      // Shape must match GetAnalysisResponse Zod schema:
      //   marks_weightage → string, priority → 'High'|'Medium'|'Low' (capitalised)
      //   top-level subject + category fields required
      aiResponseJson: {
        subject: "Physics",
        category: "school",
        chapters: [
          {
            chapter_name: "Mechanics",
            priority: "High",
            marks_weightage: "20",
            frequency: 5,
            study_note: "Very important",
          },
        ],
        overall_strategy_tip: "Start with Mechanics",
        years_analyzed: 1,
      },
    };

    const res = await request(app).get("/api/analyses/42");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
    expect(res.body.hasPdf).toBe(true);
    expect(Array.isArray(res.body.aiResponse?.chapters)).toBe(true);
    expect(res.body.aiResponse.chapters[0].chapter_name).toBe("Mechanics");
  });
});

// ---------------------------------------------------------------------------

describe("POST /api/analyses/:id/retry", () => {
  it("returns 404 when analysis does not exist", async () => {
    dbState.analysis = null;
    const res = await request(app).post("/api/analyses/9999/retry");
    expect(res.status).toBe(404);
  });

  it("returns 409 when analysis is still processing", async () => {
    dbState.analysis = {
      id: 42,
      userId: 1,
      category: "school",
      classOrCourse: "12th",
      boardOrUniversity: "CBSE",
      subject: "Physics",
      status: "processing",
      inputFilePaths: [],
      yearsAnalyzed: null,
      pdfFilePath: null,
      aiResponseJson: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
    };
    const res = await request(app).post("/api/analyses/42/retry");
    expect(res.status).toBe(409);
  });

  it("returns 422 when input files are missing", async () => {
    dbState.analysis = {
      id: 42,
      userId: 1,
      category: "school",
      classOrCourse: "12th",
      boardOrUniversity: "CBSE",
      subject: "Physics",
      status: "failed",
      inputFilePaths: ["/nonexistent/file.pdf"],
      yearsAnalyzed: null,
      pdfFilePath: null,
      aiResponseJson: null,
      errorMessage: "AI error",
      createdAt: new Date().toISOString(),
    };
    const res = await request(app).post("/api/analyses/42/retry");
    expect(res.status).toBe(422);
  });

  it("returns 402 when user has no credits for retry", async () => {
    const fakePath = path.join(uploadsDir, "retry-paper.pdf");
    fs.writeFileSync(fakePath, "%PDF-1.4 test");

    dbState.analysis = {
      id: 42,
      userId: 1,
      category: "school",
      classOrCourse: "12th",
      boardOrUniversity: "CBSE",
      subject: "Physics",
      status: "failed",
      inputFilePaths: [fakePath],
      yearsAnalyzed: null,
      pdfFilePath: null,
      aiResponseJson: null,
      errorMessage: "AI error",
      createdAt: new Date().toISOString(),
    };

    const original = dbState.credits;
    dbState.credits = { ...original, creditsRemaining: 0 };
    const res = await request(app).post("/api/analyses/42/retry");
    dbState.credits = original;
    expect(res.status).toBe(402);
  });

  it("resets status to processing and returns 200 when retry is valid", async () => {
    const fakePath = path.join(uploadsDir, "retry-paper-2.pdf");
    fs.writeFileSync(fakePath, "%PDF-1.4 test");

    const failedAnalysis = {
      id: 42,
      userId: 1,
      category: "school",
      classOrCourse: "12th",
      boardOrUniversity: "CBSE",
      subject: "Physics",
      status: "failed",
      inputFilePaths: [fakePath],
      yearsAnalyzed: null,
      pdfFilePath: null,
      aiResponseJson: null,
      errorMessage: "AI error",
      createdAt: new Date().toISOString(),
    };
    dbState.analysis = failedAnalysis;

    const { db } = await import("@workspace/db");

    // New retry flow calls db.update in this order:
    //   1st: conditional status transition (analysesTable, WHERE status='failed') — returns the claimed row
    //   2nd: atomic credit decrement (creditsTable, SQL expression) — returns updated credits row
    const makeUpdateChain = (rows: unknown[]) => {
      const chain: Record<string, unknown> = {};
      chain.set = vi.fn().mockReturnThis();
      chain.where = vi.fn().mockReturnThis();
      chain.returning = vi.fn().mockResolvedValue(rows);
      chain.then = vi.fn().mockImplementation((fn: (v: unknown[]) => unknown) =>
        Promise.resolve(rows).then(fn)
      );
      return chain as unknown as ReturnType<typeof db.update>;
    };

    vi.mocked(db.update)
      .mockImplementationOnce(() =>                        // 1st: claim the retry slot
        makeUpdateChain([{ ...failedAnalysis, status: "processing", errorMessage: null }])
      );
    // Credit deduction now goes through db.execute (not db.update).
    // Default execute mock returns { rows: [{ total: 2, id: 1 }] } → deduction succeeds.

    const res = await request(app).post("/api/analyses/42/retry");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("processing");
    expect(res.body.errorMessage).toBeNull();
  });

  it("returns 409 when concurrent retry already claimed the slot", async () => {
    const fakePath = path.join(uploadsDir, "retry-concurrent.pdf");
    fs.writeFileSync(fakePath, "%PDF-1.4 test");

    dbState.analysis = {
      id: 42,
      userId: 1,
      category: "school",
      classOrCourse: "12th",
      boardOrUniversity: "CBSE",
      subject: "Physics",
      status: "failed",
      inputFilePaths: [fakePath],
      yearsAnalyzed: null,
      pdfFilePath: null,
      aiResponseJson: null,
      errorMessage: "AI error",
      createdAt: new Date().toISOString(),
    };

    const { db } = await import("@workspace/db");

    const makeUpdateChain = (rows: unknown[]) => {
      const chain: Record<string, unknown> = {};
      chain.set = vi.fn().mockReturnThis();
      chain.where = vi.fn().mockReturnThis();
      chain.returning = vi.fn().mockResolvedValue(rows);
      chain.then = vi.fn().mockImplementation((fn: (v: unknown[]) => unknown) =>
        Promise.resolve(rows).then(fn)
      );
      return chain as unknown as ReturnType<typeof db.update>;
    };

    // Status transition returns 0 rows → concurrent retry already won the slot.
    // The endpoint must return 409 immediately WITHOUT touching credits.
    vi.mocked(db.update).mockClear();
    vi.mocked(db.execute).mockClear();
    vi.mocked(db.update)
      .mockImplementationOnce(() => makeUpdateChain([])); // status transition: race lost

    const res = await request(app).post("/api/analyses/42/retry");
    expect(res.status).toBe(409);
    // Only 1 db.update call (status transition only) — credits must NOT be touched.
    expect(vi.mocked(db.update)).toHaveBeenCalledTimes(1);
  });

  it("reverts status to failed and returns 402 when credit runs out between pre-check and deduction", async () => {
    const fakePath = path.join(uploadsDir, "retry-nocredit.pdf");
    fs.writeFileSync(fakePath, "%PDF-1.4 test");

    const failedAnalysis = {
      id: 42,
      userId: 1,
      category: "school",
      classOrCourse: "12th",
      boardOrUniversity: "CBSE",
      subject: "Physics",
      status: "failed",
      inputFilePaths: [fakePath],
      yearsAnalyzed: null,
      pdfFilePath: null,
      aiResponseJson: null,
      errorMessage: "AI error",
      createdAt: new Date().toISOString(),
    };
    dbState.analysis = failedAnalysis;

    const { db } = await import("@workspace/db");

    const makeUpdateChain = (rows: unknown[]) => {
      const chain: Record<string, unknown> = {};
      chain.set = vi.fn().mockReturnThis();
      chain.where = vi.fn().mockReturnThis();
      chain.returning = vi.fn().mockResolvedValue(rows);
      chain.then = vi.fn().mockImplementation((fn: (v: unknown[]) => unknown) =>
        Promise.resolve(rows).then(fn)
      );
      return chain as unknown as ReturnType<typeof db.update>;
    };

    vi.mocked(db.update).mockClear();
    vi.mocked(db.execute).mockClear();
    vi.mocked(db.update)
      .mockImplementationOnce(() =>                        // 1st: status transition succeeds
        makeUpdateChain([{ ...failedAnalysis, status: "processing", errorMessage: null }])
      )
      .mockImplementationOnce(() => makeUpdateChain([]));  // 2nd: revert status to failed

    // Make execute return success for getAvailableCredits (pre-check passes)
    // then return empty rows for deductOneCredit (race: credits drained).
    vi.mocked(db.execute)
      .mockResolvedValueOnce({ rows: [{ total: 2, id: 1 }] } as any)  // getAvailableCredits → 2
      .mockResolvedValueOnce({ rows: [] } as any);                      // deductOneCredit → null

    const res = await request(app).post("/api/analyses/42/retry");
    expect(res.status).toBe(402);
    // Status transition + status revert — credit deduction is now via db.execute, not db.update
    expect(vi.mocked(db.update)).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------

describe("GET /api/analyses/:id - error message sanitization", () => {
  it("returns a generic error message for failed analyses (never raw internal errors)", async () => {
    dbState.analysis = {
      id: 42,
      userId: 1,
      category: "school",
      classOrCourse: "12th",
      boardOrUniversity: "CBSE",
      subject: "Physics",
      status: "failed",
      yearsAnalyzed: null,
      pdfFilePath: null,
      aiResponseJson: null,
      errorMessage: "OpenAI rate limit exceeded: 429 Too Many Requests",
      createdAt: new Date().toISOString(),
    };

    const res = await request(app).get("/api/analyses/42");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("failed");
    // Must NOT contain internal error details
    expect(res.body.errorMessage).not.toMatch(/openai/i);
    expect(res.body.errorMessage).not.toMatch(/rate limit/i);
    expect(res.body.errorMessage).not.toMatch(/429/);
    // Must contain a user-friendly message
    expect(typeof res.body.errorMessage).toBe("string");
    expect(res.body.errorMessage.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------

describe("GET /api/analyses/:id/download", () => {
  it("returns 404 when analysis has no PDF", async () => {
    dbState.analysis = {
      id: 42,
      userId: 1,
      status: "processing",
      pdfFilePath: null,
      category: "school",
      subject: "Physics",
      createdAt: new Date().toISOString(),
    };

    const res = await request(app).get("/api/analyses/42/download");
    expect(res.status).toBe(404);
  });

  it("returns a PDF download URL when analysis is completed", async () => {
    dbState.analysis = {
      id: 42,
      userId: 1,
      status: "completed",
      pdfFilePath: "study-guide-42.pdf",
      category: "school",
      subject: "Physics",
      createdAt: new Date().toISOString(),
    };

    const res = await request(app).get("/api/analyses/42/download");
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/\/api\/pdf\//);
    expect(res.body.url).toMatch(/\.pdf$/);
  });
});

// ---------------------------------------------------------------------------

describe("GET /api/pdf/:filename", () => {
  it("streams the PDF file when it exists", async () => {
    const pdfName = "study-guide-42.pdf";
    const pdfPath = path.join(uploadsDir, pdfName);
    fs.writeFileSync(pdfPath, "%PDF-1.4 test pdf content");

    const res = await request(app).get(`/api/pdf/${pdfName}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
  });

  it("returns 404 for a missing PDF file", async () => {
    const res = await request(app).get("/api/pdf/nonexistent-99.pdf");
    expect(res.status).toBe(404);
  });

  it("returns 400 for an invalid filename (path traversal attempt)", async () => {
    const res = await request(app).get(
      "/api/pdf/..%2F..%2Fetc%2Fpasswd.pdf",
    );
    expect([400, 404]).toContain(res.status);
  });
});
