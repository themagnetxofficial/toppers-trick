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

function makeFivePaperResult(topicCount: number): AiAnalysisResult {
  const fivePapers = ["Paper 1", "Paper 2", "Paper 3", "Paper 4", "Paper 5"];
  const topics = Array.from({ length: topicCount }, (_, index) => {
    const paper = fivePapers[index % fivePapers.length]!;
    const topic = makeTopic(`Specific Biology Topic ${index + 1}`);
    topic.years_appeared = [paper];
    topic.paper_question_evidence = [
      { paper, evidence: "Explain the named Biology process" },
    ];
    return topic;
  });
  return {
    subject: "Biology",
    years_analyzed: fivePapers,
    paper_summaries: fivePapers.map((paper) => ({
      paper,
      summary: `${paper} tests named Biology processes with application questions.`,
      question_count: 20,
      distinctive_topics: [
        topics.find((topic) => topic.years_appeared.includes(paper))!.topic_name,
      ],
    })),
    topics,
    related_topic_pairs: [],
    overall_strategy_tip:
      "Bas Pass Hona Hai: Specific Biology Topic 1 aur Specific Biology Topic 2 padho.",
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
    expect(initialRequest.messages[0].content).toContain(
      "Hindi and English are translations of the same numbered question",
    );
    expect(initialRequest.messages[0].content).toContain(
      "count them as ONE logical question",
    );
    expect(initialRequest.messages[1].content).toContain(
      '"paper_question_evidence"',
    );

    const patchRequest = createCompletion.mock.calls[1][0];
    expect(patchRequest.model).toBe("gpt-5-mini");
    expect(patchRequest.max_completion_tokens).toBe(28000);
    expect(patchRequest.reasoning_effort).toBe("low");
    expect(patchRequest.max_tokens).toBeUndefined();
    expect(patchRequest.messages[1].content).toContain(
      "already has 13 valid topics",
    );
    expect(patchRequest.messages[1].content).toContain(
      "up to 5 NEW, distinct topic objects",
    );
  });

  it("keeps non-empty weak notes after repair but excludes genuinely empty notes", async () => {
    const initial = makeResult(19);
    initial.topics[17]!.study_note.kya_padhna_hai =
      "- Named definition\n- Named comparison\n- Applied scenario";
    initial.topics[18]!.study_note.kya_padhna_hai = "";

    createCompletion
      .mockResolvedValueOnce(completion(initial, 100))
      .mockResolvedValueOnce(completion({ topics: [] }, 50));

    const output = await runAnalysis();

    expect(createCompletion).toHaveBeenCalledTimes(2);
    const repairRequest = createCompletion.mock.calls[1]![0];
    expect(repairRequest.messages[1].content).toContain(
      '"Specific Topic 18" has 3 kya_padhna_hai bullets (needs 4-6).',
    );
    expect(output.result.topics).toHaveLength(18);
    expect(output.result.topics.map((topic) => topic.topic_name)).toContain(
      "Specific Topic 18",
    );
    expect(output.result.topics.map((topic) => topic.topic_name)).not.toContain(
      "Specific Topic 19",
    );
    expect(output.qualityIssues).toContain(
      '"Specific Topic 18" has 3 kya_padhna_hai bullets (needs 4-6).',
    );
  });

  it("uses the single compact repair when every initial topic is structurally incomplete", async () => {
    const initial = makeResult(3);
    for (const topic of initial.topics) {
      topic.study_note = {} as TopicResult["study_note"];
    }
    const recoveredTopic = makeTopic("Recovered grounded topic");
    const recoveredTopics = [
      recoveredTopic,
      ...Array.from({ length: 5 }, (_, index) =>
        makeTopic(`Recovered grounded topic ${index + 2}`),
      ),
    ];

    createCompletion
      .mockResolvedValueOnce(completion(initial, 100))
      .mockResolvedValueOnce(completion({ topics: recoveredTopics }, 50));

    const output = await runAnalysis();

    expect(createCompletion).toHaveBeenCalledTimes(2);
    expect(output.result.topics).toHaveLength(6);
    expect(output.result.topics[0]).toEqual(recoveredTopic);
    expect(output.degraded).toBe(true);
    expect(output.qualityIssues).toContain(
      "The initial AI response returned 3 topic entries, but none matched the complete topic schema. A single grounded repair was requested.",
    );
    expect(createCompletion.mock.calls[1]![0].messages[0].content).toContain(
      "initial response contains no accepted topics",
    );
    expect(createCompletion.mock.calls[1]![0].messages[1].content).toContain(
      "No topics from the initial response were accepted",
    );
  });

  it("recovers missing non-grounding metadata without discarding grounded initial topics", async () => {
    const initial = makeResult(18);
    for (const topic of initial.topics) {
      delete (topic as Partial<TopicResult>).question_type_breakdown;
      delete (topic as Partial<TopicResult>).key_terms;
      delete (topic as Partial<TopicResult>).marks_weightage;
    }
    createCompletion.mockResolvedValueOnce(completion(initial, 100));

    const output = await runAnalysis();

    expect(createCompletion).toHaveBeenCalledTimes(1);
    expect(output.result.topics).toHaveLength(18);
    expect(output.result.topics[0]?.question_type_breakdown).toEqual({
      mcq: "Not specified",
      short: "Not specified",
      long: "Not specified",
      case_study: "Not specified",
    });
    expect(output.result.topics[0]?.key_terms).toEqual([]);
    expect(output.result.topics[0]?.marks_weightage).toBe("Not specified");
    expect(output.degraded).toBe(true);
    expect(output.qualityIssues).toContain(
      "Recovered missing non-grounding metadata for 18 initial topic entries while preserving strict evidence and study-note validation.",
    );
  });

  it("recovers missing non-grounding metadata from the single repair response", async () => {
    const initial = makeResult(2);
    for (const topic of initial.topics) {
      topic.study_note = {} as TopicResult["study_note"];
    }
    const repairedTopic = makeTopic("Recovered repair topic");
    delete (repairedTopic as Partial<TopicResult>).question_type_breakdown;
    delete (repairedTopic as Partial<TopicResult>).key_terms;
    const repairedTopics = [
      repairedTopic,
      ...Array.from({ length: 5 }, (_, index) =>
        makeTopic(`Recovered repair topic ${index + 2}`),
      ),
    ];

    createCompletion
      .mockResolvedValueOnce(completion(initial, 100))
      .mockResolvedValueOnce(completion({ topics: repairedTopics }, 50));

    const output = await runAnalysis();

    expect(createCompletion).toHaveBeenCalledTimes(2);
    expect(output.result.topics).toHaveLength(6);
    expect(output.result.topics[0]?.topic_name).toBe("Recovered repair topic");
    expect(output.result.topics[0]?.question_type_breakdown.mcq).toBe(
      "Not specified",
    );
    expect(output.result.topics[0]?.key_terms).toEqual([]);
    expect(output.qualityIssues).toContain(
      "Recovered missing non-grounding metadata for 1 repaired topic entries while preserving strict evidence and study-note validation.",
    );
  });

  it("normalizes omitted top-level metadata without rejecting valid grounded topics", async () => {
    const initial = makeResult(18);
    delete (initial as Partial<AiAnalysisResult>).subject;
    delete (initial as Partial<AiAnalysisResult>).overall_strategy_tip;
    createCompletion.mockResolvedValueOnce(completion(initial, 100));

    const output = await runAnalysis();

    expect(createCompletion).toHaveBeenCalledTimes(1);
    expect(output.result.subject).toBe("Business Communication");
    expect(output.result.overall_strategy_tip).toContain("Bas Pass Hona Hai:");
    expect(output.result.overall_strategy_tip).toContain("Specific Topic 1");
    expect(output.result.topics).toHaveLength(18);
    expect(output.degraded).toBe(true);
    expect(output.qualityIssues).toContain(
      "The AI omitted the subject label, so the submitted subject was restored.",
    );
    expect(output.qualityIssues).toContain(
      "The AI omitted the overall strategy, so a safe strategy was rebuilt from its grounded topic names.",
    );
  });

  it("uses the single grounded repair when the initial topic array is omitted", async () => {
    const initial = makeResult(1) as Partial<AiAnalysisResult>;
    delete initial.topics;
    const recoveredTopic = makeTopic("Recovered missing-array topic");
    const recoveredTopics = [
      recoveredTopic,
      ...Array.from({ length: 5 }, (_, index) =>
        makeTopic(`Recovered missing-array topic ${index + 2}`),
      ),
    ];

    createCompletion
      .mockResolvedValueOnce(completion(initial, 100))
      .mockResolvedValueOnce(completion({ topics: recoveredTopics }, 50));

    const output = await runAnalysis();

    expect(createCompletion).toHaveBeenCalledTimes(2);
    expect(output.result.topics).toHaveLength(6);
    expect(output.result.topics[0]).toEqual(recoveredTopic);
    expect(output.degraded).toBe(true);
    expect(output.qualityIssues).toContain(
      "The initial AI response omitted its topic array, so one bounded grounded repair was requested.",
    );
    expect(output.qualityIssues).toContain(
      "The initial AI response did not contain any usable topic entries. A single grounded repair was requested.",
    );
  });

  it("fails clearly after bounded recovery cannot produce a schema-valid topic", async () => {
    const initial = makeResult(2);
    for (const topic of initial.topics) {
      topic.study_note = {} as TopicResult["study_note"];
    }

    createCompletion
      .mockResolvedValueOnce(completion(initial, 100))
      .mockResolvedValueOnce(completion({ topics: [] }, 50));

    await expect(runAnalysis()).rejects.toThrow("did not include any usable topics");
    expect(createCompletion).toHaveBeenCalledTimes(2);
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

  it("does not retain compact-patch topics missing grounded study content", async () => {
    const initial = makeResult(17);
    const incomplete = {
      topic_name: "Incomplete compact-patch topic",
      years_appeared: ["Paper 1"],
      study_note: {
        kya_padhna_hai:
          "- Named definition\n- Named comparison\n- Named format\n- Applied scenario",
        kaise_poochha_jaata_hai: "Short answer mein poochha gaya.",
      },
      paper_question_evidence: [
        { paper: "Paper 1", evidence: "Discuss named compact patch topic" },
      ],
    };

    createCompletion
      .mockResolvedValueOnce(completion(initial, 100))
      .mockResolvedValueOnce(completion({ topics: [incomplete] }, 50));

    const output = await runAnalysis();

    expect(createCompletion).toHaveBeenCalledTimes(2);
    expect(output.result.topics).toHaveLength(17);
    expect(output.result.topics.map((topic) => topic.topic_name)).not.toContain(
      "Incomplete compact-patch topic",
    );
    expect(output.degraded).toBe(true);
  });

  it("accepts the best parseable result after one patch even when quality issues remain", async () => {
    const initial = makeResult(8);

    createCompletion
      .mockResolvedValueOnce(completion(initial, 100))
      .mockResolvedValueOnce(completion({ topics: [] }, 50));

    const output = await runAnalysis({
      yearLabels: ["Paper 1", "Paper 2", "Paper 3"],
      papers: ["Paper 1", "Paper 2", "Paper 3"].map((label) => ({
        label,
        text: `${label}: Discuss named business communication concepts.`,
      })),
    });

    expect(createCompletion).toHaveBeenCalledTimes(2);
    expect(output.usage.map((call) => call.operation)).toEqual([
      "initial",
      "targeted_quality_repair",
    ]);
    expect(output.result.topics).toHaveLength(8);
    expect(output.qualityIssues).toContain(
      "Returned 8 topics, but this 3-paper analysis requires at least 12 granular topics.",
    );
    expect(output.result.paper_summaries?.[0]?.summary).toBe(
      "Original accepted summary.",
    );
  });

  it("uses the stronger model and accepts a complete five-paper Biology result", async () => {
    const fivePapers = ["Paper 1", "Paper 2", "Paper 3", "Paper 4", "Paper 5"];
    createCompletion.mockResolvedValueOnce(completion(makeFivePaperResult(18), 120));

    const output = await runAnalysis({
      subject: "Biology",
      yearLabels: fivePapers,
      papers: fivePapers.map((label) => ({
        label,
        text: `${label}: Explain the named Biology process in detail.`,
      })),
    });

    expect(output.qualityIssues).toEqual([]);
    expect(output.result.paper_summaries).toHaveLength(5);
    expect(createCompletion).toHaveBeenCalledTimes(1);
    expect(createCompletion.mock.calls[0]![0].model).toBe("gpt-5-mini");
    expect(createCompletion.mock.calls[0]![0].messages[1].content).toContain(
      "Biology-specific guardrail",
    );
  });

  it("throws when compact repair leaves topics below the catastrophic quality floor", async () => {
    createCompletion
      .mockResolvedValueOnce(completion(makeResult(5), 100))
      .mockResolvedValueOnce(completion({ topics: [] }, 50));

    await expect(runAnalysis()).rejects.toThrow(
      "only 5 topics remained after repair, below the minimum acceptable floor of 6",
    );
    expect(createCompletion).toHaveBeenCalledTimes(2);
  });

  it("accepts the exact catastrophic floor as a degraded result", async () => {
    createCompletion
      .mockResolvedValueOnce(completion(makeResult(5), 100))
      .mockResolvedValueOnce(
        completion({ topics: [makeTopic("Specific Topic 6")] }, 50),
      );

    const output = await runAnalysis();

    expect(output.result.topics).toHaveLength(6);
    expect(output.degraded).toBe(true);
    expect(output.qualityIssues).toContain(
      "Returned 6 topics, but this 4-paper analysis requires at least 18 granular topics.",
    );
    expect(createCompletion).toHaveBeenCalledTimes(2);
  });

  it("returns a degraded four-paper result instead of failing after an incomplete repair", async () => {
    const fourPapers = ["Paper 1", "Paper 2", "Paper 3", "Paper 4"];
    createCompletion
      .mockResolvedValueOnce(completion(makeResult(13), 100))
      .mockResolvedValueOnce(completion({ topics: [] }, 50));

    const output = await runAnalysis({
      yearLabels: fourPapers,
      papers: fourPapers.map((label) => ({
        label,
        text: `${label}: Discuss named business communication concepts.`,
      })),
    });

    expect(createCompletion).toHaveBeenCalledTimes(2);
    expect(createCompletion.mock.calls[0]![0].model).toBe("gpt-5-mini");
    expect(output.degraded).toBe(true);
    expect(output.result.topics).toHaveLength(13);
    expect(output.qualityIssues).toContain(
      "Returned 13 topics, but this 4-paper analysis requires at least 18 granular topics.",
    );
  });

  it("returns a degraded five-paper result when the compact repair remains incomplete", async () => {
    const fivePapers = ["Paper 1", "Paper 2", "Paper 3", "Paper 4", "Paper 5"];
    createCompletion
      .mockResolvedValueOnce(completion(makeFivePaperResult(13), 100))
      .mockResolvedValueOnce(completion({ topics: [] }, 50));

    const output = await runAnalysis({
      subject: "Biology",
      yearLabels: fivePapers,
      papers: fivePapers.map((label) => ({
        label,
        text: `${label}: Explain the named Biology process in detail.`,
      })),
    });

    expect(createCompletion).toHaveBeenCalledTimes(2);
    expect(createCompletion.mock.calls[1]![0].model).toBe("gpt-5-mini");
    expect(createCompletion.mock.calls[1]![0].max_completion_tokens).toBe(28000);
    expect(createCompletion.mock.calls[1]![0].reasoning_effort).toBe("low");
    expect(output.degraded).toBe(true);
    expect(output.qualityIssues.length).toBeGreaterThan(0);
  });

  it("repairs when a paper summary names an uncovered distinctive topic", async () => {
    const initial = makeResult(18);
    initial.paper_summaries![0]!.distinctive_topics = [
      "Specific Topic 1",
      "Consideration: Definition & Unlawful Cases",
    ];

    createCompletion
      .mockResolvedValueOnce(completion(initial, 100))
      .mockResolvedValueOnce(
        completion({ topics: [makeTopic("Consideration: Definition & Unlawful Cases")] }, 50),
      );

    const output = await runAnalysis();

    expect(output.result.topics).toHaveLength(19);
    expect(createCompletion).toHaveBeenCalledTimes(2);
    expect(output.result.topics.map((topic) => topic.topic_name)).toContain(
      "Consideration: Definition & Unlawful Cases",
    );
  });

  it("returns the schema-valid baseline and stops repairs when the shared deadline expires", async () => {
    const initial = makeResult(8);
    initial.topics[7]!.study_note.kya_padhna_hai =
      "- Named definition\n- Named comparison\n- Applied scenario";
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

    const output = await runAnalysis({
      yearLabels: ["Paper 1", "Paper 2", "Paper 3"],
      papers: ["Paper 1", "Paper 2", "Paper 3"].map((label) => ({
        label,
        text: `${label}: Discuss named business communication concepts.`,
      })),
      deadlineAt: Date.now() + 20,
    });

    expect(output.degraded).toBe(true);
    expect(output.result.topics).toHaveLength(8);
    expect(output.result.topics.map((topic) => topic.topic_name)).toContain(
      "Specific Topic 8",
    );
    expect(output.qualityIssues).toContain(
      '"Specific Topic 8" has 3 kya_padhna_hai bullets (needs 4-6).',
    );
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