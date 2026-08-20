import { Router, IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  analysesTable,
  tokenUsageLogsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import {
  getAvailableCredits,
  deductOneCredit,
  deductOneCreditWith,
  refundOneCredit,
} from "../lib/credits";
import { analyzeWithAI } from "../lib/openai";
import { extractTextFromFilesWithLabels } from "../lib/extractText";
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
import {
  DATABASE_UNAVAILABLE_MESSAGE,
  isDatabaseUnavailable,
} from "../lib/serviceAvailability";
import {
  AnalysisProcessingError,
  AnalysisFailureStage,
  getAnalysisFailureMessage,
  getAnalysisFailureMessageWithRefund,
  isSafeAnalysisFailureMessage,
} from "../lib/analysisFailure";
import { inspectStorageDirectory, inspectStoredFile } from "../lib/fileStorage";

const router: IRouter = Router();

function isInsideUploadsDir(filePath: string): boolean {
  const uploadsDir = path.resolve(getUploadsDir());
  const resolvedPath = path.resolve(filePath);
  const relativePath = path.relative(uploadsDir, resolvedPath);

  return (
    relativePath !== "" &&
    !relativePath.startsWith("..") &&
    !path.isAbsolute(relativePath)
  );
}

function cleanupUnclaimedUploads(filePaths: string[]): void {
  for (const filePath of filePaths) {
    if (!isInsideUploadsDir(filePath)) continue;

    try {
      fs.rmSync(path.resolve(filePath), { force: true });
    } catch (err) {
      logger.warn(
        { err, filePath: path.basename(filePath) },
        "Could not remove an unclaimed upload",
      );
    }
  }
}

function getCandidateUploadPaths(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const paths = (body as { filePaths?: unknown }).filePaths;
  return Array.isArray(paths)
    ? paths.filter((filePath): filePath is string => typeof filePath === "string")
    : [];
}

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
  const candidateFilePaths = getCandidateUploadPaths(req.body);
  const parsed = CreateAnalysisBody.safeParse(req.body);
  if (!parsed.success) {
    cleanupUnclaimedUploads(candidateFilePaths);
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { category, classOrCourse, boardOrUniversity, subject, filePaths } =
    parsed.data;

  // Validate file paths (security: ensure they're within uploads dir)
  for (const fp of filePaths) {
    const resolved = path.resolve(fp);
    if (!isInsideUploadsDir(resolved)) {
      cleanupUnclaimedUploads(filePaths);
      res.status(400).json({ error: "Invalid file path" });
      return;
    }
    if (!fs.existsSync(resolved)) {
      cleanupUnclaimedUploads(filePaths);
      res.status(400).json({ error: `File not found: ${path.basename(fp)}` });
      return;
    }
  }

  try {
    const analysis = await db.transaction(async (tx) => {
      // Deduction and analysis creation must commit or roll back together.
      const deducted = await deductOneCreditWith(tx, req.userId!);
      if (!deducted) return null;

      const [createdAnalysis] = await tx
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

      return createdAnalysis;
    });

    if (!analysis) {
      cleanupUnclaimedUploads(filePaths);
      res.status(402).json({ error: "Insufficient credits. Please purchase a pack." });
      return;
    }

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
    }).catch((err) => {
      logger.error({ err, analysisId: analysis.id }, "Background analysis processing failed");
    });
  } catch (err) {
    logger.error({ err }, "Could not start analysis");
    cleanupUnclaimedUploads(filePaths);

    if (isDatabaseUnavailable(err)) {
      res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
      return;
    }

    res.status(500).json({ error: "Unable to start the analysis. Please try again." });
  }
});

