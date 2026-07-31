import { Router, IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  analysesTable,
  creditsTable,
  tokenUsageLogsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { analyzeWithAI } from "../lib/openai";
import { extractTextFromFiles } from "../lib/extractText";
import { generateStudyGuidePdf, getPdfOutputDir, getUploadsDir } from "../lib/pdfService";
import {
  CreateAnalysisBody,
  ListAnalysesResponse,
  GetAnalysisResponse,
  DownloadAnalysisPdfResponse,
  GetAnalysisParams,
  DownloadAnalysisPdfParams,
} from "@workspace/api-zod";
import path from "path";
import fs from "fs";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/analyses", requireAuth, async (req, res): Promise<void> => {
  const analyses = await db
    .select()
    .from(analysesTable)
    .where(eq(analysesTable.userId, req.userId!))
    .orderBy(analysesTable.createdAt);

  res.json(
    ListAnalysesResponse.parse(
      analyses
        .slice()
        .reverse()
        .map((a) => ({
          id: a.id,
          category: a.category,
          classOrCourse: a.classOrCourse,
          boardOrUniversity: a.boardOrUniversity,
          subject: a.subject,
          yearsAnalyzed: a.yearsAnalyzed,
          status: a.status,
          hasPdf: !!a.pdfFilePath,
          createdAt: a.createdAt,
        }))
    )
  );
});

router.post("/analyses", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateAnalysisBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { category, classOrCourse, boardOrUniversity, subject, filePaths } =
    parsed.data;

  // Check credits
  const credits = await db
    .select()
    .from(creditsTable)
    .where(eq(creditsTable.userId, req.userId!))
    .limit(1)
    .then((rows) => rows[0]);

  if (!credits || credits.creditsRemaining <= 0) {
    res.status(402).json({ error: "Insufficient credits. Please purchase a pack." });
    return;
  }

  // Validate file paths (security: ensure they're within uploads dir)
  // Use getUploadsDir() — same source of truth as the upload route — so paths
  // always match regardless of what process.cwd() resolves to at runtime.
  const UPLOADS_BASE = getUploadsDir();
  for (const fp of filePaths) {
    const resolved = path.resolve(fp);
    if (!resolved.startsWith(UPLOADS_BASE)) {
      res.status(400).json({ error: "Invalid file path" });
      return;
    }
    if (!fs.existsSync(resolved)) {
      res.status(400).json({ error: `File not found: ${path.basename(fp)}` });
      return;
    }
  }

  // Deduct 1 credit
  await db
    .update(creditsTable)
    .set({ creditsRemaining: credits.creditsRemaining - 1 })
    .where(eq(creditsTable.userId, req.userId!));

  // Create analysis record
  const [analysis] = await db
    .insert(analysesTable)
    .values({
      userId: req.userId!,
      category,
      classOrCourse: classOrCourse ?? null,
      boardOrUniversity: boardOrUniversity ?? null,
      subject,
      status: "processing",
      inputFilePaths: filePaths,
    })
    .returning();

  // Respond immediately, process async
  res.status(201).json(
    GetAnalysisResponse.parse({
      id: analysis.id,
      category: analysis.category,
      classOrCourse: analysis.classOrCourse,
      boardOrUniversity: analysis.boardOrUniversity,
      subject: analysis.subject,
      yearsAnalyzed: analysis.yearsAnalyzed,
      status: analysis.status,
      hasPdf: false,
      createdAt: analysis.createdAt,
    })
  );

  // Background processing
  processAnalysis(analysis.id, {
    category,
    classOrCourse: classOrCourse ?? "",
    boardOrUniversity: boardOrUniversity ?? "",
    subject,
    filePaths,
    userId: req.userId!,
    credits,
  }).catch((err) => {
    logger.error({ err, analysisId: analysis.id }, "Background analysis processing failed");
  });
});

