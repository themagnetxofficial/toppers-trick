import OpenAI from "openai";
import { logger } from "./logger";

let _openai: OpenAI | null = null;
const VISION_TRANSCRIPTION_MODEL = "gpt-5-nano";
const VISION_TRANSCRIPTION_FALLBACK_MODEL = "gpt-4o-mini";
const VISION_TRANSCRIPTION_RETRY_COUNT = 1;
const MAX_CONCURRENT_VISION_TRANSCRIPTIONS = 3;
let activeVisionTranscriptions = 0;
const waitingVisionTranscriptions: Array<() => void> = [];
const DEFAULT_ANALYSIS_TIMEOUT_MS = 5 * 60 * 1000;

export class AnalysisDeadlineExceededError extends Error {
  constructor(message = "Analysis exceeded its five-minute processing deadline") {
    super(message);
    this.name = "AnalysisDeadlineExceededError";
  }
}

export interface ProviderCallDiagnostic {
  operation: string;
  model: string;
  status: "completed" | "failed";
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
  finishReason?: string | null;
  errorName?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

export type ProviderCallReporter = (
  diagnostic: ProviderCallDiagnostic,
) => void | Promise<void>;

function getErrorDetails(err: unknown): { errorName: string; errorMessage: string } {
  const errorName =
    err instanceof Error && err.name ? err.name.slice(0, 200) : "Error";
  const rawMessage =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
  return {
    errorName,
    errorMessage: rawMessage
      .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[redacted]")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .slice(0, 4000),
  };
}

function createDeadlineSignal(deadlineAt?: number): {
  signal?: AbortSignal;
  cleanup: () => void;
} {
  if (deadlineAt === undefined) return { cleanup: () => undefined };
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) throw new AnalysisDeadlineExceededError();

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new AnalysisDeadlineExceededError()),
    remainingMs,
  );
  timer.unref?.();
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

function normalizeDeadlineError(err: unknown): Error {
  if (err instanceof AnalysisDeadlineExceededError) return err;
  if (
    err instanceof Error &&
    (err.name === "AbortError" || /aborted|deadline|timeout/i.test(err.message))
  ) {
    return new AnalysisDeadlineExceededError();
  }
  return err instanceof Error ? err : new Error(String(err));
}

function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

export interface VisionTranscriptionImage {
  data: Buffer;
  mimeType: "image/jpeg" | "image/png";
  label: string;
}

export type VisionImageCompleteReporter = (
  image: VisionTranscriptionImage,
) => void | Promise<void>;

export interface VisionTranscriptionOptions {
  deadlineAt?: number;
  onCallComplete?: ProviderCallReporter;
  onImageComplete?: VisionImageCompleteReporter;
  /**
   * Scanned PDFs use small batches to reduce request overhead while retaining
   * a strict page-level delimiter contract. Existing callers remain one image
   * per request unless they opt into batching.
   */
  batchSize?: number;
}

async function withVisionTranscriptionSlot<T>(operation: () => Promise<T>): Promise<T> {
  await new Promise<void>((resolve) => {
    const start = () => {
      activeVisionTranscriptions += 1;
      resolve();
    };

    if (activeVisionTranscriptions < MAX_CONCURRENT_VISION_TRANSCRIPTIONS) {
      start();
    } else {
      waitingVisionTranscriptions.push(start);
    }
  });

  try {
    return await operation();
  } finally {
    activeVisionTranscriptions -= 1;
    waitingVisionTranscriptions.shift()?.();
  }
}

async function transcribeImageWithVision(
  image: VisionTranscriptionImage,
  options: VisionTranscriptionOptions,
): Promise<string> {
  return withVisionTranscriptionSlot(async () => {
    let lastError: unknown;
    for (const model of [VISION_TRANSCRIPTION_MODEL, VISION_TRANSCRIPTION_FALLBACK_MODEL]) {
      for (
        let attempt = 0;
        attempt <= VISION_TRANSCRIPTION_RETRY_COUNT;
        attempt += 1
      ) {
        const startedAt = performance.now();
        try {
          const { signal, cleanup } = createDeadlineSignal(options.deadlineAt);
          let response;
          try {
            const request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
                model,
                max_completion_tokens: 8192,
                messages: [
                  {
                    role: "user",
                    content: [
                       {
                         type: "text",
                         text:
                           `Transcribe every piece of visible text from ${image.label}, scanning the page from top to bottom. ` +
                           "This may be a CBSE or Indian exam paper printed bilingually in Hindi and English. " +
                           "Return both languages exactly as visible; do not translate, summarize, shorten, or skip repeated-looking text. " +
                           "A Hindi block and its English translation are usually one logical question, but both blocks must still be transcribed so the question is not lost. " +
                           "Keep question numbers, options, marks, headings, case-study passages, sub-questions, tables, and line breaks where readable. " +
                           "Continue through the bottom of the page, including any continuation text. " +
                           "Return only the transcription, with no summary or commentary. " +
                           "Use [illegible] only for text that genuinely cannot be read.",
                       },
                      {
                        type: "image_url",
                        image_url: {
                          url: `data:${image.mimeType};base64,${image.data.toString("base64")}`,
                          detail: "high",
                        },
                      },
                    ],
                  },
                ],
              };
            response = signal
              ? await getOpenAI().chat.completions.create(request, { signal })
              : await getOpenAI().chat.completions.create(request);
          } finally {
            cleanup();
          }
          const inputTokens = response.usage?.prompt_tokens ?? 0;
          const outputTokens = response.usage?.completion_tokens ?? 0;
          const durationMs = Math.round(performance.now() - startedAt);
          const choice = response.choices[0];
           if (choice?.finish_reason === "length") {
             throw new Error(
               `OpenAI vision transcription was cut off for ${image.label} because it reached the output limit.`,
             );
           }
          const text = choice?.message?.content?.trim();
          if (!text) {
            throw new Error(
              `OpenAI vision returned no transcription for ${image.label} (model=${model}, finish_reason=${choice?.finish_reason ?? "unknown"}, refusal=${choice?.message?.refusal ? "yes" : "no"}).`,
            );
          }
          await options.onCallComplete?.({
            operation: "vision_transcription",
            model,
            status: "completed",
            inputTokens,
            outputTokens,
            totalTokens: response.usage?.total_tokens ?? inputTokens + outputTokens,
            durationMs,
            finishReason: choice?.finish_reason ?? null,
            metadata: { image: image.label, attempt: attempt + 1 },
          });
          logger.info(
            {
              operation: "vision_transcription",
              model,
              image: image.label,
              inputTokens,
              outputTokens,
              totalTokens: response.usage?.total_tokens ?? inputTokens + outputTokens,
              durationMs,
            },
            "OpenAI vision request completed",
          );
          return text;
        } catch (err) {
          lastError = normalizeDeadlineError(err);
          const details = getErrorDetails(lastError);
          await options.onCallComplete?.({
            operation: "vision_transcription",
            model,
            status: "failed",
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            durationMs: Math.round(performance.now() - startedAt),
            errorName: details.errorName,
            errorMessage: details.errorMessage,
            metadata: { image: image.label, attempt: attempt + 1 },
          });
          if (lastError instanceof AnalysisDeadlineExceededError) throw lastError;
        }

        logger.warn(
          { err: lastError, image: image.label, model, attempt: attempt + 1 },
          attempt === VISION_TRANSCRIPTION_RETRY_COUNT
            ? "OpenAI vision transcription attempt failed; trying the next OCR option"
            : "OpenAI vision transcription attempt failed; retrying",
        );
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`OpenAI vision did not return a response for ${image.label}.`);
  });
}

function parseVisionPageBatch(
  content: string,
  expectedPageCount: number,
): string[] {
  const pageTexts: Array<string | undefined> = [];
  const pagePattern =
    /<<<OCR_PAGE_(\d+)>>>\s*([\s\S]*?)\s*<<<END_OCR_PAGE_\1>>>/g;
  let match: RegExpExecArray | null;
  while ((match = pagePattern.exec(content)) !== null) {
    const pageNumber = Number(match[1]);
    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      pageNumber > expectedPageCount ||
      pageTexts[pageNumber - 1] !== undefined
    ) {
      throw new Error("OpenAI vision returned invalid page delimiters for an OCR batch.");
    }
    pageTexts[pageNumber - 1] = match[2]?.trim() ?? "";
  }

  if (
    pageTexts.length !== expectedPageCount ||
    pageTexts.some((text) => !text)
  ) {
    throw new Error(
      `OpenAI vision returned an incomplete OCR batch (${pageTexts.filter(Boolean).length}/${expectedPageCount} pages).`,
    );
  }

  return pageTexts as string[];
}