export async function processAnalysis(
  analysisId: number,
  params: {
    category: string;
    classOrCourse: string;
    boardOrUniversity: string;
    subject: string;
    filePaths: string[];
    userId: number;
  }
) {
  let creditRefunded = false;
  let stage: AnalysisFailureStage = "file_unavailable";

  try {
    const storageDirectory = inspectStorageDirectory(getUploadsDir());
    const inputFiles = params.filePaths.map(inspectStoredFile);
    logger.info(
      {
        analysisId,
        storageDirectory,
        inputFiles,
      },
      "Checking analysis input files before text extraction",
    );

    const missingFile = inputFiles.find((file) => file.exists === false);
    if (missingFile) {
      throw new AnalysisProcessingError(
        "file_missing",
        `Input file is missing at ${missingFile.absolutePath}`,
      );
    }

    const unavailableFile = inputFiles.find(
      (file) =>
        file.exists !== true ||
        !isInsideUploadsDir(file.absolutePath) ||
        !file.isFile ||
        !file.readable,
    );
    if (unavailableFile) {
      throw new AnalysisProcessingError(
        "file_unavailable",
        `Input file is unavailable at ${unavailableFile.absolutePath}`,
      );
    }

    stage = "text_extraction";
    const { text: extractedText, yearLabels, extractedCharacterCount } =
      await extractTextFromFilesWithLabels(params.filePaths);

    if (!extractedText || extractedCharacterCount < 50) {
      throw new AnalysisProcessingError(
        "text_extraction",
        `Only ${extractedCharacterCount} readable characters were extracted from ${params.filePaths.length} input file(s)`,
      );
    }

    // Call AI
    stage = "ai_analysis";
    const { result, inputTokens, outputTokens } = await analyzeWithAI({
      category: params.category,
      classOrCourse: params.classOrCourse,
      boardOrUniversity: params.boardOrUniversity,
      subject: params.subject,
      yearLabels,
      extractedText,
    });

    // Log token usage
    stage = "persistence";
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
    stage = "pdf_generation";
    const pdfFileName = await generateStudyGuidePdf({
      analysisId,
      subject: params.subject,
      classOrCourse: params.classOrCourse,
      boardOrUniversity: params.boardOrUniversity,
      aiResult: result,
    });

    // Mark as completed
    stage = "persistence";
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
    const failureStage =
      err instanceof AnalysisProcessingError ? err.stage : stage;
    logger.error(
      { err, analysisId, stage: failureStage },
      "Analysis failed",
    );

    const pendingRefundMessage = getAnalysisFailureMessageWithRefund(
      failureStage,
      "pending",
    );
    let failureStatePersisted = false;

    // Persist a terminal state before attempting the refund, so a temporary
    // refund problem cannot leave students looking at a perpetual spinner.
    try {
      await db
        .update(analysesTable)
        .set({ status: "failed", errorMessage: pendingRefundMessage })
        .where(eq(analysesTable.id, analysisId));
      failureStatePersisted = true;
    } catch (persistenceErr) {
      logger.error(
        { err: persistenceErr, analysisId, stage: failureStage },
        "Could not record terminal analysis failure",
      );
    }

    // Atomically refund the credit to the oldest non-full non-expired batch.
    // Do not tell the student a refund succeeded until this operation commits.
    if (!creditRefunded) {
      try {
        await refundOneCredit(params.userId);
        creditRefunded = true;
      } catch (refundErr) {
        logger.error(
          { err: refundErr, analysisId, stage: failureStage },
          "Could not refund failed analysis credit",
        );
      }
    }

    if (failureStatePersisted && creditRefunded) {
      try {
        await db
          .update(analysesTable)
          .set({
            errorMessage: getAnalysisFailureMessageWithRefund(
              failureStage,
              "confirmed",
            ),
          })
          .where(eq(analysesTable.id, analysisId));
      } catch (confirmationErr) {
        logger.warn(
          { err: confirmationErr, analysisId, stage: failureStage },
          "Refund succeeded but its confirmation could not be saved",
        );
      }
    } else if (failureStatePersisted) {
      try {
        await db
          .update(analysesTable)
          .set({
            errorMessage: getAnalysisFailureMessageWithRefund(
              failureStage,
              "unconfirmed",
            ),
          })
          .where(eq(analysesTable.id, analysisId));
      } catch (refundFailureUpdateErr) {
        logger.error(
          { err: refundFailureUpdateErr, analysisId, stage: failureStage },
          "Could not record unconfirmed credit refund",
        );
      }
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
      errorMessage:
        analysis.status === "failed" && isSafeAnalysisFailureMessage(analysis.errorMessage)
          ? analysis.errorMessage
          : analysis.status === "failed"
            ? getAnalysisFailureMessage("unknown")
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

  // Lightweight pre-check: surface a clear 402 before touching any data
  const available = await getAvailableCredits(req.userId!);
  if (available <= 0) {
    res.status(402).json({ error: "Insufficient credits. Please purchase a pack." });
    return;
  }

  // ─── Step 1: atomically claim the retry slot ──────────────────────────────
  // WHERE status = 'failed' ensures only one concurrent request can win.
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

  // ─── Step 2: atomically deduct 1 credit from oldest non-expired batch ─────
  const deducted = await deductOneCredit(req.userId!);

  if (!deducted) {
    // Edge case: credits expired/drained between the pre-check and this write.
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
    res.setHeader("Content-Disposition", `attachment; filename="study-guide.pdf"`);
    fs.createReadStream(filePath).pipe(res);
  }
);

export default router;
