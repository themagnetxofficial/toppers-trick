import OpenAI from "openai";
import { logger } from "./logger";

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

export interface QuestionTypeBreakdown {
  mcq: string;
  short: string;
  long: string;
  case_study: string;
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

export interface PaperSummary {
  paper: string;
  summary: string;
  question_count: number;
  distinctive_topics: string[];
}

export function validateAiAnalysisResult(
  result: AiAnalysisResult,
  fallbackYears: string[],
): void {
  if (!result.subject?.trim() || !Array.isArray(result.topics)) {
    throw new Error("Invalid AI response schema");
  }

  result.topics = result.topics.filter(
    (topic) =>
      typeof topic?.topic_name === "string" && topic.topic_name.trim().length > 0,
  );

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
}

const MAX_CHARS_PER_PAPER = 40000;

function limitPaperForPrompt(text: string): string {
  if (text.length <= MAX_CHARS_PER_PAPER) return text;

  const headLength = Math.floor(MAX_CHARS_PER_PAPER * 0.75);
  const tailLength = MAX_CHARS_PER_PAPER - headLength;
  return `${text.slice(0, headLength)}

[Middle of this paper omitted only because it exceeded the per-paper AI input budget]

${text.slice(-tailLength)}`;
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
        )}`,
    )
    .join("\n\n");
}

export async function analyzeWithAI(params: {
  category: string;
  classOrCourse: string;
  boardOrUniversity: string;
  subject: string;
  yearLabels: string[];
  papers?: Array<{ label: string; text: string }>;
  extractedText: string;
}): Promise<{ result: AiAnalysisResult; inputTokens: number; outputTokens: number }> {

  const systemPrompt = `You are an expert academic exam analyst with years of experience studying question paper patterns for Indian school and college exams. You don't just summarize — you find deep, non-obvious patterns that a professional exam coach would notice: which specific topics are actually tested repeatedly, how question difficulty and format has shifted across years, which topics are frequently paired together in exams, and how confident one can be in a prediction based on the consistency of the pattern.

Rules:
1. Identify each distinct, specific topic that appears in the papers as its own entry — do NOT group multiple distinct topics under one umbrella category. A typical subject usually has 8-12 distinct topics across the syllabus — make sure you're not under-segmenting into overly broad categories. For example, "HRM" as a whole is too broad — instead identify "HRM vs Personnel Management", "HR Manager Roles", "Manpower Planning", "Training Methods", "Performance Appraisal", etc. as separate topics.
2. Track YEAR-WISE presence — for each topic, show exactly which of the provided papers it appeared in, not just a total count.
3. Identify QUESTION TYPE patterns — classify questions by format (MCQ, short answer, long answer/essay, case study) and note which format is most common for each topic.
4. Assign a CONFIDENCE LEVEL (High/Medium/Low) to each prediction, based on how consistent the pattern is — a topic appearing in 4 out of 5 years in a similar format deserves "High confidence," while an inconsistent or only-once appearance deserves "Low confidence." Be honest — do not inflate confidence to seem more impressive.
5. Note any RELATED TOPIC PAIRS — if two topics are frequently combined into a single case-study or long-answer question, mention this explicitly, since it changes how a student should prepare.
6. Only use information present in the provided papers — do not invent patterns or add outside subject knowledge beyond what's needed to name/explain a concept clearly.
7. Write all explanatory text in casual, friendly Hinglish, in the tone of an experienced senior mentoring a student — not formal or robotic.
8. Analyze EVERY labeled paper separately before comparing them. Do not stop after the first paper.
9. Output ONLY valid JSON in the exact schema provided. No extra text, no markdown, no preamble.`;

  const yearsList = params.yearLabels.join(", ");
  const paperContent = buildPaperPromptContent(
    params.papers,
    params.extractedText,
    params.yearLabels,
  );

  const userPrompt = `Category: ${params.category}
Class/Course: ${params.classOrCourse || "Not specified"}
Board/University: ${params.boardOrUniversity || "Not specified"}
Subject: ${params.subject}
Papers provided (these exact labels must be used): ${yearsList}

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
- topics: Aim for 8-12 specific topics. Each topic_name should be a precise concept, NOT a broad chapter name. Split broad areas into their actual distinct sub-concepts.
- priority: Use these thresholds strictly:
  "High"   → appeared in 3+ of the provided years (very consistent pattern)
  "Medium" → appeared in exactly 2 of the provided years (some consistency)
  "Low"    → appeared in only 1 of the provided years (one-time appearance, uncertain if it repeats)
  Exception: if only 1-2 papers were provided, treat "appeared in all provided years" as High, "appeared in 1 of 2" as Medium, and anything with only a brief mention as Low.
  IMPORTANT — distribution rule: For a typical 8-12 topic analysis, you should have a realistic spread, e.g. roughly 30-40% High, 30-40% Medium, 20-40% Low. Do NOT assign High or Medium to nearly every topic. A topic that appeared in only 1 of 4+ papers is Low, full stop — even if it carried good marks in that one year. Be strict.
- confidence_level: "High" if pattern is very consistent (3+ years, same format); "Medium" if somewhat consistent; "Low" if only once or inconsistent.
- study_note: all 3 fields required for every topic. For Low priority, keep kya_padhna_hai very brief (1-2 lines).
- related_topic_pairs: only include if genuinely observed — empty array [] is fine if none found.
- Return ONLY valid JSON, no other text.`;

  const makeRequest = async () => {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 12000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    return response;
  };

  let response;
  try {
    response = await makeRequest();
  } catch (err) {
    logger.warn({ err }, "First AI call failed, retrying once");
    response = await makeRequest();
  }

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty AI response");
  }

  let parsed: AiAnalysisResult;
  try {
    parsed = JSON.parse(content) as AiAnalysisResult;
  } catch {
    logger.warn("Failed to parse AI response JSON, retrying");
    const retryResponse = await makeRequest();
    const retryContent = retryResponse.choices[0]?.message?.content;
    if (!retryContent) throw new Error("Empty AI response on retry");
    parsed = JSON.parse(retryContent) as AiAnalysisResult;
  }

  validateAiAnalysisResult(parsed, params.yearLabels);

  return {
    result: parsed,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
}
