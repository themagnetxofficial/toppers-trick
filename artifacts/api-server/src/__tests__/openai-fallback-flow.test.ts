import { beforeEach, describe, expect, it, vi } from "vitest";

const { createCompletion } = vi.hoisted(() => ({
  createCompletion: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: createCompletion,
      },
    };
  },
}));

import { analyzeWithAI, type AiAnalysisResult, type TopicResult } from "../lib/openai";

const papers = ["Paper 1", "Paper 2", "Paper 3", "Paper 4"];

function makeTopic(topicName: string): TopicResult {
  return {
    topic_name: topicName,
    priority: "Medium",
    frequency: 1,
    years_appeared: ["Paper 1"],
    confidence_level: "Medium",
    marks_weightage: "5 marks",
    question_type_breakdown: {
      mcq: "None",
      short: "1",
      long: "None",
      case_study: "None",
    },
    study_note: {
      kya_padhna_hai:
        "- Named definition\n- Named comparison\n- Named format\n- Applied scenario",
      kaise_poochha_jaata_hai: "Short answer mein poochha gaya.",
      repeat_pattern: "Ek paper mein dikha.",
    },
    paper_question_evidence: [
      { paper: "Paper 1", evidence: "Discuss named business communication concepts" },
    ],
    key_terms: ["named term"],
  };
}

function makeResult(topicCount: number): AiAnalysisResult {
  return {
    subject: "Business Communication",
    years_analyzed: papers,
    paper_summaries: [
      {
        paper: "Paper 1",
        summary: "Original accepted summary.",
        question_count: 4,
        distinctive_topics: ["Specific Topic 1"],
      },
    ],
    topics: Array.from({ length: topicCount }, (_, index) =>
      makeTopic(`Specific Topic ${index + 1}`),
    ),
    related_topic_pairs: ["Specific Topic 1 + Specific Topic 2"],
    overall_strategy_tip:
      "Bas Pass Hona Hai: Specific Topic 1 aur Specific Topic 2 padho.",
  };
}

function completion(content: unknown, totalTokens: number) {
  return {
    choices: [{ message: { content: JSON.stringify(content) } }],
    usage: {
      prompt_tokens: Math.floor(totalTokens / 2),
      completion_tokens: Math.ceil(totalTokens / 2),
      total_tokens: totalTokens,
    },
  };
}

async function runAnalysis(
  overrides: Partial<Parameters<typeof analyzeWithAI>[0]> = {},
) {
  return analyzeWithAI({
    analysisId: 123,
    category: "college",
    classOrCourse: "BBA",
    boardOrUniversity: "University",
    subject: "Business Communication",
    yearLabels: papers,
    papers: papers.map((label) => ({
      label,
      text:
        label === "Paper 2"
          ? "Paper 2: Define pledge. How does it differ from bailment?"
          : `${label}: Discuss named business communication concepts.`,
    })),
    extractedText: "Fallback text",
    ...overrides,
  });
}

