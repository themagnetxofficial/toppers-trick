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
  deductCreditsWith,
  refundCredits,
} from "../lib/credits";
import { analyzeWithAI } from "../lib/openai";
import {
  extractTextFromFilesWithLabels,
  getCreditsForPageCount,
  getTotalPageCount,
} from "../lib/extractText";
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
  getTemporaryOcrDiagnosticMessage,
  isSafeAnalysisFailureMessage,
  isTemporaryOcrDiagnosticMessage,
} from "../lib/analysisFailure";
import { inspectStorageDirectory, inspectStoredFile } from "../lib/fileStorage";

const router: IRouter = Router();

class InsufficientAnalysisCreditsError extends Error {
  constructor(readonly requiredCredits: number) {
    super("Insufficient credits for this analysis");
    this.name = "InsufficientAnalysisCreditsError";
  }
}

function isPaperInputTooLargeError(error: unknown): boolean {
  return error instanceof Error && error.name === "PaperInputTooLargeError";
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStringOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function recoverTopicBasedAiResponse(
  value: unknown,
  fallbackSubject: string,
): { value: unknown; repaired: boolean } {
  if (!isRecord(value) || !Array.isArray(value.topics)) {
    return { value, repaired: false };
  }

  let repaired = false;
  const topics = value.topics.flatMap((topic) => {
    if (!isRecord(topic) || typeof topic.topic_name !== "string" || !topic.topic_name.trim()) {
      repaired = true;
      return [];
    }

    const rawBreakdown = isRecord(topic.question_type_breakdown)
      ? topic.question_type_breakdown
      : {};
    const questionTypeBreakdown = {
      mcq: getStringOrFallback(rawBreakdown.mcq, "Not specified"),
      short: getStringOrFallback(rawBreakdown.short, "Not specified"),
      long: getStringOrFallback(rawBreakdown.long, "Not specified"),
      case_study: getStringOrFallback(rawBreakdown.case_study, "Not specified"),
    };

    const rawStudyNote = isRecord(topic.study_note) ? topic.study_note : {};
    const studyNote = {
      kya_padhna_hai: getStringOrFallback(
        rawStudyNote.kya_padhna_hai,
        typeof topic.study_note === "string" ? topic.study_note : "Not specified",
      ),
      kaise_poochha_jaata_hai: getStringOrFallback(
        rawStudyNote.kaise_poochha_jaata_hai,
        "Not specified",
      ),
      repeat_pattern: getStringOrFallback(rawStudyNote.repeat_pattern, "Not specified"),
    };

    const priority =
      topic.priority === "High" || topic.priority === "Medium" || topic.priority === "Low"
        ? topic.priority
        : "Medium";
    const confidenceLevel =
      topic.confidence_level === "High" ||
      topic.confidence_level === "Medium" ||
      topic.confidence_level === "Low"
        ? topic.confidence_level
        : "Low";
    const yearsAppeared = Array.isArray(topic.years_appeared)
      ? topic.years_appeared.filter((year): year is string => typeof year === "string")
      : [];
    const paperQuestionEvidence = Array.isArray(topic.paper_question_evidence)
      ? topic.paper_question_evidence.filter(
          (item): item is { paper: string; evidence: string } =>
            isRecord(item) &&
            typeof item.paper === "string" &&
            typeof item.evidence === "string",
        )
      : undefined;
    const keyTerms = Array.isArray(topic.key_terms)
      ? topic.key_terms.filter((term): term is string => typeof term === "string")
      : [];

    if (
      !isRecord(topic.question_type_breakdown) ||
      !isRecord(topic.study_note) ||
      !Array.isArray(topic.key_terms) ||
      typeof topic.priority !== "string" ||
      typeof topic.frequency !== "number" ||
      typeof topic.confidence_level !== "string" ||
      typeof topic.marks_weightage !== "string"
    ) {
      repaired = true;
    }

    return [
      {
        ...topic,
        priority,
        frequency:
          typeof topic.frequency === "number" && Number.isFinite(topic.frequency)
            ? topic.frequency
            : 0,
        years_appeared: yearsAppeared,
        confidence_level: confidenceLevel,
        marks_weightage: getStringOrFallback(topic.marks_weightage, "Not specified"),
        question_type_breakdown: questionTypeBreakdown,
        study_note: studyNote,
        ...(paperQuestionEvidence ? { paper_question_evidence: paperQuestionEvidence } : {}),
        key_terms: keyTerms,
      },
    ];
  });

  const rawYears = Array.isArray(value.years_analyzed)
    ? value.years_analyzed.filter((year): year is string => typeof year === "string")
    : [];
  const relatedTopicPairs = Array.isArray(value.related_topic_pairs)
    ? value.related_topic_pairs.filter(
        (pair): pair is string => typeof pair === "string",
      )
    : [];
  const overallStrategyTip = getStringOrFallback(
    value.overall_strategy_tip,
    "The analysis was recovered with limited AI detail. Please use the grounded topics below as a revision guide.",
  );

  if (
    value.subject !== fallbackSubject ||
    !Array.isArray(value.years_analyzed) ||
    !Array.isArray(value.related_topic_pairs) ||
    typeof value.overall_strategy_tip !== "string"
  ) {
    repaired = true;
  }

  return {
    value: {
      ...value,
      subject: getStringOrFallback(value.subject, fallbackSubject),
      years_analyzed: rawYears,
      topics,
      related_topic_pairs: relatedTopicPairs,
      overall_strategy_tip: overallStrategyTip,
    },
    repaired,
  };
}

type ProcessingStage = "text_extraction" | "ai_analysis" | "pdf_generation";

async function updateProcessingProgress(
  analysisId: number,
  processingStage: ProcessingStage | null,
  processingCurrent: number | null = null,
  processingTotal: number | null = null,
): Promise<void> {
  try {
    await db
      .update(analysesTable)
      .set({
        processingStage,
        processingCurrent,
        processingTotal,
      })
      .where(eq(analysesTable.id, analysisId));
  } catch (err) {
    // Progress is best-effort; the analysis itself still owns the terminal state.
    logger.warn({ err, analysisId, processingStage }, "Could not save analysis progress");
  }
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
          processingStage: a.processingStage,
          processingCurrent: a.processingCurrent,
          processingTotal: a.processingTotal,
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

  const totalPages = await getTotalPageCount(filePaths);
  const requiredCredits = getCreditsForPageCount(totalPages);
  logger.info(
    { filePaths: filePaths.map((fp) => path.basename(fp)), totalPages, requiredCredits },
    "Computed page-count-based credit tier for new analysis",
  );

  try {
    const analysis = await db.transaction(async (tx) => {
      // Deduction and analysis creation must commit or roll back together.
      const deducted = await deductCreditsWith(tx, req.userId!, requiredCredits);
      if (!deducted) {
        // Throw so a partial multi-credit deduction is rolled back by the
        // surrounding transaction rather than committing before the 402.
        throw new InsufficientAnalysisCreditsError(requiredCredits);
      }

      const [createdAnalysis] = await tx
        .insert(analysesTable)
        .values({
          userId: req.userId!,
          category,
          classOrCourse: classOrCourse ?? null,
          boardOrUniversity: boardOrUniversity ?? null,
          subject,
          creditsCharged: requiredCredits,
          status: "processing",
          processingStage: "text_extraction",
          processingCurrent: 0,
          processingTotal: null,
          inputFilePaths: filePaths,
        })
        .returning();

      return createdAnalysis;
    });

    if (!analysis) {
      cleanupUnclaimedUploads(filePaths);
      res.status(402).json({
        error: `Insufficient credits. This analysis requires ${requiredCredits} credit(s). Please purchase a pack.`,
      });
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
        processingStage: analysis.processingStage,
        processingCurrent: analysis.processingCurrent,
        processingTotal: analysis.processingTotal,
        degraded: analysis.degraded ?? false,
        qualityIssues: analysis.qualityIssues ?? [],
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

    if (err instanceof InsufficientAnalysisCreditsError) {
      res.status(402).json({
        error: `Insufficient credits. This analysis requires ${err.requiredCredits} credit(s). Please purchase a pack.`,
      });
      return;
    }

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
  const processingStartedAt = performance.now();
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
    const extractionStartedAt = performance.now();
    const { text: extractedText, yearLabels, papers, extractedCharacterCount } =
      await extractTextFromFilesWithLabels(params.filePaths, {
        onProgress: (progress) => {
          // The initial row already records text extraction at 0 pages. Avoid
          // an unnecessary write before the first file has been inspected.
          if (
            progress.fileIndex === 0 &&
            progress.current === 0 &&
            progress.total === 0
          ) {
            return;
          }
          return updateProcessingProgress(
            analysisId,
            "text_extraction",
            progress.current,
            progress.total,
          );
        },
      });
    const extractionDurationMs = Math.round(performance.now() - extractionStartedAt);

    if (!extractedText || extractedCharacterCount < 50) {
      throw new AnalysisProcessingError(
        "text_extraction",
        `Only ${extractedCharacterCount} readable characters were extracted from ${params.filePaths.length} input file(s)`,
      );
    }

    const papersWithoutText = papers.filter((paper) => paper.text.length < 50);
    if (papersWithoutText.length > 0) {
      throw new AnalysisProcessingError(
        "text_extraction",
        `No readable text was extracted from ${papersWithoutText.map((paper) => paper.label).join(", ")}`,
      );
    }

    logger.info(
      {
        analysisId,
        papers: papers.map((paper) => ({
          label: paper.label,
          extractedCharacters: paper.text.length,
        })),
        durationMs: extractionDurationMs,
      },
      "Prepared every uploaded paper for AI comparison",
    );

    // Call AI
    stage = "ai_analysis";
    await updateProcessingProgress(analysisId, "ai_analysis");
    const aiStartedAt = performance.now();
    const { result, inputTokens, outputTokens, usage, degraded, qualityIssues } =
      await analyzeWithAI({
        analysisId,
        category: params.category,
        classOrCourse: params.classOrCourse,
        boardOrUniversity: params.boardOrUniversity,
        subject: params.subject,
        yearLabels,
        papers,
        extractedText,
        analysisModel: yearLabels.length >= 4 ? "gpt-5-mini" : undefined,
      });
    const aiDurationMs = Math.round(performance.now() - aiStartedAt);
    logger.info(
      {
        analysisId,
        durationMs: aiDurationMs,
        providerCallCount: usage?.length ?? 0,
        model: yearLabels.length >= 4 ? "gpt-5-mini" : "gpt-4o-mini",
      },
      "AI synthesis stage completed",
    );

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
    await updateProcessingProgress(analysisId, "pdf_generation");
    const pdfStartedAt = performance.now();
    const pdfFileName = await generateStudyGuidePdf({
      analysisId,
      subject: params.subject,
      classOrCourse: params.classOrCourse,
      boardOrUniversity: params.boardOrUniversity,
      aiResult: result,
    });
    const pdfDurationMs = Math.round(performance.now() - pdfStartedAt);

    // Mark as completed
    stage = "persistence";
    await db
      .update(analysesTable)
      .set({
        status: "completed",
        processingStage: null,
        processingCurrent: null,
        processingTotal: null,
        aiResponseJson: result as any,
        degraded,
        qualityIssues,
        pdfFilePath: pdfFileName,
        yearsAnalyzed: params.filePaths.length,
      })
      .where(eq(analysesTable.id, analysisId));

    logger.info(
      {
        analysisId,
        paperCount: params.filePaths.length,
        extractionDurationMs,
        aiDurationMs,
        pdfDurationMs,
        totalDurationMs: Math.round(performance.now() - processingStartedAt),
      },
      "Analysis completed successfully",
    );

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
      isPaperInputTooLargeError(err)
        ? "input_too_large"
        : err instanceof AnalysisProcessingError
          ? err.stage
          : stage;
    logger.error(
      { err, analysisId, stage: failureStage },
      "Analysis failed",
    );

    const shouldStoreTemporaryOcrDiagnostic =
      failureStage === "text_extraction" && !(err instanceof AnalysisProcessingError);
    const getPersistedFailureMessage = (refundState: "pending" | "confirmed" | "unconfirmed") =>
      shouldStoreTemporaryOcrDiagnostic
        ? getTemporaryOcrDiagnosticMessage(err, refundState)
        : getAnalysisFailureMessageWithRefund(failureStage, refundState);
    const pendingRefundMessage = getPersistedFailureMessage("pending");
    let failureStatePersisted = false;

    // Persist a terminal state before attempting the refund, so a temporary
    // refund problem cannot leave students looking at a perpetual spinner.
    try {
      await db
        .update(analysesTable)
        .set({
          status: "failed",
          errorMessage: pendingRefundMessage,
        })
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
        let creditsChargedForThisAnalysis = 1;
        try {
          const chargedRows = await db
            .select({ creditsCharged: analysesTable.creditsCharged })
            .from(analysesTable)
            .where(eq(analysesTable.id, analysisId))
            .limit(1);
          const storedCharge = chargedRows[0]?.creditsCharged;
          if (
            typeof storedCharge === "number" &&
            Number.isInteger(storedCharge) &&
            storedCharge > 0
          ) {
            creditsChargedForThisAnalysis = storedCharge;
          }
        } catch (chargeLookupErr) {
          logger.warn(
            { err: chargeLookupErr, analysisId },
            "Could not read analysis credit charge; defaulting refund to one credit",
          );
        }
        await refundCredits(params.userId, creditsChargedForThisAnalysis);
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
            errorMessage: getPersistedFailureMessage("confirmed"),
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
            errorMessage: getPersistedFailureMessage("unconfirmed"),
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

  const responsePayload = {
    id: analysis.id,
    category: analysis.category,
    classOrCourse: analysis.classOrCourse,
    boardOrUniversity: analysis.boardOrUniversity,
    subject: analysis.subject,
    yearsAnalyzed: analysis.yearsAnalyzed,
    status: analysis.status,
    processingStage: analysis.processingStage,
    processingCurrent: analysis.processingCurrent,
    processingTotal: analysis.processingTotal,
    degraded: analysis.degraded ?? false,
    qualityIssues: analysis.qualityIssues ?? [],
    errorMessage:
      analysis.status === "failed" &&
      (isSafeAnalysisFailureMessage(analysis.errorMessage) ||
        isTemporaryOcrDiagnosticMessage(analysis.errorMessage))
        ? analysis.errorMessage
        : analysis.status === "failed"
          ? getAnalysisFailureMessage("unknown")
          : null,
    aiResponse: analysis.aiResponseJson ?? undefined,
    hasPdf: !!analysis.pdfFilePath,
    createdAt: analysis.createdAt,
  };
  const parsedResponse = GetAnalysisResponse.safeParse(responsePayload);
  if (parsedResponse.success) {
    res.json(parsedResponse.data);
    return;
  }

  if (analysis.status === "completed" && analysis.aiResponseJson) {
    const recovered = recoverTopicBasedAiResponse(
      analysis.aiResponseJson,
      analysis.subject,
    );
    if (recovered.repaired) {
      const recoveredResponse = GetAnalysisResponse.safeParse({
        ...responsePayload,
        degraded: true,
        qualityIssues: [
          ...(analysis.qualityIssues ?? []),
          "Some topic details were incomplete in the original AI response and were safely recovered.",
        ],
        aiResponse: recovered.value,
      });
      if (recoveredResponse.success) {
        logger.warn(
          { analysisId: analysis.id },
          "Served a compatibility-repaired analysis response",
        );
        res.json(recoveredResponse.data);
        return;
      }
    }
  }

  logger.error(
    { analysisId: analysis.id, validationIssues: parsedResponse.error.issues.length },
    "Stored analysis response does not match the public API schema",
  );
  res.status(500).json({ error: "This analysis result is incomplete. Please start a new analysis." });
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

  const requiredCredits =
    typeof analysis.creditsCharged === "number" &&
    Number.isInteger(analysis.creditsCharged) &&
    analysis.creditsCharged > 0
      ? analysis.creditsCharged
      : 1;

  // Lightweight pre-check: surface a clear 402 before touching any data
  const available = await getAvailableCredits(req.userId!);
  if (available < requiredCredits) {
    res.status(402).json({
      error: `Insufficient credits. This analysis requires ${requiredCredits} credit(s). Please purchase a pack.`,
    });
    return;
  }

  // Claiming the retry slot and charging its full recorded amount must commit
  // or roll back together. This prevents a partial charge or a stuck claim.
  let updatedAnalysis;
  try {
    updatedAnalysis = await db.transaction(async (tx) => {
      const claimed = await tx
        .update(analysesTable)
        .set({
          status: "processing",
          processingStage: "text_extraction",
          processingCurrent: 0,
          processingTotal: null,
          errorMessage: null,
        })
        .where(
          and(
            eq(analysesTable.id, id),
            eq(analysesTable.userId, req.userId!),
            eq(analysesTable.status, "failed"),
          ),
        )
        .returning();

      if (!claimed.length) return null;

      const deducted = await deductCreditsWith(tx, req.userId!, requiredCredits);
      if (!deducted) {
        throw new InsufficientAnalysisCreditsError(requiredCredits);
      }

      return claimed[0];
    });
  } catch (err) {
    if (err instanceof InsufficientAnalysisCreditsError) {
      res.status(402).json({
        error: `Insufficient credits. This analysis requires ${requiredCredits} credit(s). Please purchase a pack.`,
      });
      return;
    }
    throw err;
  }

  if (!updatedAnalysis) {
    res.status(409).json({ error: "Analysis is already being retried." });
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
      processingStage: updatedAnalysis.processingStage,
      processingCurrent: updatedAnalysis.processingCurrent,
      processingTotal: updatedAnalysis.processingTotal,
      degraded: false,
      qualityIssues: [],
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
