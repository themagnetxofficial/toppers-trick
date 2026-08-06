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

export interface SubTopic {
  sub_topic_name: string;
  frequency: number;
  years_appeared: string[];
  note: string;
}

export interface QuestionTypeBreakdown {
  mcq: string;
  short_answer: string;
  long_answer: string;
  numerical_or_case_study: string;
}

export interface ChapterResult {
  chapter_name: string;
  overall_priority: "High" | "Medium" | "Low";
  total_frequency: number;
  years_appeared: string[];
  confidence_level: "High" | "Medium" | "Low";
  marks_weightage: string;
  question_type_breakdown: QuestionTypeBreakdown;
  sub_topics: SubTopic[];
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
  chapters: ChapterResult[];
  cross_chapter_patterns: string[];
  overall_strategy_tip: string;
}

export async function analyzeWithAI(params: {
  category: string;
  classOrCourse: string;
  boardOrUniversity: string;
  subject: string;
  yearLabels: string[];
  extractedText: string;
}): Promise<{ result: AiAnalysisResult; inputTokens: number; outputTokens: number }> {

  const systemPrompt = `You are an expert academic exam analyst with years of experience studying question paper patterns for Indian school and college exams. You don't just summarize — you find deep, non-obvious patterns that a professional exam coach would notice: which sub-topics within a chapter are actually tested repeatedly, how question difficulty and format has shifted across years, which chapters are frequently paired together in exams, and how confident one can be in a prediction based on the consistency of the pattern.

Rules:
1. Analyze at the SUB-TOPIC level, not just chapter level. A chapter like "Human Resource Management" may have 5 different sub-topics tested — identify each one separately with its own frequency.
2. Track YEAR-WISE presence — for each chapter/sub-topic, show exactly which of the provided years it appeared in, not just a total count.
3. Identify QUESTION TYPE patterns — classify questions by format (MCQ, short answer, long answer/essay, numerical/case study) and note which format is most common for each chapter.
4. Assign a CONFIDENCE LEVEL (High/Medium/Low) to each prediction, based on how consistent the pattern is — a topic appearing in 4 out of 5 years in a similar format deserves "High confidence," while an inconsistent or only-once appearance deserves "Low confidence." Be honest — do not inflate confidence to seem more impressive.
5. Note any CROSS-CHAPTER PATTERNS — e.g., if two chapters are frequently combined into a single case-study question, mention this explicitly, since it changes how a student should prepare.
6. Only use information present in the provided papers — do not invent patterns or add outside subject knowledge beyond what's needed to name/explain a concept clearly.
7. Write all explanatory text in casual, friendly Hinglish, in the tone of an experienced senior mentoring a student — not formal or robotic.
8. Output ONLY valid JSON in the exact schema provided. No extra text, no markdown, no preamble.`;

  const yearsList = params.yearLabels.join(", ");

  const userPrompt = `Category: ${params.category}
Class/Course: ${params.classOrCourse || "Not specified"}
Board/University: ${params.boardOrUniversity || "Not specified"}
Subject: ${params.subject}
Years provided: ${yearsList}

Previous year paper content (combined, labeled by year):
${params.extractedText.substring(0, 22000)}

Perform a deep analysis and return JSON in this exact format:

{
  "subject": "string",
  "years_analyzed": ${JSON.stringify(params.yearLabels)},
  "chapters": [
    {
      "chapter_name": "string",
      "overall_priority": "High | Medium | Low",
      "total_frequency": number,
      "years_appeared": ["Paper 1", "Paper 2"],
      "confidence_level": "High | Medium | Low",
      "marks_weightage": "string (e.g. '15-20 marks')",
      "question_type_breakdown": {
        "mcq": "count or percentage or 'None'",
        "short_answer": "count or percentage or 'None'",
        "long_answer": "count or percentage or 'None'",
        "numerical_or_case_study": "count or percentage or 'None'"
      },
      "sub_topics": [
        {
          "sub_topic_name": "string",
          "frequency": number,
          "years_appeared": ["Paper 1"],
          "note": "short Hinglish note — what exactly to know and how it's typically asked"
        }
      ],
      "study_note": {
        "kya_padhna_hai": "Hinglish — list the specific sub-topics, theories, named concepts, formulas, or case types that actually appeared in the papers",
        "kaise_poochha_jaata_hai": "Hinglish — describe the exact question format seen across these papers",
        "repeat_pattern": "Hinglish — if same or similar question appeared in multiple years, call it out explicitly"
      },
      "key_terms": ["term1", "term2", "term3"]
    }
  ],
  "cross_chapter_patterns": [
    "Hinglish string describing any chapters frequently combined in one question"
  ],
  "overall_strategy_tip": "Hinglish one-paragraph exam strategy based on what you saw in the papers"
}

Rules for this response:
- overall_priority: "High" if appeared in 3+ years or carries ≥20 marks; "Medium" if 1-2 years or 10-15 marks; "Low" if rarely appears or very few marks.
- confidence_level: "High" if pattern is very consistent (3+ years, same format); "Medium" if somewhat consistent; "Low" if only once or inconsistent.
- sub_topics: at least 2-4 per High/Medium chapter. Identify ACTUAL sub-topics from the paper text, not generic chapter sections.
- study_note: all 3 fields required for every chapter. For Low priority, keep kya_padhna_hai very brief (1-2 lines).
- cross_chapter_patterns: only include if genuinely observed — empty array [] is fine if none found.
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

  // Validate required fields
  if (!parsed.subject || !parsed.chapters || !Array.isArray(parsed.chapters)) {
    throw new Error("Invalid AI response schema");
  }

  // Ensure years_analyzed is always an array
  if (!Array.isArray(parsed.years_analyzed)) {
    parsed.years_analyzed = params.yearLabels;
  }

  return {
    result: parsed,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
}