describe("hard-capped compact repair flow", () => {
  beforeEach(() => {
    createCompletion.mockReset();
  });

  it("uses one compact patch to add missing topics and preserves accepted content", async () => {
    const initial = makeResult(13);
    const additions = [
      makeTopic("Specific Topic 1"),
      ...Array.from({ length: 5 }, (_, index) =>
        makeTopic(`Specific Topic ${index + 14}`),
      ),
    ];

    createCompletion
      .mockResolvedValueOnce(completion(initial, 100))
      .mockResolvedValueOnce(completion({ topics: additions }, 50));

    const output = await runAnalysis();

    expect(createCompletion).toHaveBeenCalledTimes(2);
    expect(output.usage.map((call) => call.operation)).toEqual([
      "initial",
      "targeted_quality_repair",
    ]);
    expect(output.result.topics).toHaveLength(18);
    expect(output.result.topics.map((topic) => topic.topic_name)).toContain(
      "Specific Topic 18",
    );
    expect(output.result.paper_summaries?.[0]?.summary).toBe(
      "Original accepted summary.",
    );
    expect(output.result.related_topic_pairs).toEqual([
      "Specific Topic 1 + Specific Topic 2",
    ]);

    const initialRequest = createCompletion.mock.calls[0][0];
    expect(initialRequest.messages[0].content).toContain(
      "scan every provided paper from beginning to end",
    );
    expect(initialRequest.messages[1].content).toContain(
      '"paper_question_evidence"',
    );

    const patchRequest = createCompletion.mock.calls[1][0];
    expect(patchRequest.model).toBe("gpt-4o-mini");
    expect(patchRequest.messages[1].content).toContain(
      "already has 13 valid topics",
    );
    expect(patchRequest.messages[1].content).toContain(
      "up to 5 NEW, distinct topic objects",
    );
  });

  it("drops fabricated or incomplete topics returned by the compact patch", async () => {
    const initial = makeResult(17);
    const fabricated = makeTopic("General subject knowledge");
    fabricated.paper_question_evidence = [
      { paper: "Paper 1", evidence: "This phrase is absent from every paper" },
    ];
    const incomplete = makeTopic("Topic with no notes");
    incomplete.study_note = {} as any;

    createCompletion
      .mockResolvedValueOnce(completion(initial, 100))
      .mockResolvedValueOnce(
        completion(
          {
            topics: [
              makeTopic("Genuine topic 18"),
              fabricated,
              incomplete,
            ],
          },
          50,
        ),
      );

    const output = await runAnalysis();

    expect(createCompletion).toHaveBeenCalledTimes(2);
    expect(output.result.topics.map((topic) => topic.topic_name)).toContain(
      "Genuine topic 18",
    );
    expect(output.result.topics.map((topic) => topic.topic_name)).not.toContain(
      "General subject knowledge",
    );
    expect(output.result.topics.map((topic) => topic.topic_name)).not.toContain(
      "Topic with no notes",
    );
    expect(output.result.topics).toHaveLength(18);
  });

  it("accepts the best parseable result after one patch even when quality issues remain", async () => {
    const initial = makeResult(13);

    createCompletion
      .mockResolvedValueOnce(completion(initial, 100))
      .mockResolvedValueOnce(completion({ topics: [] }, 50));

    const output = await runAnalysis();

    expect(createCompletion).toHaveBeenCalledTimes(2);
    expect(output.usage.map((call) => call.operation)).toEqual([
      "initial",
      "targeted_quality_repair",
    ]);
    expect(output.result.topics).toHaveLength(13);
    expect(output.qualityIssues).toContain(
      "Returned 13 topics, but this 4-paper analysis requires at least 18 granular topics.",
    );
    expect(output.result.paper_summaries?.[0]?.summary).toBe(
      "Original accepted summary.",
    );
  });

  it("does not repair uncovered paper-summary topics when simpler checks pass", async () => {
    const initial = makeResult(18);
    initial.paper_summaries![0]!.distinctive_topics = [
      "Specific Topic 1",
      "Consideration: Definition & Unlawful Cases",
    ];

    createCompletion.mockResolvedValueOnce(completion(initial, 100));

    const output = await runAnalysis();

    expect(output.result.topics).toHaveLength(18);
    expect(createCompletion).toHaveBeenCalledTimes(1);
  });

  it("returns the schema-valid baseline and stops repairs when the shared deadline expires", async () => {
    const initial = makeResult(13);
    createCompletion
      .mockResolvedValueOnce(completion(initial, 100))
      .mockImplementationOnce(
        (_request, options?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      );

    const output = await runAnalysis({ deadlineAt: Date.now() + 20 });

    expect(output.degraded).toBe(true);
    expect(output.result.topics).toHaveLength(13);
    expect(output.qualityIssues.length).toBeGreaterThan(0);
    expect(createCompletion).toHaveBeenCalledTimes(2);
  });

  it("reports failed calls with the exact exception even when no baseline exists", async () => {
    const calls: Array<{ status: string; errorMessage?: string | null }> = [];
    createCompletion.mockRejectedValue(new Error("provider connection reset"));

    await expect(
      runAnalysis({
        onCallComplete: (call) => {
          calls.push(call);
        },
      }),
    ).rejects.toThrow("provider connection reset");

    expect(calls).toHaveLength(1);
    expect(calls.every((call) => call.status === "failed")).toBe(true);
    expect(calls[0]?.errorMessage).toContain("provider connection reset");
  });

  it("does not spend a second call retrying malformed initial JSON", async () => {
    createCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: "{not valid json" } }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    });

    await expect(runAnalysis()).rejects.toThrow(
      "AI response returned invalid JSON",
    );
    expect(createCompletion).toHaveBeenCalledTimes(1);
  });

});