import { describe, expect, it } from "vitest";
import { buildPaperPromptContent, validateAiAnalysisResult } from "../lib/openai";

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

  it("keeps every uploaded paper in its own AI input block", () => {
    const content = buildPaperPromptContent(
      [
        { label: "Paper 1", text: "Question from the first exam" },
        { label: "Paper 2", text: "Question from the second exam" },
        { label: "Paper 3", text: "Question from the third exam" },
      ],
      "",
      ["Paper 1", "Paper 2", "Paper 3"],
    );

    expect(content).toContain("Paper 1");
    expect(content).toContain("Question from the second exam");
    expect(content).toContain("Question from the third exam");
    expect(content.match(/complete paper kept separate/g)).toHaveLength(3);
  });

  it("always reports all uploaded papers even if the model omits one", () => {
    const result = {
      subject: "Marketing",
      years_analyzed: ["Paper 1"],
      topics: [
        {
          topic_name: "Market segmentation",
          years_appeared: ["Paper 1", "Not an uploaded paper"],
        },
      ],
      related_topic_pairs: [],
      overall_strategy_tip: "Focus on core concepts.",
    } as unknown as Parameters<typeof validateAiAnalysisResult>[0];

    validateAiAnalysisResult(result, ["Paper 1", "Paper 2", "Paper 3"]);

    expect(result.years_analyzed).toEqual(["Paper 1", "Paper 2", "Paper 3"]);
    expect(result.topics[0].years_appeared).toEqual(["Paper 1"]);
  });
});