async function processAnalysis(
  analysisId: number,
  params: {
    category: string;
    classOrCourse: string;
    boardOrUniversity: string;
    subject: string;
    filePaths: string[];
    userId: number;
    credits: { creditsRemaining: number };
  }
) {
  let creditRefunded = false;
  try {
    // Extract text from all files
    const extractedText = await extractTextFromFiles(params.filePaths);

    if (!extractedText || extractedText.length < 50) {
      throw new Error(
        "Could not extract readable text from the uploaded files. Please ensure the files are not password-protected."
      );
    }

    // Call AI
    const { result, inputTokens, outputTokens } = await analyzeWithAI({
      category: params.category,
      classOrCourse: params.classOrCourse,
      boardOrUniversity: params.boardOrUniversity,
      subject: params.subject,
      yearCount: params.filePaths.length,
      extractedText,
    });

    // Log token usage
    await db.insert(tokenUsageLogsTable).values({
      analysisId,
      inputTokens,
      outputTokens,
      estimatedCost: `$${((inputTokens * 0.00000015 + outputTokens * 0.0000006)).toFixed(6)}`,
    });

    // Update analysis with years analyzed
    await db
      .update(analysesTable)
      .set({ yearsAnalyzed: params.filePaths.length })
      .where(eq(analysesTable.id, analysisId));

    // Generate PDF
    const pdfFileName = await generateStudyGuidePdf({
      analysisId,
      subject: params.subject,
      classOrCourse: params.classOrCourse,
      boardOrUniversity: params.boardOrUniversity,
      aiResult: result,
    });

    // Update analysis record as completed
    await db
      .update(analysesTable)
      .set({
        status: "completed",
        aiResponseJson: result as any,
        pdfFilePath: pdfFileName,
        yearsAnalyzed: params.filePaths.length,
      })
      .where(eq(analysesTable.id, analysisId));

    logger.info({ analysisId }, "Analysis completed successfully");

    // Clean up uploaded files
    for (const fp of params.filePaths) {
      try {
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      } catch {
        // ignore cleanup errors
      }
    }
  } catch (err) {
    logger.error({ err, analysisId }, "Analysis failed");

    const errorMessage =
      err instanceof Error ? err.message : "Analysis failed";

    await db
      .update(analysesTable)
      .set({ status: "failed", errorMessage })
      .where(eq(analysesTable.id, analysisId));

    // Atomically refund the credit (increment by 1 to avoid overwriting
    // concurrent credit changes with a stale snapshot value).
    if (!creditRefunded) {
      await db
        .update(creditsTable)
        .set({ creditsRemaining: sql`${creditsTable.creditsRemaining} + 1` })
        .where(eq(creditsTable.userId, params.userId));
    }
  }
}

router.get("/analyses/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetAnalysisParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const analysis = await db
    .select()
    .from(analysesTable)
    .where(and(eq(analysesTable.id, id), eq(analysesTable.userId, req.userId!)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!analysis) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }

  res.json(
    GetAnalysisResponse.parse({
      id: analysis.id,
      category: analysis.category,
      classOrCourse: analysis.classOrCourse,
      boardOrUniversity: analysis.boardOrUniversity,
      subject: analysis.subject,
      yearsAnalyzed: analysis.yearsAnalyzed,
      status: analysis.status,
      // Never leak raw internal error details to the client.
      // If the analysis failed, return a generic user-facing message only.
      errorMessage:
        analysis.status === "failed"
          ? "Analysis could not be completed. Your credit has been refunded."
          : null,
      aiResponse: analysis.aiResponseJson ?? undefined,
      hasPdf: !!analysis.pdfFilePath,
      createdAt: analysis.createdAt,
    })
  );
});