async function transcribeImageBatchWithVision(
  images: VisionTranscriptionImage[],
  options: VisionTranscriptionOptions,
): Promise<string[]> {
  return withVisionTranscriptionSlot(async () => {
    let lastError: unknown;
    for (const model of [VISION_TRANSCRIPTION_MODEL, VISION_TRANSCRIPTION_FALLBACK_MODEL]) {
      for (
        let attempt = 0;
        attempt <= VISION_TRANSCRIPTION_RETRY_COUNT;
        attempt += 1
      ) {
        const startedAt = performance.now();
        try {
          const { signal, cleanup } = createDeadlineSignal(options.deadlineAt);
          let response;
          try {
            const pageInstructions = images
              .map(
                (_, index) =>
                  `<<<OCR_PAGE_${index + 1}>>>\n<<<END_OCR_PAGE_${index + 1}>>>`,
              )
              .join("\n");
            const request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
              model,
              max_completion_tokens: 12000,
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text:
                        `Transcribe all ${images.length} exam-paper pages below, keeping each page separate. ` +
                        "This may be a CBSE or Indian exam paper printed bilingually in Hindi and English. " +
                        "Return both languages exactly as visible; do not translate, summarize, shorten, or skip repeated-looking text. " +
                        "A Hindi block and its English translation are usually one logical question, but both blocks must still be transcribed. " +
                        "Keep question numbers, options, marks, headings, case-study passages, sub-questions, tables, and line breaks where readable. " +
                        "Scan every supplied page from top to bottom, including continuation text. " +
                        "Return exactly one block for each page using these delimiters and no commentary:\n" +
                        pageInstructions,
                    },
                    ...images.map((image) => ({
                      type: "image_url" as const,
                      image_url: {
                        url: `data:${image.mimeType};base64,${image.data.toString("base64")}`,
                        detail: "high" as const,
                      },
                    })),
                  ],
                },
              ],
            };
            response = signal
              ? await getOpenAI().chat.completions.create(request, { signal })
              : await getOpenAI().chat.completions.create(request);
          } finally {
            cleanup();
          }

          const inputTokens = response.usage?.prompt_tokens ?? 0;
          const outputTokens = response.usage?.completion_tokens ?? 0;
          const durationMs = Math.round(performance.now() - startedAt);
          const choice = response.choices[0];
          if (choice?.finish_reason === "length") {
            throw new Error(
              `OpenAI vision transcription batch was cut off after ${images.length} pages.`,
            );
          }
          const content = choice?.message?.content?.trim();
          if (!content) {
            throw new Error(
              `OpenAI vision returned no transcription for an OCR batch (model=${model}, finish_reason=${choice?.finish_reason ?? "unknown"}).`,
            );
          }
          const pageTexts = parseVisionPageBatch(content, images.length);
          await options.onCallComplete?.({
            operation: "vision_transcription",
            model,
            status: "completed",
            inputTokens,
            outputTokens,
            totalTokens: response.usage?.total_tokens ?? inputTokens + outputTokens,
            durationMs,
            finishReason: choice?.finish_reason ?? null,
            metadata: {
              images: images.map((image) => image.label),
              batchSize: images.length,
              attempt: attempt + 1,
            },
          });
          logger.info(
            {
              operation: "vision_transcription",
              model,
              images: images.map((image) => image.label),
              inputTokens,
              outputTokens,
              totalTokens: response.usage?.total_tokens ?? inputTokens + outputTokens,
              durationMs,
              batchSize: images.length,
            },
            "OpenAI vision OCR batch completed",
          );
          return pageTexts;
        } catch (err) {
          lastError = normalizeDeadlineError(err);
          const details = getErrorDetails(lastError);
          await options.onCallComplete?.({
            operation: "vision_transcription",
            model,
            status: "failed",
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            durationMs: Math.round(performance.now() - startedAt),
            errorName: details.errorName,
            errorMessage: details.errorMessage,
            metadata: {
              images: images.map((image) => image.label),
              batchSize: images.length,
              attempt: attempt + 1,
            },
          });
          if (lastError instanceof AnalysisDeadlineExceededError) throw lastError;
        }

        logger.warn(
          { err: lastError, images: images.map((image) => image.label), model, attempt: attempt + 1 },
          attempt === VISION_TRANSCRIPTION_RETRY_COUNT
            ? "OpenAI vision OCR batch failed; trying the next OCR option"
            : "OpenAI vision OCR batch failed; retrying",
        );
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("OpenAI vision did not return a response for the OCR batch.");
  });
}

function splitVisionImages(
  images: VisionTranscriptionImage[],
  batchSize: number,
): VisionTranscriptionImage[][] {
  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  const batches: VisionTranscriptionImage[][] = [];
  for (let index = 0; index < images.length; index += safeBatchSize) {
    batches.push(images.slice(index, index + safeBatchSize));
  }
  return batches;
}

/**
 * Transcribe scanned paper images with the lowest-cost model that supports
 * vision input. A shared three-request limit protects the upstream rate limit
 * across all concurrently extracted papers, while Promise.all preserves input
 * order in the returned transcription.
 */
export async function transcribeImagesWithVision(
  images: VisionTranscriptionImage[],
  options: VisionTranscriptionOptions = {},
): Promise<string> {
  const batches = splitVisionImages(images, options.batchSize ?? 1);
  const batchTexts = await Promise.all(
    batches.map(async (batch) => {
      let texts: string[];
      if (batch.length === 1) {
        texts = [await transcribeImageWithVision(batch[0]!, options)];
      } else {
        try {
          texts = await transcribeImageBatchWithVision(batch, options);
        } catch (err) {
          if (err instanceof AnalysisDeadlineExceededError) throw err;
          logger.warn(
            { err, images: batch.map((image) => image.label) },
            "Falling back to individual OCR requests after an invalid batch",
          );
          texts = await Promise.all(
            batch.map((image) => transcribeImageWithVision(image, options)),
          );
        }
      }

      for (const image of batch) {
        await options.onImageComplete?.(image);
      }
      return texts;
    }),
  );
  const texts = batchTexts.flat();
  return texts
    .map(
      (text, index) =>
        `--- OCR page ${index + 1}: ${images[index]?.label ?? "uploaded image"} ---\n${text.trim()}`,
    )
    .join("\n\n");
}

export interface QuestionTypeBreakdown {
  mcq: string;
  short: string;
  long: string;
  case_study: string;
}

export interface PaperQuestionEvidence {
  paper: string;
  evidence: string;
}

export interface TopicResult {
  topic_name: string;
  priority: "High" | "Medium" | "Low";
  frequency: number;
  years_appeared: string[];
  confidence_level: "High" | "Medium" | "Low";
  marks_weightage: string;
  question_type_breakdown: QuestionTypeBreakdown;
  study_note: {
    kya_padhna_hai: string;
    kaise_poochha_jaata_hai: string;
    repeat_pattern: string;
  };
  paper_question_evidence?: PaperQuestionEvidence[];
  key_terms: string[];
}

export interface AiAnalysisResult {
  subject: string;
  years_analyzed: string[];
  paper_summaries?: PaperSummary[];
  topics: TopicResult[];
  related_topic_pairs: string[];
  overall_strategy_tip: string;
}

export interface AiCallUsage {
  operation: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
  finishReason?: string | null;
}

export interface PaperSummary {
  paper: string;
  summary: string;
  question_count: number;
  distinctive_topics: string[];
}

const VAGUE_TOPIC_TITLE_PATTERN =
  /(?:definition|explanation|summary|overview|importance|skills|techniques|challenges)\s*$/i;

const BIOLOGY_UMBRELLA_TOPIC_NAMES = new Set([
  "biology",
  "life science",
  "cell biology",
  "genetics",
  "genetic inheritance",
  "evolution",
  "ecology",
  "biodiversity",
  "reproduction",
  "human reproduction",
  "sexual reproduction",
  "human physiology",
  "plant physiology",
  "biotechnology",
  "human health",
  "human health and disease",
  "life processes",
  "molecular biology",
  "environmental issues",
]);

const GENERIC_STUDY_BULLET_PATTERN =
  /^(?:examples?|importance|strateg(?:y|ies)|common challenges?|real[- ]world use cases?|definition|explanation|summary|overview|etc\.?)$/i;

function isBiologySubject(subject: string): boolean {
  return /\b(?:bio(?:logy|logical)?|botany|zoology|life science)\b/i.test(subject);
}

function getVagueTopicNames(result: AiAnalysisResult): string[] {
  const biologySubject = isBiologySubject(result.subject);
  return result.topics
    .map((topic) => topic.topic_name.trim())
    .filter((topicName) => {
      const normalizedName = topicName.toLocaleLowerCase().replace(/\s+/g, " ").trim();
      return (
        VAGUE_TOPIC_TITLE_PATTERN.test(topicName) ||
        (biologySubject && BIOLOGY_UMBRELLA_TOPIC_NAMES.has(normalizedName))
      );
    });
}

