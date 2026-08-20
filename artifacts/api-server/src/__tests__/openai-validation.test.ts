import { describe, expect, it } from "vitest";
import { validateAiAnalysisResult } from "../lib/openai";

describe("validateAiAnalysisResult", () => {
  it("rejects a response with no usable topics", () => {
    expect(() =>
      validateAiAnalysisResult(
        {
          subject: "Marketing",
          years_analyzed: ["Paper 1"],
          topics: [],
          related_topic_pairs: [],
          overall_strategy_tip: "Focus on core concepts.",
        },
        ["Paper 1"],
      ),
    ).toThrow("did not include any usable topics");
  });

  it("normalizes optional arrays and keeps a usable topic", () => {
    const result = {
      subject: "Marketing",
      years_analyzed: undefined,
      topics: [{ topic_name: "Market segmentation" }],
      related_topic_pairs: undefined,
      overall_strategy_tip: "Focus on core concepts.",
    } as unknown as Parameters<typeof validateAiAnalysisResult>[0];

    validateAiAnalysisResult(result, ["Paper 1"]);

    expect(result.years_analyzed).toEqual(["Paper 1"]);
    expect(result.related_topic_pairs).toEqual([]);
    expect(result.topics).toHaveLength(1);
  });
});