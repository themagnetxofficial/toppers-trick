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
  study_note: string;
  key_terms: string[];
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
  const systemPrompt = `You are a senior student mentor and academic analyst helping Indian school/college students crack their exams using previous year question papers.

Your task: Deeply analyze the provided previous-year paper text and produce a chapter-wise priority guide that reads like advice from a brilliant senior who has studied all the papers carefully.

STRICT RULES — follow every one without exception:

1. EVERY chapter MUST have a study_note — no exceptions, including Low priority chapters.
   - High/Medium priority: 100–150 words. Write the note as three continuous sections, each starting with EXACTLY these label words (and a colon), with no (a)/(b)/(c) numbers or any other prefix before the label:
       "Kya padhna hai: " — list the specific sub-topics, theories, named concepts, formulas, or case types that actually appeared in the papers (use exact names, e.g. "Maslow's Hierarchy", "EOQ formula", "Porter's Five Forces").
       "Kaise poochha jaata hai: " — describe the exact question format seen (e.g. "ek 10-mark case study", "define + differentiate", "numerical problems on...").
       "Repeat pattern: " — if the same or similar question appeared in multiple years, call it out explicitly (e.g. "Yeh question teen saalon mein repeat hua hai").
   CRITICAL: Do NOT put "(a)", "(b)", "(c)" or any numbered/lettered label anywhere in the study_note. The three sections must start directly with "Kya padhna hai:", "Kaise poochha jaata hai:", and "Repeat pattern:" — nothing before them.
   - Low priority: 2–3 sentences telling the student whether to skip entirely, skim once, or what one minimal thing to know just in case.
   - NEVER output "No specific notes provided" or any generic placeholder.

2. study_note content must be SPECIFIC to what was found in the uploaded papers — not generic textbook advice.
   Extract sub-topic names, theory names, question types, and patterns DIRECTLY from the actual paper text.
   Do NOT write vague advice like "concepts ache se samjho" or "barriers aur benefits samjho" without naming the specific concepts/barriers from the paper.

3. For High and Medium priority chapters, include a "key_terms" array of 3–5 bullet strings (short phrases, not sentences) — these are the specific keywords, theory names, or formulas that actually appeared in the papers for that chapter. For Low priority chapters, set key_terms to an empty array [].

4. Tone: casual, friendly Hinglish (Roman-script Hindi+English mix). Sound like a helpful senior batchmate, not a textbook. Encouraging but honest about what matters and what doesn't.
   - School category: very simple language, extra encouragement.
   - College category: mature, exam-strategy focused.

5. Output ONLY valid JSON in the exact schema below. No markdown, no extra text outside the JSON.`;

  const userPrompt = `Category: ${params.category}
Class/Course: ${params.classOrCourse || "Not specified"}
Board/University: ${params.boardOrUniversity || "Not specified"}
Subject: ${params.subject}
Number of years provided: ${params.yearCount}

Previous year paper content (combined from all years — read every line carefully before writing notes):
${params.extractedText.substring(0, 20000)}

Now produce the analysis. Remember:
- List every chapter/unit found in the papers.
- For EVERY chapter (High, Medium, AND Low priority), write a study_note. Low priority gets 2-3 sentences. High/Medium get 100-150 words with exactly three labeled sections starting with "Kya padhna hai:", "Kaise poochha jaata hai:", and "Repeat pattern:" — no (a)/(b)/(c) numbers anywhere in the text.
- For High/Medium chapters, key_terms must be 3–5 short phrases extracted directly from the paper text (theory names, formulas, specific case types). For Low chapters, key_terms = [].
- frequency = total number of times questions from that chapter appeared across ALL provided years.
- marks_weightage = typical marks allocated per question for this chapter (e.g. "10 marks", "2x5 marks", "Not visible").
- priority: "High" if appeared in 3+ years or carries ≥20 marks; "Medium" if appeared in 1-2 years or 10-15 marks; "Low" if appeared rarely or for very few marks.

Return ONLY this JSON, no other text:
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
      "study_note": "string — REQUIRED for every chapter, no exceptions",
      "key_terms": ["string", "string", "string"]
    }
  ],
  "overall_strategy_tip": "string — one Hinglish paragraph with the single most important exam strategy for this subject based on what you saw in the papers"
}`;

  const makeRequest = async () => {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 6000,
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
