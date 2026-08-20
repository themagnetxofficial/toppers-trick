import { describe, expect, it } from "vitest";
import {
  getAnalysisFailureMessage,
  getAnalysisFailureMessageWithRefund,
  isSafeAnalysisFailureMessage,
} from "../lib/analysisFailure";

describe("analysis failure messages", () => {
  it("explains when a background job cannot find its uploaded files", () => {
    expect(getAnalysisFailureMessage("file_missing")).toMatch(/could not be found/i);
    expect(getAnalysisFailureMessage("file_missing")).not.toMatch(/refunded/i);
  });

  it("keeps extraction and AI failures distinct for students", () => {
    expect(getAnalysisFailureMessage("text_extraction")).toMatch(/read enough text/i);
    expect(getAnalysisFailureMessage("ai_analysis")).toMatch(/AI analysis service/i);
  });

  it("only confirms a refund after it has completed", () => {
    const pending = getAnalysisFailureMessageWithRefund("file_missing", "pending");
    const confirmed = getAnalysisFailureMessageWithRefund("file_missing", "confirmed");
    const refundUnconfirmed = getAnalysisFailureMessageWithRefund("file_missing", "unconfirmed");

    expect(pending).toMatch(/restoring/i);
    expect(pending).not.toMatch(/has been refunded/i);
    expect(confirmed).toMatch(/has been refunded/i);
    expect(refundUnconfirmed).toMatch(/could not confirm/i);
    expect(refundUnconfirmed).not.toMatch(/has been refunded/i);
    expect(isSafeAnalysisFailureMessage(confirmed)).toBe(true);
    expect(isSafeAnalysisFailureMessage("OpenAI rate limit exceeded: 429")).toBe(false);
  });
});