function getPaperSummaryQualityIssues(
  result: AiAnalysisResult,
  paperLabels: string[],
): string[] {
  if (!Array.isArray(result.paper_summaries)) {
    return [
      `paper_summaries must contain exactly one grounded summary for each provided paper (${paperLabels.join(", ")}).`,
    ];
  }

  const issues: string[] = [];
  if (result.paper_summaries.length !== paperLabels.length) {
    issues.push(
      `paper_summaries must contain exactly ${paperLabels.length} entries, one for each provided paper.`,
    );
  }

  const summariesByPaper = new Map(
    result.paper_summaries
      .filter((summary) => typeof summary?.paper === "string")
      .map((summary) => [summary.paper, summary]),
  );
  const missingPapers = paperLabels.filter((label) => !summariesByPaper.has(label));
  if (missingPapers.length > 0) {
    issues.push(`Missing grounded paper summaries for: ${missingPapers.join(", ")}.`);
  }

  const emptySummaries = paperLabels.filter((label) => {
    const summary = summariesByPaper.get(label);
    return (
      !summary ||
      typeof summary.summary !== "string" ||
      summary.summary.trim().length < 20 ||
      !Number.isFinite(summary.question_count) ||
      summary.question_count <= 0
    );
  });
  if (emptySummaries.length > 0) {
    issues.push(
      `Paper summaries must include a useful summary and positive question count for: ${emptySummaries.join(", ")}.`,
    );
  }

  const unexpectedPapers = result.paper_summaries
    .map((summary) => summary.paper)
    .filter((label) => !paperLabels.includes(label));
  if (unexpectedPapers.length > 0) {
    issues.push(`paper_summaries included labels that were not uploaded: ${unexpectedPapers.join(", ")}.`);
  }

  return issues;
}

function getConcreteStudyNoteIssues(result: AiAnalysisResult): string[] {
  return result.topics.flatMap((topic) => {
    const note = topic.study_note?.kya_padhna_hai;
    if (typeof note !== "string") return [];
    const bullets = note
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*-\s*/, "").trim())
      .filter(Boolean);
    const genericBullets = bullets.filter((bullet) =>
      GENERIC_STUDY_BULLET_PATTERN.test(bullet),
    );
    return genericBullets.length > 0
      ? [
          `"${topic.topic_name}" contains generic study bullets (${genericBullets.join(", ")}); every bullet must name a paper-derived concept or question pattern.`,
        ]
      : [];
  });
}

function getKyaPadhnaHaiBulletCount(note: unknown): number {
  return typeof note === "string"
    ? (note.match(/^\s*-\s+/gm) ?? []).length
    : 0;
}

function getMinimumTopicCount(paperCount: number): number {
  return paperCount >= 4 ? 18 : Math.max(8, paperCount * 4);
}

export function getAnalysisModelForPaperCount(
  paperCount: number,
): "gpt-4o-mini" | "gpt-5-mini" {
  return paperCount >= 4 ? "gpt-5-mini" : "gpt-4o-mini";
}

export function getTopicQualityIssues(
  result: AiAnalysisResult,
  paperCount: number,
): string[] {
  const issues: string[] = [];
  const minimumTopicCount = getMinimumTopicCount(paperCount);

  if (result.topics.length < minimumTopicCount) {
    issues.push(
      `Returned ${result.topics.length} topics, but this ${paperCount}-paper analysis requires at least ${minimumTopicCount} granular topics.`,
    );
  }

  const vagueTitles = getVagueTopicNames(result).map(
    (topicName) => `"${topicName}"`,
  );
  if (vagueTitles.length > 0) {
    issues.push(
      `These topic names are vague rather than exam-usable: ${vagueTitles.join(", ")}.`,
    );
  }

  const invalidStudyNotes = result.topics.flatMap((topic) => {
    const note = topic.study_note?.kya_padhna_hai;
    const bulletCount = getKyaPadhnaHaiBulletCount(note);
    return bulletCount >= 4 && bulletCount <= 6
      ? []
      : [`"${topic.topic_name}" has ${bulletCount} kya_padhna_hai bullets (needs 4-6).`];
  });
  issues.push(...invalidStudyNotes);
  issues.push(...getConcreteStudyNoteIssues(result));
  issues.push(...getUncoveredDistinctiveTopicIssues(result));

  if (!/Bas Pass Hona Hai\s*:/i.test(result.overall_strategy_tip ?? "")) {
    issues.push(
      'overall_strategy_tip is missing a clearly labeled "Bas Pass Hona Hai:" recommendation.',
    );
  }

  if (paperCount >= 5) {
    issues.push(...getPaperSummaryQualityIssues(result, result.years_analyzed));

    const representedPapers = new Set(
      result.topics.flatMap((topic) =>
        Array.isArray(topic.paper_question_evidence)
          ? topic.paper_question_evidence
              .map((evidence) => evidence?.paper)
              .filter((paper): paper is string => typeof paper === "string")
          : [],
      ),
    );
    const missingEvidencePapers = result.years_analyzed.filter(
      (paper) => !representedPapers.has(paper),
    );
    if (missingEvidencePapers.length > 0) {
      issues.push(
        `At least one grounded topic is required for every paper; missing evidence for: ${missingEvidencePapers.join(", ")}.`,
      );
    }

    const passStrategy = result.overall_strategy_tip?.match(
      /Bas Pass Hona Hai\s*:\s*([\s\S]*)/i,
    )?.[1] ?? "";
    const namedTopics = result.topics.filter((topic) =>
      passStrategy.includes(topic.topic_name),
    );
    if (result.topics.length > 0 && namedTopics.length === 0) {
      issues.push(
        'Bas Pass Hona Hai: must name exact granular topic_name values rather than only giving general advice.',
      );
    }
  }

  return issues;
}

