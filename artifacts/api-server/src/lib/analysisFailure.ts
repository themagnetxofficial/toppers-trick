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
  const suffix =
    refundState === "confirmed"
      ? REFUND_CONFIRMED_SUFFIX
      : refundState === "unconfirmed"
        ? REFUND_UNCONFIRMED_SUFFIX
        : REFUND_PENDING_SUFFIX;
  return `${getAnalysisFailureMessage(stage)}${suffix}`;
}

/**
 * Only return persisted failure messages that were created by this module.
 * Older rows may contain raw dependency errors and must remain private.
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