router.post("/analyses/:id/retry", requireAuth, async (req, res): Promise<void> => {
  const params = GetAnalysisParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const analysis = await db
    .select()
    .from(analysesTable)
    .where(and(eq(analysesTable.id, id), eq(analysesTable.userId, req.userId!)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!analysis) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }

  if (analysis.status !== "failed") {
    res.status(409).json({ error: "Only failed analyses can be retried." });
    return;
  }

  // Validate that input files still exist
  const filePaths = (analysis.inputFilePaths ?? []) as string[];
  if (!filePaths.length) {
    res.status(422).json({ error: "Input files are no longer available. Cannot retry." });
    return;
  }
  for (const fp of filePaths) {
    if (!fs.existsSync(path.resolve(fp))) {
      res.status(422).json({ error: "Uploaded files have expired. Please start a new analysis." });
      return;
    }
  }

  // Lightweight pre-check so we surface a clear 402 before touching any data.
  const credits = await db
    .select()
    .from(creditsTable)
    .where(eq(creditsTable.userId, req.userId!))
    .limit(1)
    .then((rows) => rows[0]);

  if (!credits || credits.creditsRemaining <= 0) {
    res.status(402).json({ error: "Insufficient credits. Please purchase a pack." });
    return;
  }

  // ─── Step 1: atomically claim the retry slot ──────────────────────────────
  // The WHERE clause requires status = 'failed', so only one concurrent
  // request can win.  All others receive an empty RETURNING → 409.
  const claimed = await db
    .update(analysesTable)
    .set({ status: "processing", errorMessage: null })
    .where(
      and(
        eq(analysesTable.id, id),
        eq(analysesTable.userId, req.userId!),
        eq(analysesTable.status, "failed")
      )
    )
    .returning();

  if (!claimed.length) {
    res.status(409).json({ error: "Analysis is already being retried." });
    return;
  }

  const [updatedAnalysis] = claimed;

  // ─── Step 2: atomically deduct 1 credit (SQL expression, no snapshot) ────
  // Using a SQL-level decrement avoids the stale-read race: the DB computes
  // the new value itself.  The `creditsRemaining > 0` guard ensures we never
  // go below zero; an empty RETURNING means we were beaten by a concurrent
  // operation that already drained the balance.
  const deducted = await db
    .update(creditsTable)
    .set({ creditsRemaining: sql`${creditsTable.creditsRemaining} - 1` })
    .where(
      and(
        eq(creditsTable.userId, req.userId!),
        sql`${creditsTable.creditsRemaining} > 0`
      )
    )
    .returning();

  if (!deducted.length) {
    // Edge case: credits ran out between the pre-check and this write.
    // Revert the status back to "failed" so the user can retry again later.
    await db
      .update(analysesTable)
      .set({ status: "failed", errorMessage: "Insufficient credits." })
      .where(eq(analysesTable.id, id));
    res.status(402).json({ error: "Insufficient credits. Please purchase a pack." });
    return;
  }

  // Respond immediately, then process in background
  res.status(200).json(
    GetAnalysisResponse.parse({
      id: updatedAnalysis.id,
      category: updatedAnalysis.category,
      classOrCourse: updatedAnalysis.classOrCourse,
      boardOrUniversity: updatedAnalysis.boardOrUniversity,
      subject: updatedAnalysis.subject,
      yearsAnalyzed: updatedAnalysis.yearsAnalyzed,
      status: updatedAnalysis.status,
      errorMessage: null,
      hasPdf: !!updatedAnalysis.pdfFilePath,
      createdAt: updatedAnalysis.createdAt,
    })
  );

  processAnalysis(id, {
    category: analysis.category,
    classOrCourse: analysis.classOrCourse ?? "",
    boardOrUniversity: analysis.boardOrUniversity ?? "",
    subject: analysis.subject,
    filePaths,
    userId: req.userId!,
    credits,
  }).catch((err) => {
    logger.error({ err, analysisId: id }, "Background retry processing failed");
  });
});

router.get(
  "/analyses/:id/download",
  requireAuth,
  async (req, res): Promise<void> => {
    const paramsResult = DownloadAnalysisPdfParams.safeParse(req.params);
    if (!paramsResult.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);

    const analysis = await db
      .select()
      .from(analysesTable)
      .where(
        and(eq(analysesTable.id, id), eq(analysesTable.userId, req.userId!))
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!analysis || !analysis.pdfFilePath) {
      res.status(404).json({ error: "PDF not found" });
      return;
    }

    res.json(
      DownloadAnalysisPdfResponse.parse({
        url: `/api/pdf/${analysis.pdfFilePath}`,
      })
    );
  }
);

// Serve PDF files
router.get(
  "/pdf/:filename",
  requireAuth,
  async (req, res): Promise<void> => {
    const filename = req.params.filename as string;

    // Security: only allow alphanumeric, dash, dot in filename
    if (!/^[\w\-]+\.pdf$/.test(filename)) {
      res.status(400).json({ error: "Invalid filename" });
      return;
    }

    const filePath = path.join(getPdfOutputDir(), filename);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="study-guide.pdf"`
    );
    fs.createReadStream(filePath).pipe(res);
  }
);

export default router;
