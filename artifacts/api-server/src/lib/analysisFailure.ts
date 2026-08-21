export type AnalysisFailureStage =
  | "file_missing"
  | "file_unavailable"
  | "text_extraction"
  | "ai_analysis"
  | "pdf_generation"
  | "persistence"
  | "unknown";

const USER_MESSAGES: Record<AnalysisFailureStage, string> = {
  file_missing:
    "The uploaded paper files could not be found on the analysis server. Please upload the papers again.",
  file_unavailable:
    "The uploaded paper files could not be accessed by the analysis server. Please upload the papers again.",
  text_extraction:
    "We could not read enough text from the uploaded papers. Please use clear, unlocked PDFs or images and try again.",
  ai_analysis:
    "The AI analysis service could not complete this request. Please try again shortly.",
  pdf_generation:
    "Your papers were analyzed, but we could not create the study guide PDF. Please try again.",
  persistence:
    "We could not save the analysis result. Please try again.",
  unknown:
    "Analysis could not be completed. Please try again.",
};

const REFUND_PENDING_SUFFIX = " We are restoring any deducted credit.";
const REFUND_CONFIRMED_SUFFIX = " Your credit has been refunded.";
const REFUND_UNCONFIRMED_SUFFIX =
  " We could not confirm whether a deducted credit was refunded. Please check your credit balance before trying again.";
const TEMPORARY_OCR_DIAGNOSTIC_PREFIX = "[Temporary OCR diagnostic]";
const MAX_DIAGNOSTIC_LENGTH = 12_000;

export type RefundState = "pending" | "confirmed" | "unconfirmed";

export class AnalysisProcessingError extends Error {
  constructor(
    readonly stage: AnalysisFailureStage,
    message: string,
  ) {
    super(message);
    this.name = "AnalysisProcessingError";
  }
}

export function getAnalysisFailureMessage(stage: AnalysisFailureStage): string {
  return USER_MESSAGES[stage];
}

export function getAnalysisFailureMessageWithRefund(
  stage: AnalysisFailureStage,
  refundState: RefundState,
): string {
  return `${getAnalysisFailureMessage(stage)}${getRefundSuffix(refundState)}`;
}

function getRefundSuffix(refundState: RefundState): string {
  return refundState === "confirmed"
    ? REFUND_CONFIRMED_SUFFIX
    : refundState === "unconfirmed"
      ? REFUND_UNCONFIRMED_SUFFIX
      : REFUND_PENDING_SUFFIX;
}

function formatTechnicalError(error: unknown, seen = new Set<unknown>()): string {
  if (error && typeof error === "object") {
    if (seen.has(error)) return "[Circular error cause]";
    seen.add(error);
  }

  if (error instanceof Error) {
    const cause =
      "cause" in error && error.cause !== undefined
        ? `\n\nCaused by:\n${formatTechnicalError(error.cause, seen)}`
        : "";
    return `${error.name}: ${error.message}${error.stack ? `\n\nStack:\n${error.stack}` : ""}${cause}`;
  }

  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

/**
 * Temporary, deliberately detailed diagnostic for Hostinger OCR debugging.
 * It is only used for unexpected text-extraction exceptions and is returned
 * to the analysis owner by the allowlist below. Remove after the deployment
 * runtime problem has been identified.
 */
export function getTemporaryOcrDiagnosticMessage(
  error: unknown,
  refundState: RefundState,
): string {
  const message = [
    TEMPORARY_OCR_DIAGNOSTIC_PREFIX,
    "Stage: text extraction",
    `Credit status:${getRefundSuffix(refundState)}`,
    "",
    formatTechnicalError(error),
  ].join("\n");

  return message.slice(0, MAX_DIAGNOSTIC_LENGTH);
}

/**
 * Only return persisted failure messages that were created by this module.
 * Older rows may contain raw dependency errors and must remain private. The
 * temporary OCR diagnostic marker is an intentional, narrow exception while
 * diagnosing the Hostinger runtime environment.
 */
export function isSafeAnalysisFailureMessage(message: unknown): message is string {
  if (typeof message !== "string") return false;

  return Object.values(USER_MESSAGES).some(
    (base) =>
      message === base ||
      message === `${base}${REFUND_PENDING_SUFFIX}` ||
      message === `${base}${REFUND_CONFIRMED_SUFFIX}` ||
      message === `${base}${REFUND_UNCONFIRMED_SUFFIX}`,
  );
}

export function isTemporaryOcrDiagnosticMessage(message: unknown): message is string {
  return typeof message === "string" && message.startsWith(TEMPORARY_OCR_DIAGNOSTIC_PREFIX);
}