function normalizeTopicName(topicName: string): string {
  return topicName
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getUncoveredDistinctiveTopicIssues(result: AiAnalysisResult): string[] {
  const topicNames = result.topics.map((t) => normalizeTopicName(t.topic_name));
  const issues: string[] = [];
  for (const summary of result.paper_summaries ?? []) {
    for (const dt of summary.distinctive_topics ?? []) {
      if (typeof dt !== "string" || !dt.trim()) continue;
      const normalized = normalizeTopicName(dt);
      const covered = topicNames.some(
        (tn) => tn.includes(normalized) || normalized.includes(tn),
      );
      if (!covered) {
        issues.push(
          `"${dt}" was listed as a distinctive topic in ${summary.paper}'s summary but has no matching entry in topics — add it as a real topic if the paper text supports it.`,
        );
      }
    }
  }
  return issues;
}

/**
 * Adds only distinct, usable additions. Normalizing labels prevents cosmetic
 * variants such as "Meeting Agenda" and "meeting-agenda" from consuming a
 * missing-topic slot.
 */
export function mergeAdditionalTopics(
  existingTopics: TopicResult[],
  additions: TopicResult[],
): TopicResult[] {
  const knownTopicNames = new Set(
    existingTopics.map((topic) => normalizeTopicName(topic.topic_name)),
  );
  const uniqueAdditions: TopicResult[] = [];

  for (const topic of additions) {
    const normalizedName =
      typeof topic?.topic_name === "string"
        ? normalizeTopicName(topic.topic_name)
        : "";
    if (!normalizedName || knownTopicNames.has(normalizedName)) continue;

    knownTopicNames.add(normalizedName);
    uniqueAdditions.push(topic);
  }

  return [...existingTopics, ...uniqueAdditions];
}

function normalizeEvidenceText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function containsQuotedQuestionPhrase(evidence: string, paperText: string): boolean {
  const evidenceWords = normalizeEvidenceText(evidence).split(/\s+/).filter(Boolean);
  if (evidenceWords.length < 3) return false;

  const normalizedPaper = normalizeEvidenceText(paperText);
  const phraseLength = Math.min(6, evidenceWords.length);
  for (let length = phraseLength; length >= 3; length -= 1) {
    for (let start = 0; start + length <= evidenceWords.length; start += 1) {
      const phrase = evidenceWords.slice(start, start + length).join(" ");
      if (normalizedPaper.includes(phrase)) return true;
    }
  }
  return false;
}

function hasVerifiedPaperQuestionEvidence(
  topic: TopicResult,
  fallbackYears: string[],
  sourcePapers?: Array<{ label: string; text: string }>,
): boolean {
  const validYears = new Set(fallbackYears);
  const evidence = Array.isArray(topic.paper_question_evidence)
    ? topic.paper_question_evidence
        .filter(
          (item) =>
            typeof item?.paper === "string" &&
            validYears.has(item.paper) &&
            typeof item?.evidence === "string" &&
            normalizeEvidenceText(item.evidence).split(/\s+/).filter(Boolean).length >= 3,
        )
        .map((item) => ({
          paper: item.paper.trim(),
          evidence: item.evidence.trim(),
        }))
    : [];

  if (evidence.length === 0) return false;

  const sourceByLabel = sourcePapers
    ? new Map(sourcePapers.map((paper) => [paper.label, paper.text || ""]))
    : undefined;

  return evidence.some((item) => {
    if (!topic.years_appeared.includes(item.paper)) return false;
    if (!sourceByLabel) return true;
    const paperText = sourceByLabel.get(item.paper);
    return paperText !== undefined && containsQuotedQuestionPhrase(item.evidence, paperText);
  });
}

function hasNonEmptyStudyNotes(
  topic: TopicResult,
  requireCompleteStudyNotes: boolean,
): boolean {
  const note = topic.study_note;
  const bulletCount = getKyaPadhnaHaiBulletCount(note?.kya_padhna_hai);
  const hasNonEmptyStudyContent =
    typeof note?.kya_padhna_hai === "string" &&
    note.kya_padhna_hai.trim().length > 0;
  const hasCompleteBulletCount =
    !requireCompleteStudyNotes || (bulletCount >= 4 && bulletCount <= 6);
  return (
    hasNonEmptyStudyContent &&
    hasCompleteBulletCount &&
    typeof note?.kaise_poochha_jaata_hai === "string" &&
    note.kaise_poochha_jaata_hai.trim().length > 0 &&
    typeof note?.repeat_pattern === "string" &&
    note.repeat_pattern.trim().length > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isCompleteQuestionTypeBreakdown(
  value: unknown,
): value is QuestionTypeBreakdown {
  return (
    isRecord(value) &&
    typeof value.mcq === "string" &&
    typeof value.short === "string" &&
    typeof value.long === "string" &&
    typeof value.case_study === "string"
  );
}

function isCompleteStudyNote(
  value: unknown,
): value is TopicResult["study_note"] {
  return (
    isRecord(value) &&
    typeof value.kya_padhna_hai === "string" &&
    typeof value.kaise_poochha_jaata_hai === "string" &&
    typeof value.repeat_pattern === "string"
  );
}

function isCompleteTopicResult(value: unknown): value is TopicResult {
  if (
    !isRecord(value) ||
    typeof value.topic_name !== "string" ||
    typeof value.priority !== "string" ||
    !["High", "Medium", "Low"].includes(value.priority) ||
    typeof value.frequency !== "number" ||
    !Number.isFinite(value.frequency) ||
    !isStringArray(value.years_appeared) ||
    typeof value.confidence_level !== "string" ||
    !["High", "Medium", "Low"].includes(value.confidence_level) ||
    typeof value.marks_weightage !== "string" ||
    !isCompleteQuestionTypeBreakdown(value.question_type_breakdown) ||
    !isCompleteStudyNote(value.study_note) ||
    !isStringArray(value.key_terms)
  ) {
    return false;
  }

  return (
    value.paper_question_evidence === undefined ||
    (Array.isArray(value.paper_question_evidence) &&
      value.paper_question_evidence.every(
        (item) =>
          isRecord(item) &&
          typeof item.paper === "string" &&
          typeof item.evidence === "string",
      ))
  );
}

function normalizeTopicLevel(
  value: unknown,
): TopicResult["priority"] | undefined {
  if (typeof value !== "string") return undefined;

  switch (value.trim().toLowerCase()) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    default:
      return undefined;
  }
}

function normalizeFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim().length === 0) return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeTopicSchemaMetadata(
  value: unknown,
  fallbackYears: string[],
): unknown {
  if (!isRecord(value)) return value;

  const evidencePapers = Array.isArray(value.paper_question_evidence)
    ? value.paper_question_evidence
        .filter(isRecord)
        .map((item) => item.paper)
        .filter(
          (paper): paper is string =>
            typeof paper === "string" && fallbackYears.includes(paper),
        )
    : [];
  const yearsAppeared = isStringArray(value.years_appeared)
    ? value.years_appeared
    : [...new Set(evidencePapers)];
  const frequency = normalizeFiniteNumber(value.frequency) ?? yearsAppeared.length;
  const normalizedPriority = normalizeTopicLevel(value.priority);
  const priority =
    normalizedPriority
      ? normalizedPriority
      : frequency >= 3
        ? "High"
        : frequency >= 2
          ? "Medium"
          : "Low";
  const normalizedConfidenceLevel = normalizeTopicLevel(value.confidence_level);
  const confidenceLevel =
    normalizedConfidenceLevel
      ? normalizedConfidenceLevel
      : frequency >= 3
        ? "High"
        : frequency >= 2
          ? "Medium"
          : "Low";
  const rawBreakdown = isRecord(value.question_type_breakdown)
    ? value.question_type_breakdown
    : {};
  const questionTypeBreakdown: QuestionTypeBreakdown = {
    mcq: typeof rawBreakdown.mcq === "string" ? rawBreakdown.mcq : "Not specified",
    short:
      typeof rawBreakdown.short === "string"
        ? rawBreakdown.short
        : "Not specified",
    long:
      typeof rawBreakdown.long === "string"
        ? rawBreakdown.long
        : "Not specified",
    case_study:
      typeof rawBreakdown.case_study === "string"
        ? rawBreakdown.case_study
        : "Not specified",
  };
  const keyTerms = Array.isArray(value.key_terms)
    ? value.key_terms.filter((term): term is string => typeof term === "string")
    : [];

  return {
    ...value,
    priority,
    frequency,
    years_appeared: yearsAppeared,
    confidence_level: confidenceLevel,
    marks_weightage:
      typeof value.marks_weightage === "string"
        ? value.marks_weightage
        : "Not specified",
    question_type_breakdown: questionTypeBreakdown,
    key_terms: keyTerms,
  };
}

function normalizeTopicListSchemaMetadata(
  value: unknown,
  fallbackYears: string[],
): { topics: TopicResult[]; recoveredCount: number } {
  if (!Array.isArray(value)) return { topics: [], recoveredCount: 0 };

  let recoveredCount = 0;
  const topics = value.map((topic) => {
    const wasComplete = isCompleteTopicResult(topic);
    const normalized = normalizeTopicSchemaMetadata(topic, fallbackYears);
    if (!wasComplete && isCompleteTopicResult(normalized)) {
      recoveredCount += 1;
    }
    return normalized;
  });

  return {
    topics: topics as TopicResult[],
    recoveredCount,
  };
}

function normalizeRepairPatchSchemaMetadata(
  value: Record<string, unknown>,
  fallbackYears: string[],
): { patch: TopicRepairPatch; recoveredCount: number } {
  const additions = normalizeTopicListSchemaMetadata(
    value.topics,
    fallbackYears,
  );
  let recoveredCount = additions.recoveredCount;
  const replacements = Array.isArray(value.replacements)
    ? value.replacements.map((replacement) => {
        if (!isRecord(replacement)) return replacement;
        const normalized = normalizeTopicListSchemaMetadata(
          [replacement.topic],
          fallbackYears,
        );
        recoveredCount += normalized.recoveredCount;
        return {
          ...replacement,
          topic: normalized.topics[0],
        };
      })
    : undefined;

  return {
    patch: {
      ...value,
      topics: additions.topics,
      replacements,
    } as unknown as TopicRepairPatch,
    recoveredCount,
  };
}

function getSchemaIncompleteTopicCount(value: unknown): {
  total: number;
  incomplete: number;
} {
  if (!isRecord(value) || !Array.isArray(value.topics)) {
    return { total: 0, incomplete: 0 };
  }

  return {
    total: value.topics.length,
    incomplete: value.topics.filter((topic) => !isCompleteTopicResult(topic)).length,
  };
}

function buildFallbackStrategy(topics: unknown[]): string {
  const topicNames = topics
    .filter(isRecord)
    .map((topic) => topic.topic_name)
    .filter(
      (topicName): topicName is string =>
        typeof topicName === "string" && topicName.trim().length > 0,
    )
    .slice(0, 6);

  return topicNames.length > 0
    ? `Bas Pass Hona Hai: ${topicNames.join(", ")} ko pehle prepare karo, kyunki ye uploaded papers se nikle hue priority topics hain.`
    : "Bas Pass Hona Hai: uploaded papers se verify hue high-priority topics ko pehle prepare karo.";
}

function normalizeInitialAnalysisEnvelope(
  value: unknown,
  fallbackSubject: string,
  fallbackYears: string[],
): {
  result: AiAnalysisResult;
  hadTopicsArray: boolean;
  usedFallbackStrategy: boolean;
  recoveryIssues: string[];
} {
  if (!isRecord(value)) {
    throw new Error("Invalid AI response schema");
  }

  const hadTopicsArray = Array.isArray(value.topics);
  const topics: unknown[] = Array.isArray(value.topics) ? value.topics : [];
  const recoveryIssues: string[] = [];
  const subject =
    typeof value.subject === "string" && value.subject.trim().length > 0
      ? value.subject
      : fallbackSubject;
  if (subject !== value.subject) {
    recoveryIssues.push(
      "The AI omitted the subject label, so the submitted subject was restored.",
    );
  }

  const usedFallbackStrategy =
    typeof value.overall_strategy_tip !== "string" ||
    value.overall_strategy_tip.trim().length === 0;
  const overallStrategyTip = usedFallbackStrategy
    ? buildFallbackStrategy(topics)
    : value.overall_strategy_tip;
  if (usedFallbackStrategy) {
    recoveryIssues.push(
      "The AI omitted the overall strategy, so a safe strategy was rebuilt from its grounded topic names.",
    );
  }

  if (!hadTopicsArray) {
    recoveryIssues.push(
      "The initial AI response omitted its topic array, so one bounded grounded repair was requested.",
    );
  }

  return {
    result: {
      ...value,
      subject,
      years_analyzed: [...fallbackYears],
      topics,
      related_topic_pairs: Array.isArray(value.related_topic_pairs)
        ? value.related_topic_pairs
        : [],
      overall_strategy_tip: overallStrategyTip,
    } as unknown as AiAnalysisResult,
    hadTopicsArray,
    usedFallbackStrategy,
    recoveryIssues,
  };
}

function isCompletePaperSummary(value: unknown): value is PaperSummary {
  return (
    isRecord(value) &&
    typeof value.paper === "string" &&
    typeof value.summary === "string" &&
    typeof value.question_count === "number" &&
    Number.isFinite(value.question_count) &&
    isStringArray(value.distinctive_topics)
  );
}

interface TopicRepairPatch {
  replacements?: Array<{
    current_topic_name: string;
    topic: TopicResult;
  }>;
  topics?: TopicResult[];
  paper_summaries?: PaperSummary[];
  overall_strategy_tip?: string;
}

/**
 * Applies a narrowly-scoped AI repair without allowing it to replace accepted
 * topics or paper summaries. Every replacement must identify one existing
 * topic, and additions still pass duplicate filtering.
 */
export function applyTopicRepairPatch(
  result: AiAnalysisResult,
  patch: TopicRepairPatch,
): AiAnalysisResult {
  const replacementByCurrentName = new Map(
    (patch.replacements ?? [])
      .filter(
        (replacement) =>
          typeof replacement?.current_topic_name === "string" &&
          typeof replacement?.topic?.topic_name === "string",
      )
      .map((replacement) => [
        normalizeTopicName(replacement.current_topic_name),
        replacement.topic,
      ]),
  );
  const existingNames = new Set(
    result.topics.map((topic) => normalizeTopicName(topic.topic_name)),
  );
  const replacedNames = new Set<string>();
  const repairedTopics = result.topics.map((topic) => {
    const currentName = normalizeTopicName(topic.topic_name);
    const replacement = replacementByCurrentName.get(currentName);
    if (!replacement) return topic;

    const replacementName = normalizeTopicName(replacement.topic_name);
    if (
      !replacementName ||
      (replacementName !== currentName && existingNames.has(replacementName)) ||
      replacedNames.has(replacementName)
    ) {
      return topic;
    }

    replacedNames.add(replacementName);
    return replacement;
  });

  return {
    ...result,
    topics: mergeAdditionalTopics(repairedTopics, patch.topics ?? []),
    paper_summaries: Array.isArray(patch.paper_summaries)
      ? patch.paper_summaries
      : result.paper_summaries,
    overall_strategy_tip:
      typeof patch.overall_strategy_tip === "string" &&
      patch.overall_strategy_tip.trim().length > 0
        ? patch.overall_strategy_tip
        : result.overall_strategy_tip,
  };
}

export function validateAiAnalysisResult(
  result: AiAnalysisResult,
  fallbackYears: string[],
  sourcePapers?: Array<{ label: string; text: string }>,
  requireCompleteStudyNotes = true,
): void {
  if (
    !result.subject?.trim() ||
    !Array.isArray(result.topics) ||
    typeof result.overall_strategy_tip !== "string"
  ) {
    throw new Error("Invalid AI response schema");
  }

  const topicsBeforeSchemaFilter = result.topics.length;
  result.topics = result.topics.filter(isCompleteTopicResult);
  if (topicsBeforeSchemaFilter !== result.topics.length) {
    logger.warn(
      {
        removedTopicCount: topicsBeforeSchemaFilter - result.topics.length,
        remainingTopicCount: result.topics.length,
      },
      "Removed AI topics that did not match the complete topic schema",
    );
  }

  if (result.topics.length === 0) {
    throw new Error(
      "The analysis response did not include any usable topics. Please try again.",
    );
  }

  // The uploaded files are the source of truth. Do not let the model silently
  // report only the papers it happened to mention in its answer.
  result.years_analyzed = [...fallbackYears];

  if (!Array.isArray(result.related_topic_pairs)) {
    result.related_topic_pairs = [];
  } else {
    result.related_topic_pairs = result.related_topic_pairs.filter(
      (pair): pair is string => typeof pair === "string",
    );
  }

  if (Array.isArray(result.paper_summaries)) {
    result.paper_summaries = result.paper_summaries.filter(isCompletePaperSummary);
  } else {
    result.paper_summaries = undefined;
  }

  const validYears = new Set(fallbackYears);
  for (const topic of result.topics) {
    if (Array.isArray(topic.years_appeared)) {
      topic.years_appeared = [...new Set(topic.years_appeared)].filter((year) =>
        validYears.has(year),
      );
    } else {
      topic.years_appeared = [];
    }
  }

  const topicsBeforeEvidenceFilter = result.topics.length;
  result.topics = result.topics.filter((topic) => {
    const hasEvidence = hasVerifiedPaperQuestionEvidence(
      topic,
      fallbackYears,
      sourcePapers,
    );
    const hasNotes = hasNonEmptyStudyNotes(topic, requireCompleteStudyNotes);
    return hasEvidence && hasNotes;
  });
  if (topicsBeforeEvidenceFilter !== result.topics.length) {
    logger.warn(
      {
        removedTopicCount: topicsBeforeEvidenceFilter - result.topics.length,
        remainingTopicCount: result.topics.length,
        sourceVerificationEnabled: sourcePapers !== undefined,
      },
      "Removed AI topics without verified paper evidence and complete study notes",
    );
  }

  if (result.topics.length === 0) {
    throw new Error(
      "The analysis response did not include any topics with verified paper evidence and study notes. Please try again.",
    );
  }
}

/**
 * Keep a whole paper in the model input. A head/tail slice is especially
 * harmful for exam papers because it removes the questions in the middle while
 * leaving the model no indication that its coverage is incomplete.
 *
 * The budget is deliberately large enough for a long scanned paper after
 * vision transcription. If a paper is still larger, fail instead of silently
 * producing an analysis from partial source material.
 */
export const MAX_CHARS_PER_PAPER = 80000;

export class PaperInputTooLargeError extends Error {
  constructor(
    readonly paperLabel: string,
    readonly characterCount: number,
  ) {
    super(
      `${paperLabel} contains ${characterCount.toLocaleString()} extracted characters, which exceeds the ${MAX_CHARS_PER_PAPER.toLocaleString()}-character complete-paper analysis limit. No partial analysis was attempted.`,
    );
    this.name = "PaperInputTooLargeError";
  }
}

export function limitPaperForPrompt(text: string, paperLabel = "This paper"): string {
  if (text.length <= MAX_CHARS_PER_PAPER) return text;
  throw new PaperInputTooLargeError(paperLabel, text.length);
}

export function buildPaperPromptContent(
  papers: Array<{ label: string; text: string }> | undefined,
  fallbackText: string,
  fallbackYears: string[],
): string {
  const paperBlocks =
    papers && papers.length > 0
      ? papers
      : [{ label: fallbackYears[0] ?? "Paper 1", text: fallbackText }];

  return paperBlocks
    .map(
      (paper) =>
        `--- ${paper.label} (complete paper kept separate) ---\n${limitPaperForPrompt(
          paper.text || "(No text extracted from this paper)",
          paper.label,
        )}`,
    )
    .join("\n\n");
}

export async function analyzeWithAI(params: {
  analysisId?: number;
  category: string;
  classOrCourse: string;
  boardOrUniversity: string;
  subject: string;
  yearLabels: string[];
  papers?: Array<{ label: string; text: string }>;
  extractedText: string;
  analysisModel?: "gpt-4o-mini" | "gpt-5-mini";
  deadlineAt?: number;
  onCallComplete?: ProviderCallReporter;
}): Promise<{
  result: AiAnalysisResult;
  inputTokens: number;
  outputTokens: number;
  usage: AiCallUsage[];
  degraded: boolean;
  qualityIssues: string[];
}> {

  const systemPrompt = `You are an expert academic exam analyst with years of experience studying question paper patterns for Indian school and college exams. You don't just summarize — you find deep, non-obvious patterns that a professional exam coach would notice: which specific topics are actually tested repeatedly, how question difficulty and format has shifted across years, which topics are frequently paired together in exams, and how confident one can be in a prediction based on the consistency of the pattern.

Rules:
1. Identify each distinct, specific topic that appears in the papers as its own entry — do NOT group multiple distinct topics under one umbrella category. Do not cap the topic list based on a typical syllabus size; make sure you're not under-segmenting into overly broad categories. For example, "HRM" as a whole is too broad — instead identify "HRM vs Personnel Management", "HR Manager Roles", "Manpower Planning", "Training Methods", "Performance Appraisal", etc. as separate topics.
2. Track YEAR-WISE presence — for each topic, show exactly which of the provided papers it appeared in, not just a total count.
3. Identify QUESTION TYPE patterns — classify questions by format (MCQ, short answer, long answer/essay, case study) and note which format is most common for each topic.
4. Assign a CONFIDENCE LEVEL (High/Medium/Low) to each prediction, based on how consistent the pattern is — a topic appearing in 4 out of 5 years in a similar format deserves "High confidence," while an inconsistent or only-once appearance deserves "Low confidence." Be honest — do not inflate confidence to seem more impressive.
5. Note any RELATED TOPIC PAIRS — if two topics are frequently combined into a single case-study or long-answer question, mention this explicitly, since it changes how a student should prepare.
6. Only use information present in the provided papers — do not invent patterns or add outside subject knowledge beyond what's needed to name/explain a concept clearly.
7. Write all explanatory text in casual, friendly Hinglish, in the tone of an experienced senior mentoring a student — not formal or robotic.
8. Analyze EVERY labeled paper separately before comparing them. Do not stop after the first paper.
9. Output ONLY valid JSON in the exact schema provided. No extra text, no markdown, no preamble.
10. Do NOT create broad umbrella topics. Every topic must be specific enough that a student who reads only that topic's notes could answer the actual exam questions mapped to it. Split umbrella areas into precise, exam-usable topics. For example, use "Business Letters: Types, Layout & Persuasive/Enquiry Letters" with its specific sub-points instead of one vague topic called "Business Letters".
11. After extracting topics, perform a question-by-question coverage audit across ALL provided papers. Every visible question must map to at least one topic. If a question does not fit an existing topic, create a new specific topic for it. Never silently merge unrelated questions into a broad topic, and never drop a question from the analysis.
12. For every topic, make study_note.kya_padhna_hai a concrete 4-6 item bullet list derived directly from the actual question wording in the papers. Include specific definitions asked, named processes or frameworks asked, applied or case-based situations asked, and named sub-types that appeared. Do not write generic one-line textbook advice. Use newline-separated bullets beginning with "- ".
13. When selecting topics for the "Bas Pass Hona Hai" pass-tier strategy in overall_strategy_tip, choose granular topics that together let a student who studies only them realistically attempt at least 40-50% of the actual questions with complete answers. Do not reach that percentage by counting marks from one or two overly broad topics.
14. Before returning JSON, re-check that the topic list is specific, every paper and every visible question is represented, every kya_padhna_hai has 4-6 paper-derived bullets, and the pass-tier recommendation satisfies the realistic-question-coverage requirement.
15. Apply this non-negotiable granularity test to every topic_name: reject it if a student would still need to study several independent, differently answerable ideas to answer the mapped questions. Names like "Business letter", "Oral communication", "Nonverbal communication", "Presentation techniques", or "Corporate communication challenges" are too broad by themselves. Use a precise composite name only when its named parts were actually tested together, such as "Business Letters: Types, Layout, Enquiry & Persuasive Letters".
16. Do not use generic filler in kya_padhna_hai. A bullet is invalid if it could be written without reading these papers, such as "examples", "importance", "strategies", "common challenges", or "real-world use cases" by themselves. Every bullet must include at least one concrete noun, named sub-type, definition, process step, comparison, or applied scenario actually visible in a question.
17. For the coverage audit, first make a private checklist of every visible question or separately answerable sub-question in every paper. Map each checklist item to a topic. The topic list may exceed 12 and should normally expand to 15-30 entries when that is what full coverage requires. Do not reduce the count merely to fit a preferred topic total.
18. For every topic, include at least one paper_question_evidence item. Its evidence must quote a short, distinctive phrase of at least 3 words from the actual question or sub-question, not a generic explanation. The paper label must be one of the provided labels, and it must also appear in years_appeared.
19. A topic is valid only when it has verified paper_question_evidence and non-empty content in all three study_note fields. Never add a topic merely to reach a count; omit it when the papers do not support it.
20. Before topic synthesis, scan every provided paper from beginning to end and make a private sequential checklist of every question and separately answerable sub-question. Extract each distinct tested concept from that checklist, then map each topic back to at least one checklist item and quote its evidence.
21. overall_strategy_tip must contain a clearly labeled "Bas Pass Hona Hai:" recommendation that names the exact granular topic_name values to study, explains why that set covers at least 40-50% of actual questions, and does not use an umbrella category as a substitute for multiple answerable concepts.
22. OCR page boundaries are explicit source boundaries, not optional excerpts. Read every OCR page marker in every paper, including the middle and final pages, before synthesizing topics.
23. Bilingual normalization rule: when Hindi and English are translations of the same numbered question, count them as ONE logical question for question_count, frequency, coverage, and repeat patterns. Do not count the Hindi and English blocks as two questions. Keep separately answerable sub-questions distinct.
24. For bilingual questions, use the clearest available wording from either language for paper_question_evidence, but only when that quoted phrase appears verbatim in the supplied paper text.`;

  const yearsList = params.yearLabels.join(", ");
  const minimumTopicCount = getMinimumTopicCount(params.yearLabels.length);
  const initialModel =
    params.analysisModel ?? getAnalysisModelForPaperCount(params.yearLabels.length);
  const initialTokenLimit =
    initialModel === "gpt-5-mini"
      ? { max_completion_tokens: 28000, reasoning_effort: "low" as const }
      : { max_tokens: 12000 };
  const paperContent = buildPaperPromptContent(
    params.papers,
    params.extractedText,
    params.yearLabels,
  );
  const subjectSpecificGuidance = isBiologySubject(params.subject)
    ? `\nBiology-specific guardrail: split broad chapters such as Genetics, Ecology, Reproduction, Biotechnology, Human Health, and Cell Biology into the independently answerable processes, comparisons, diagrams, disorders, experiments, inheritance problems, or case situations that are visibly asked. Do not return a single chapter name as a topic.\n`
    : "";
  const userPrompt = `Category: ${params.category}
Class/Course: ${params.classOrCourse || "Not specified"}
Board/University: ${params.boardOrUniversity || "Not specified"}
Subject: ${params.subject}
${subjectSpecificGuidance}
Papers provided (these exact labels must be used): ${yearsList}
First-pass coverage target: this ${params.yearLabels.length}-paper run must return at least ${minimumTopicCount} granular, distinct topics. For four or more papers, aim for 18-20+ topics before returning JSON.

Previous year paper content (each paper is separate and must be analyzed):
${paperContent}

Perform a deep analysis and return JSON in this exact format:

{
  "subject": "string",
  "years_analyzed": ${JSON.stringify(params.yearLabels)},
  "paper_summaries": [
    {
      "paper": "Paper 1",
      "summary": "Hinglish summary of what this paper tested",
      "question_count": 0,
      "distinctive_topics": ["specific topic that appeared in this paper"]
    }
  ],
  "topics": [
    {
      "topic_name": "string — specific concept/area, NOT a broad chapter umbrella",
      "priority": "High | Medium | Low",
      "frequency": number,
      "years_appeared": ["Paper 1", "Paper 2"],
      "confidence_level": "High | Medium | Low",
      "marks_weightage": "string (e.g. '15-20 marks')",
      "question_type_breakdown": {
        "mcq": "count or percentage or 'None'",
        "short": "count or percentage or 'None'",
        "long": "count or percentage or 'None'",
        "case_study": "count or percentage or 'None'"
      },
      "study_note": {
        "kya_padhna_hai": "Hinglish — list the specific concepts, theories, named items, formulas, or case types that actually appeared in the papers",
        "kaise_poochha_jaata_hai": "Hinglish — describe the exact question format seen across these papers",
        "repeat_pattern": "Hinglish — if same or similar question appeared in multiple years, call it out explicitly"
      },
      "paper_question_evidence": [
        {
          "paper": "Paper 1",
          "evidence": "short verbatim phrase from the mapped question"
        }
      ],
      "key_terms": ["term1", "term2", "term3"]
    }
  ],
  "related_topic_pairs": [
    "Hinglish string describing any topics frequently combined in one question"
  ],
  "overall_strategy_tip": "Hinglish one-paragraph exam strategy based on what you saw in the papers"
}

Rules for this response:
- paper_summaries: include EXACTLY one entry for EVERY provided paper (${yearsList}). Never omit Paper 2, Paper 3, or any other provided paper. Count questions conservatively from the visible paper content.
- topics: For this ${params.yearLabels.length}-paper run, return at least ${minimumTopicCount} granular topics; when four or more papers are provided, target 18-20+ distinct topics on the first pass. Each topic_name should be a precise concept, NOT a broad chapter name. Split broad areas into their actual distinct sub-concepts.
- Specificity and coverage take priority over any preferred topic total: create additional topics whenever needed so every visible question across every provided paper maps to at least one topic. Never omit, silently merge, or hide an unmatched question.
- priority: Use these thresholds strictly:
  "High"   → appeared in 3+ of the provided years (very consistent pattern)
  "Medium" → appeared in exactly 2 of the provided years (some consistency)
  "Low"    → appeared in only 1 of the provided years (one-time appearance, uncertain if it repeats)
  Exception: if only 1-2 papers were provided, treat "appeared in all provided years" as High, "appeared in 1 of 2" as Medium, and anything with only a brief mention as Low.
  IMPORTANT — distribution rule: Keep a realistic spread of High, Medium, and Low priorities. Do NOT assign High or Medium to nearly every topic. A topic that appeared in only 1 of 4+ papers is Low, full stop — even if it carried good marks in that one year. Be strict.
- confidence_level: "High" if pattern is very consistent (3+ years, same format); "Medium" if somewhat consistent; "Low" if only once or inconsistent.
- study_note: all 3 fields required for every topic. The kya_padhna_hai field must contain exactly 4-6 concrete newline-separated bullet points beginning with "- ", each grounded in actual question phrasing or named content from the papers. This 4-6 bullet requirement applies even to Low priority topics; do not replace it with a generic summary.
- question coverage audit: mentally map every visible question in every paper to one or more specific topics before finalizing. If any question is unmatched, create a new topic rather than broadening an unrelated topic.
- pass-tier selection: in the "Bas Pass Hona Hai" part of overall_strategy_tip, recommend granular topics that cover at least 40-50% of actual questions with complete-answer preparation, not merely 40-50% of marks through broad topics.
- paper_question_evidence: every topic must include at least one entry whose paper is one of the exact provided labels and whose evidence is a short verbatim phrase of at least 3 words from an actual question or separately answerable sub-question. Do not use a generic description as evidence.
- hard evidence rule: do not return a topic if you cannot quote actual question evidence for it and provide non-empty content in all three study_note fields. Fewer real topics are better than fabricated padding.
- systematic extraction rule: scan every provided paper sequentially, including every numbered question, option, sub-question, and case-study prompt, before deciding the final topic list. Do not stop after the first 8-10 topics.
- mandatory topic-name test: do not return an umbrella topic such as "Business letter", "Oral communication", "Nonverbal communication", "Presentation techniques", or "Corporate communication challenges" unless the paper has only one inseparable question on that exact narrow concept. Split it into the independently answerable definitions, layouts, types, comparisons, processes, methods, barriers, case situations, or named sub-types actually asked.
- mandatory study-bullet test: reject any kya_padhna_hai bullet that says only "examples", "importance", "strategies", "common challenges", "real-world use cases", or similarly generic advice. Every one of the 4-6 bullets must name a concrete phrase, sub-type, framework, comparison, format, or scenario from an actual paper question.
- do not cap coverage at any lower topic total. Use 15-30 granular topics when needed to cover the papers completely.
 - hard minimum for this run: return at least ${minimumTopicCount} granular topics. A response below this count is incomplete and invalid for this paper set. For four or more papers, target 18-20+ granular topics on this first pass. Expand with the independently answerable concepts, formats, comparisons, named documents, meeting items, writing forms, and communication skills that appeared in the papers.
- paper-summary audit: every item named in every paper_summaries[].distinctive_topics list should map to a matching or more specific entry in topics. Do not list a concept in a paper summary and then omit it from topics.
- bilingual paper audit: Hindi and English translations of the same numbered question count once; independently numbered or separately answerable sub-questions count separately. Do not inflate question_count, frequency, or coverage by counting translations twice.
- page coverage audit: OCR page markers are source boundaries. Confirm that the first, middle, and final OCR pages contributed to the checklist before returning paper_summaries or topics.
- reject vague topic titles ending in or equivalent to "Definition", "Explanation", "Summary", "Importance", "Skills", "Techniques", or "Challenges" unless the title also names the precise concept, subtype, format, or question situation that makes it independently answerable.
- overall_strategy_tip must include a visible "Bas Pass Hona Hai:" label followed by the exact granular topic_name values selected and a realistic explanation of how those individual topics let the student attempt 40-50% of the actual questions.
- related_topic_pairs: only include if genuinely observed — empty array [] is fine if none found.
- Return ONLY valid JSON, no other text.`;

  const usage: AiCallUsage[] = [];
  const reportCall = async (diagnostic: ProviderCallDiagnostic) => {
    try {
      await params.onCallComplete?.(diagnostic);
    } catch (err) {
      logger.error(
        { err, analysisId: params.analysisId, operation: diagnostic.operation },
        "Could not persist provider-call diagnostics",
      );
    }
  };
  const runAnalysisRequest = async <
    T extends {
      usage?: {
        prompt_tokens?: number | null;
        completion_tokens?: number | null;
        total_tokens?: number | null;
      } | null;
      choices?: Array<{ finish_reason?: string | null }>;
    },
  >(
    operation: string,
    model: string,
    request: (signal?: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    const startedAt = performance.now();
    try {
      const { signal, cleanup } = createDeadlineSignal(params.deadlineAt);
      let response: T;
      try {
        response = await request(signal);
      } finally {
        cleanup();
      }
      const inputTokens = response.usage?.prompt_tokens ?? 0;
      const outputTokens = response.usage?.completion_tokens ?? 0;
      const callUsage: AiCallUsage = {
        operation,
        model,
        inputTokens,
        outputTokens,
        totalTokens: response.usage?.total_tokens ?? inputTokens + outputTokens,
        durationMs: Math.round(performance.now() - startedAt),
        finishReason: response.choices?.[0]?.finish_reason ?? null,
      };
      usage.push(callUsage);
      await reportCall({ ...callUsage, status: "completed" });
      logger.info(
        { analysisId: params.analysisId, ...callUsage },
        "OpenAI analysis request completed",
      );
      return response;
    } catch (err) {
      const normalizedError = normalizeDeadlineError(err);
      const details = getErrorDetails(normalizedError);
      await reportCall({
        operation,
        model,
        status: "failed",
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        durationMs: Math.round(performance.now() - startedAt),
        errorName: details.errorName,
        errorMessage: details.errorMessage,
      });
      throw normalizedError;
    }
  };

  const makeRequest = async () => {
    return runAnalysisRequest("initial", initialModel, (signal) =>
      getOpenAI().chat.completions.create({
      model: initialModel,
      ...initialTokenLimit,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      }, signal ? { signal } : undefined),
    );
  };

  const makeTargetedRepairRequest = async (
    previousJson: string,
    issues: string[],
    acceptedTopicCount: number,
  ) => {
    const missingTopicCount = Math.max(0, minimumTopicCount - acceptedTopicCount);
    const additionRequirement =
      acceptedTopicCount === 0
        ? "No topics from the initial response were accepted because its topic objects were structurally incomplete. Rebuild grounded, complete topic objects in \"topics\" from the paper text. Do not use \"replacements\" because there are no accepted topics to replace."
        : missingTopicCount > 0
        ? `The accepted analysis already has ${acceptedTopicCount} valid topics. Return up to ${missingTopicCount} NEW, distinct topic objects in "topics" only when each one is directly supported by the paper text. Returning fewer is correct; never invent or pad topics to reach ${minimumTopicCount}.`
        : "Do not add topics unless they are required to resolve one of the listed quality failures.";
    const repairModeInstruction =
      acceptedTopicCount === 0
        ? "The initial response contains no accepted topics. Rebuild the grounded topic list from the provided paper text using the complete original topic schema."
        : "Do not regenerate or rewrite accepted topics.";

    return runAnalysisRequest("targeted_quality_repair", initialModel, (signal) =>
      getOpenAI().chat.completions.create({
      model: initialModel,
      ...initialTokenLimit,
      messages: [
        {
          role: "system",
          content:
            `You repair an existing exam-analysis JSON. ${repairModeInstruction} Return JSON only. Every replacement or addition must include verbatim paper_question_evidence and complete non-empty study_note fields. If the papers do not support enough new topics, return fewer topics rather than padding.`,
        },
        {
          role: "user",
          content: `Course: ${params.classOrCourse || "Not specified"}; subject: ${params.subject}.
Required paper labels: ${yearsList}.

Only these deterministic checks failed:
${issues.map((issue) => `- ${issue}`).join("\n")}

${additionRequirement}

Paper text, for grounding only:
${paperContent}

Return ONLY this compact repair object:
{
  "replacements": [
    {
      "current_topic_name": "exact existing topic name",
      "topic": { "complete original topic schema with the corrected title or study note" }
    }
  ],
  "topics": ["only new complete topic objects required to fill the count shortfall"],
  "paper_summaries": [
    {
      "paper": "Paper 1",
      "summary": "corrected grounded summary",
      "question_count": 0,
      "distinctive_topics": ["specific topic"]
    }
  ],
  "overall_strategy_tip": "include only when its required Bas Pass Hona Hai: label is missing"
}

Do not include unchanged topics, related pairs, or any extra keys. For a five-paper summary failure, include the complete corrected paper_summaries array and preserve all valid summaries. Add only NEW, distinct topics with real quoted question evidence and complete study notes. Do not add filler to meet the topic minimum. Replace only the existing topics named by failed checks, retaining all other accepted topics.`,
        },
        { role: "assistant", content: previousJson },
        {
          role: "user",
          content:
            "Apply only the requested patch to the accepted analysis now. Return JSON only.",
        },
      ],
      response_format: { type: "json_object" },
      }, signal ? { signal } : undefined),
    );
  };

  const response = await makeRequest();

  const content = response.choices[0]?.message?.content;
  if (!content) {
    const choice = response.choices[0];
    throw new Error(
      `Empty AI response (finish_reason=${choice?.finish_reason ?? "unknown"}, refusal=${choice?.message?.refusal ? "yes" : "no"})`,
    );
  }
  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(content);
  } catch {
    throw new Error("AI response returned invalid JSON");
  }

  const normalizedEnvelope = normalizeInitialAnalysisEnvelope(
    parsedValue,
    params.subject,
    params.yearLabels,
  );
  let parsed = normalizedEnvelope.result;
  const normalizedInitialTopics = normalizeTopicListSchemaMetadata(
    parsed.topics,
    params.yearLabels,
  );
  parsed = {
    ...parsed,
    topics: normalizedInitialTopics.topics,
  };
  if (normalizedInitialTopics.recoveredCount > 0) {
    normalizedEnvelope.recoveryIssues.push(
      `Recovered missing non-grounding metadata for ${normalizedInitialTopics.recoveredCount} initial topic entries while preserving strict evidence and study-note validation.`,
    );
  }
  const initialTopicSchema = getSchemaIncompleteTopicCount(parsed);
  const canRecoverWithoutAcceptedTopics =
    !normalizedEnvelope.hadTopicsArray ||
    initialTopicSchema.total === 0 ||
    initialTopicSchema.incomplete === initialTopicSchema.total;
  let initialSchemaRecoveryIssue: string | undefined;
  try {
    validateAiAnalysisResult(parsed, params.yearLabels, params.papers, false);
  } catch (err) {
    if (
      !canRecoverWithoutAcceptedTopics ||
      !(err instanceof Error) ||
      !err.message.includes("did not include any usable topics")
    ) {
      throw err;
    }

    initialSchemaRecoveryIssue =
      initialTopicSchema.total > 0
        ? `The initial AI response returned ${initialTopicSchema.total} topic entries, but none matched the complete topic schema. A single grounded repair was requested.`
        : "The initial AI response did not contain any usable topic entries. A single grounded repair was requested.";
    parsed = { ...parsed, topics: [] };
    logger.warn(
      {
        analysisId: params.analysisId,
        initialTopicCount: initialTopicSchema.total,
        incompleteTopicCount: initialTopicSchema.incomplete,
        hadTopicsArray: normalizedEnvelope.hadTopicsArray,
      },
      "Initial AI response had no usable topics; attempting bounded recovery",
    );
  }

  let degraded =
    normalizedEnvelope.recoveryIssues.length > 0 ||
    Boolean(initialSchemaRecoveryIssue);
  const strictFivePaperQuality = params.yearLabels.length >= 4;
  let repairIssues = initialSchemaRecoveryIssue
    ? [initialSchemaRecoveryIssue]
    : getTopicQualityIssues(parsed, params.yearLabels.length);
  let qualityIssues = [
    ...normalizedEnvelope.recoveryIssues,
    ...repairIssues,
  ];
  try {
    if (repairIssues.length > 0) {
      logger.warn(
        { issues: repairIssues },
        "AI analysis failed topic-quality checks; requesting the single compact patch",
      );
      const patchResponse = await makeTargetedRepairRequest(
        content,
        repairIssues,
        parsed.topics.length,
      );
      const correctedContent = patchResponse.choices[0]?.message?.content ?? "";
      if (!correctedContent) {
        throw new Error("Empty AI response while applying the compact topic patch");
      }

      let repairPatch: unknown;
      try {
        repairPatch = JSON.parse(correctedContent);
      } catch {
        throw new Error("AI returned invalid JSON while applying the compact topic patch");
      }
      if (!repairPatch || typeof repairPatch !== "object") {
        throw new Error("AI did not return a usable compact topic patch");
      }

      const normalizedRepairPatch = normalizeRepairPatchSchemaMetadata(
        repairPatch as Record<string, unknown>,
        params.yearLabels,
      );
      if (normalizedRepairPatch.recoveredCount > 0) {
        normalizedEnvelope.recoveryIssues.push(
          `Recovered missing non-grounding metadata for ${normalizedRepairPatch.recoveredCount} repaired topic entries while preserving strict evidence and study-note validation.`,
        );
      }
      parsed = applyTopicRepairPatch(parsed, normalizedRepairPatch.patch);
      if (normalizedEnvelope.usedFallbackStrategy) {
        parsed.overall_strategy_tip = buildFallbackStrategy(parsed.topics);
      }
      validateAiAnalysisResult(parsed, params.yearLabels, params.papers, false);
      repairIssues = getTopicQualityIssues(parsed, params.yearLabels.length);
      qualityIssues = [
        ...normalizedEnvelope.recoveryIssues,
        ...(initialSchemaRecoveryIssue ? [initialSchemaRecoveryIssue] : []),
        ...repairIssues,
      ];
      if (repairIssues.length > 0) {
        const minimumTopicCount = getMinimumTopicCount(params.yearLabels.length);
        const catastrophicFloor = Math.ceil(minimumTopicCount * 0.3);
        if (parsed.topics.length < catastrophicFloor) {
          throw new Error(
            `Analysis quality too low to return: only ${parsed.topics.length} topics remained after repair, below the minimum acceptable floor of ${catastrophicFloor} (30% of the ${minimumTopicCount}-topic target for this ${params.yearLabels.length}-paper analysis). Issues: ${qualityIssues.slice(0, 3).join(" ")}`,
          );
        }
        degraded = true;
        logger.warn(
          { issues: qualityIssues, topicCount: parsed.topics.length },
          strictFivePaperQuality
            ? "Multi-paper compact topic patch still has quality issues; returning a degraded result"
            : "Compact topic patch completed; accepting the best parseable result with quality warnings",
        );
      }
    }
  } catch (err) {
    if (!(err instanceof AnalysisDeadlineExceededError)) throw err;
    if (initialSchemaRecoveryIssue && parsed.topics.length === 0) {
      throw new Error(
        "The initial AI response had no schema-valid topics and the bounded repair did not complete.",
      );
    }
    try {
      validateAiAnalysisResult(parsed, params.yearLabels, params.papers, false);
    } catch (validationError) {
      if (
        validationError instanceof Error &&
        validationError.message.includes(
          "no topics with verified paper evidence and study notes",
        )
      ) {
        throw new Error(
          "The initial AI response had no final usable topics and the bounded repair did not complete.",
        );
      }
      throw validationError;
    }
    degraded = true;
    qualityIssues = [
      ...normalizedEnvelope.recoveryIssues,
      ...(initialSchemaRecoveryIssue ? [initialSchemaRecoveryIssue] : []),
      ...getTopicQualityIssues(parsed, params.yearLabels.length),
    ];
    logger.warn(
      {
        analysisId: params.analysisId,
        topicCount: parsed.topics.length,
        qualityIssues,
      },
      strictFivePaperQuality
        ? "Multi-paper analysis deadline reached; returning the best schema-valid degraded result"
        : "Analysis deadline reached; returning the best schema-valid result",
    );
  }
  logger.info(
    {
      aiRequestCount: usage.length,
      topicCount: parsed.topics.length,
      usedQualityCorrection: usage.length > 1,
      degraded,
      qualityIssues,
      usage,
    },
    "AI analysis completed",
  );

  return {
    result: parsed,
    inputTokens: usage.reduce((sum, call) => sum + call.inputTokens, 0),
    outputTokens: usage.reduce((sum, call) => sum + call.outputTokens, 0),
    usage,
    degraded,
    qualityIssues,
  };
}
