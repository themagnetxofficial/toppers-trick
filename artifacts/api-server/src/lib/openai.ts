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

export interface ChapterResult {
  chapter_name: string;
  frequency: number;
  marks_weightage: string;
  priority: "High" | "Medium" | "Low";
  study_note?: string;
}

export interface AiAnalysisResult {
  subject: string;
  category: string;
  years_analyzed: number;
  chapters: ChapterResult[];
  overall_strategy_tip: string;
}

export async function analyzeWithAI(params: {
  category: string;
  classOrCourse: string;
  boardOrUniversity: string;
  subject: string;
  yearCount: number;
  extractedText: string;
}): Promise<{ result: AiAnalysisResult; inputTokens: number; outputTokens: number }> {
  const systemPrompt = `You are an expert academic analyst helping school and college students in India prepare for exams using previous year question papers.

Your task: Analyze previous year papers for a specific subject and identify chapter-wise/topic-wise patterns to help students focus their study time effectively.

Rules:
1. Only use information from the provided papers. Do not guess or invent information not present in the text.
2. Identify chapter/unit names as they would appear in a standard syllabus for this subject, not generic labels.
3. Count how often questions from each chapter appeared across the provided years, and estimate typical marks weightage if marks are visible in the papers.
4. Write study notes in casual, friendly Hinglish (Hindi+English mixed, written in Roman/English script) — simple enough for a school or college student to understand quickly. Not overly formal Hindi, not pure English.
5. If category is "school", use very simple language and an encouraging, supportive tone.
6. If category is "college", use a slightly more mature tone, focused on exam strategy and time management.
7. Output ONLY valid JSON in the exact schema below. No extra text, no markdown formatting, no preamble or explanation outside the JSON.`;

  const userPrompt = `Category: ${params.category}
Class/Course: ${params.classOrCourse || "Not specified"}
Board/University: ${params.boardOrUniversity || "Not specified"}
Subject: ${params.subject}
Number of years provided: ${params.yearCount}

Previous year paper content (combined from all years):
${params.extractedText.substring(0, 12000)}

Analyze this content and return a JSON response with:
1. Chapter-wise frequency count (how many times questions from this chapter appeared across the provided years)
2. Estimated average marks weightage per chapter (if determinable from the text; otherwise use "Not specified")
3. A priority level for each chapter: "High" (appeared in most years / high marks), "Medium" (appeared in about half the years), "Low" (appeared rarely)
4. A short Hinglish study note (60-100 words) for each High and Medium priority chapter — explain what to focus on and common question types (MCQ, long answer, numerical, etc.)
5. One overall exam-strategy tip in Hinglish, appropriate to the School/College tone rule above

Return strictly in this JSON format, with no additional text:
{
  "subject": "string",
  "category": "school | college",
  "years_analyzed": number,
  "chapters": [
    {
      "chapter_name": "string",
      "frequency": number,
      "marks_weightage": "string",
      "priority": "High | Medium | Low",
      "study_note": "string (include only for High/Medium priority chapters)"
    }
  ],
  "overall_strategy_tip": "string"
}`;

  const makeRequest = async () => {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 3000,
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
    // Retry once if JSON parse fails
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

  return {
    result: parsed,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
}
