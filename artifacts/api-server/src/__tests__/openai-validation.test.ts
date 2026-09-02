import { describe, expect, it } from "vitest";
import {
  applyTopicRepairPatch,
  buildPaperPromptContent,
  getAnalysisModelForPaperCount,
  getTopicQualityIssues,
  limitPaperForPrompt,
  MAX_CHARS_PER_PAPER,
  mergeAdditionalTopics,
  PaperInputTooLargeError,
  validateAiAnalysisResult,
} from "../lib/openai";

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
      topics: [
        {
          topic_name: "Market segmentation",
          priority: "Low",
          frequency: 1,
          years_appeared: ["Paper 1"],
          confidence_level: "Low",
          marks_weightage: "5 marks",
          question_type_breakdown: {
            mcq: "None",
            short: "1",
            long: "None",
            case_study: "None",
          },
          study_note: {
            kya_padhna_hai: "- Segmentation bases\n- Demographic variables\n- Geographic variables\n- Behavioral variables",
            kaise_poochha_jaata_hai: "Short answer mein poochha gaya.",
            repeat_pattern: "Paper 1 mein dikha.",
          },
          paper_question_evidence: [
            { paper: "Paper 1", evidence: "Define market segmentation" },
          ],
          key_terms: ["market segmentation"],
        },
      ],
      related_topic_pairs: undefined,
      overall_strategy_tip: "Focus on core concepts.",
    } as unknown as Parameters<typeof validateAiAnalysisResult>[0];

    validateAiAnalysisResult(result, ["Paper 1"]);

    expect(result.years_analyzed).toEqual(["Paper 1"]);
    expect(result.related_topic_pairs).toEqual([]);
    expect(result.topics).toHaveLength(1);
  });

  it("removes topics with incomplete fields before they can be persisted", () => {
    const result = {
      subject: "Marketing",
      years_analyzed: ["Paper 1"],
      topics: [
        {
          topic_name: "Incomplete topic",
          study_note: {
            kya_padhna_hai: "- One\n- Two\n- Three\n- Four",
            kaise_poochha_jaata_hai: "Short answer mein poochha gaya.",
            repeat_pattern: "Ek paper mein dikha.",
          },
          paper_question_evidence: [
            { paper: "Paper 1", evidence: "Define incomplete topic" },
          ],
        },
      ],
      related_topic_pairs: [],
      overall_strategy_tip: "Focus on core concepts.",
    } as unknown as Parameters<typeof validateAiAnalysisResult>[0];

    expect(() => validateAiAnalysisResult(result, ["Paper 1"])).toThrow(
      "did not include any usable topics",
    );
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

  it("keeps all five uploaded papers visible to synthesis", () => {
    const labels = ["Paper 1", "Paper 2", "Paper 3", "Paper 4", "Paper 5"];
    const content = buildPaperPromptContent(
      labels.map((label) => ({
        label,
        text: `${label}: Biology question with unique evidence`,
      })),
      "",
      labels,
    );

    for (const label of labels) {
      expect(content).toContain(`--- ${label} (complete paper kept separate) ---`);
    }
    expect(content.match(/complete paper kept separate/g)).toHaveLength(5);
  });

  it("keeps the middle and final OCR pages when building a long complete-paper block", () => {
    const content = buildPaperPromptContent(
      [
        {
          label: "Paper 1",
          text: [
            "--- OCR page 1: paper.pdf, page 1 ---",
            "Opening question",
            `--- OCR page 16: paper.pdf, page 16 ---`,
            "Middle case-study question with unique evidence",
            `--- OCR page 31: paper.pdf, page 31 ---`,
            "Final question",
          ].join("\n"),
        },
      ],
      "",
      ["Paper 1"],
    );

    expect(content).toContain("OCR page 1");
    expect(content).toContain("Middle case-study question with unique evidence");
    expect(content).toContain("OCR page 31");
    expect(content).toContain("Final question");
  });

  it("fails instead of silently cutting an oversized paper", () => {
    expect(() =>
      limitPaperForPrompt("x".repeat(MAX_CHARS_PER_PAPER + 1), "Paper 1"),
    ).toThrow(PaperInputTooLargeError);
    expect(() =>
      limitPaperForPrompt("x".repeat(MAX_CHARS_PER_PAPER + 1), "Paper 1"),
    ).toThrow(/No partial analysis was attempted/);
  });

  it("always reports all uploaded papers even if the model omits one", () => {
    const result = {
      subject: "Marketing",
      years_analyzed: ["Paper 1"],
      topics: [
        {
          topic_name: "Market segmentation",
          priority: "Low",
          frequency: 1,
          years_appeared: ["Paper 1", "Not an uploaded paper"],
          confidence_level: "Low",
          marks_weightage: "5 marks",
          question_type_breakdown: {
            mcq: "None",
            short: "1",
            long: "None",
            case_study: "None",
          },
          study_note: {
            kya_padhna_hai: "- Segmentation bases\n- Demographic variables\n- Geographic variables\n- Behavioral variables",
            kaise_poochha_jaata_hai: "Short answer mein poochha gaya.",
            repeat_pattern: "Paper 1 mein dikha.",
          },
          paper_question_evidence: [
            { paper: "Paper 1", evidence: "Define market segmentation" },
          ],
          key_terms: ["market segmentation"],
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

describe("incremental topic correction helpers", () => {
  const makeTopic = (topic_name: string) =>
    ({
      topic_name,
      priority: "Low",
      frequency: 1,
      years_appeared: ["Paper 1"],
      confidence_level: "Low",
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
    }) as any;

  it("keeps only distinct additions when incrementally filling a topic shortfall", () => {
    const merged = mergeAdditionalTopics(
      [makeTopic("Meeting Agenda")],
      [
        makeTopic("meeting-agenda"),
        makeTopic("Minutes of Meeting: Format and Resolution Recording"),
        makeTopic("Minutes of Meeting: Format and Resolution Recording"),
      ],
    );

    expect(merged.map((topic) => topic.topic_name)).toEqual([
      "Meeting Agenda",
      "Minutes of Meeting: Format and Resolution Recording",
    ]);
  });

  it("still flags the merged result for stronger fallback when additions are insufficient", () => {
    const result = {
      subject: "Business Communication",
      years_analyzed: ["Paper 1", "Paper 2", "Paper 3", "Paper 4"],
      topics: Array.from({ length: 17 }, (_, index) =>
        makeTopic(`Specific topic ${index + 1}`),
      ),
      related_topic_pairs: [],
      overall_strategy_tip: "Bas Pass Hona Hai: Specific topic 1 aur Specific topic 2 padho.",
    } as any;

    expect(getTopicQualityIssues(result, 4)).toContain(
      "Returned 17 topics, but this 4-paper analysis requires at least 18 granular topics.",
    );
  });

  it("uses the stronger synthesis model for five-paper runs", () => {
    expect(getAnalysisModelForPaperCount(4)).toBe("gpt-5-mini");
    expect(getAnalysisModelForPaperCount(5)).toBe("gpt-5-mini");
  });

  it("flags broad titles that end in generic labels even when the subject differs", () => {
    const result = {
      subject: "Business Communication",
      years_analyzed: ["Paper 1", "Paper 2", "Paper 3", "Paper 4"],
      topics: [
        makeTopic("Business Letter Overview"),
        makeTopic("Email Definition"),
        makeTopic("Business Letter Types and Purposes"),
      ],
      related_topic_pairs: [],
      overall_strategy_tip: "Bas Pass Hona Hai: Business Letter Types and Purposes padho.",
    } as any;

    expect(getTopicQualityIssues(result, 4)).toContain(
      'These topic names are vague rather than exam-usable: "Business Letter Overview", "Email Definition".',
    );
  });

  it("treats broad Biology chapter names and filler bullets as quality failures", () => {
    const broadBiologyTopic = makeTopic("Genetics");
    broadBiologyTopic.study_note.kya_padhna_hai =
      "- Examples\n- Importance\n- Common challenges\n- Real-world use cases";
    const result = {
      subject: "Biology",
      years_analyzed: ["Paper 1", "Paper 2", "Paper 3", "Paper 4", "Paper 5"],
      topics: [
        broadBiologyTopic,
        ...Array.from({ length: 17 }, (_, index) =>
          makeTopic(`Specific Biology Topic ${index + 2}`),
        ),
      ],
      related_topic_pairs: [],
      overall_strategy_tip:
        "Bas Pass Hona Hai: Specific Biology Topic 2 padho.",
    } as any;

    const issues = getTopicQualityIssues(result, 5);
    expect(issues).toContain(
      'These topic names are vague rather than exam-usable: "Genetics".',
    );
    expect(issues.some((issue) => issue.includes("generic study bullets"))).toBe(true);
  });

  it("requires five-paper summaries and grounded topic evidence from every paper", () => {
    const result = {
      subject: "Biology",
      years_analyzed: ["Paper 1", "Paper 2", "Paper 3", "Paper 4", "Paper 5"],
      paper_summaries: [
        {
          paper: "Paper 1",
          summary: "This paper tests detailed Biology concepts and applications.",
          question_count: 20,
          distinctive_topics: ["Specific Biology Topic 1"],
        },
      ],
      topics: Array.from({ length: 18 }, (_, index) =>
        makeTopic(`Specific Biology Topic ${index + 1}`),
      ),
      related_topic_pairs: [],
      overall_strategy_tip:
        "Bas Pass Hona Hai: Specific Biology Topic 1 padho.",
    } as any;

    const issues = getTopicQualityIssues(result, 5);
    expect(issues.some((issue) => issue.includes("Paper 2, Paper 3, Paper 4, Paper 5"))).toBe(
      true,
    );
    expect(
      issues.some((issue) => issue.includes("missing evidence for: Paper 2, Paper 3, Paper 4, Paper 5")),
    ).toBe(true);
  });

  it("removes topics without complete notes or quoted evidence from the source paper", () => {
    const unsupported = makeTopic("Invented topic");
    unsupported.paper_question_evidence = [
      { paper: "Paper 1", evidence: "This phrase is not in the paper" },
    ];
    const missingNotes = makeTopic("Missing notes topic");
    missingNotes.study_note = {} as any;
    const result = {
      subject: "Business Communication",
      years_analyzed: ["Paper 1"],
      topics: [makeTopic("Real topic"), unsupported, missingNotes],
      related_topic_pairs: [],
      overall_strategy_tip: "Bas Pass Hona Hai: Real topic padho.",
    } as any;

    validateAiAnalysisResult(result, ["Paper 1"], [
      {
        label: "Paper 1",
        text: "Q1. Discuss named business communication concepts.",
      },
    ]);

    expect(result.topics.map((topic: any) => topic.topic_name)).toEqual([
      "Real topic",
    ]);
  });

  it("flags distinctive summary topics that are missing from the topic list", () => {
    const result = {
      subject: "Law",
      years_analyzed: ["Paper 1", "Paper 2", "Paper 3", "Paper 4"],
      paper_summaries: [
        {
          paper: "Paper 3",
          summary: "Contract-law paper.",
          question_count: 3,
          distinctive_topics: [
            "Consideration: Definition & Unlawful Cases",
            "Rights of Finder of Goods",
          ],
        },
      ],
      topics: [
        makeTopic("Rights of Finder of Goods"),
        ...Array.from({ length: 18 }, (_, index) =>
          makeTopic(`Specific Law Topic ${index + 1}`),
        ),
      ],
      related_topic_pairs: [],
      overall_strategy_tip:
        "Bas Pass Hona Hai: Specific Law Topic 1 aur Specific Law Topic 2 padho.",
    } as any;

    const issues = getTopicQualityIssues(result, 4);
    expect(issues).toContain(
      '"Consideration: Definition & Unlawful Cases" was listed as a distinctive topic in Paper 3\'s summary but has no matching entry in topics — add it as a real topic if the paper text supports it.',
    );
    expect(issues).not.toContain(
      '"Rights of Finder of Goods" was listed as a distinctive topic in Paper 3\'s summary but has no matching entry in topics — add it as a real topic if the paper text supports it.',
    );
  });

  it("applies only named replacements while preserving accepted topics and adding distinct ones", () => {
    const original = {
      subject: "Business Communication",
      years_analyzed: ["Paper 1", "Paper 2", "Paper 3", "Paper 4"],
      topics: [
        makeTopic("Oral Communication"),
        makeTopic("Meeting Agenda"),
      ],
      related_topic_pairs: [],
      overall_strategy_tip: "Old strategy",
    } as any;

    const repaired = applyTopicRepairPatch(original, {
      replacements: [
        {
          current_topic_name: "oral communication",
          topic: makeTopic("Oral Communication: definition and two sides"),
        },
        {
          current_topic_name: "Unknown topic",
          topic: makeTopic("Should not be inserted"),
        },
      ],
      topics: [
        makeTopic("Minutes of Meeting: resolutions and format"),
        makeTopic("meeting-agenda"),
      ],
      overall_strategy_tip: "Bas Pass Hona Hai: Meeting Agenda padho.",
    });

    expect(repaired.topics.map((topic) => topic.topic_name)).toEqual([
      "Oral Communication: definition and two sides",
      "Meeting Agenda",
      "Minutes of Meeting: resolutions and format",
    ]);
    expect(repaired.overall_strategy_tip).toBe(
      "Bas Pass Hona Hai: Meeting Agenda padho.",
    );
  });

  it("rejects a replacement that would collide with another accepted topic", () => {
    const original = {
      subject: "Business Communication",
      years_analyzed: ["Paper 1"],
      topics: [makeTopic("Meeting Agenda"), makeTopic("Minutes of Meeting")],
      related_topic_pairs: [],
      overall_strategy_tip: "Bas Pass Hona Hai: Meeting Agenda padho.",
    } as any;

    const repaired = applyTopicRepairPatch(original, {
      replacements: [
        {
          current_topic_name: "Meeting Agenda",
          topic: makeTopic("Minutes of Meeting"),
        },
      ],
    });

    expect(repaired.topics.map((topic) => topic.topic_name)).toEqual([
      "Meeting Agenda",
      "Minutes of Meeting",
    ]);
  });
});