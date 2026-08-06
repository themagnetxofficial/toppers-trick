import PDFDocument from "pdfkit";
import { AiAnalysisResult, ChapterResult, SubTopic } from "./openai";
import path from "path";
import fs from "fs";

const API_SERVER_ROOT = path.resolve(import.meta.dirname, "..");
const UPLOADS_DIR = path.join(API_SERVER_ROOT, "uploads");
const PDF_OUTPUT_DIR = path.join(API_SERVER_ROOT, "generated_pdfs");
const FONT_DIR = path.join(API_SERVER_ROOT, "assets", "fonts");
const KALAM = path.join(FONT_DIR, "Kalam-Regular.ttf");
const KALAM_BOLD = path.join(FONT_DIR, "Kalam-Bold.ttf");

export function ensureDirectories() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(PDF_OUTPUT_DIR, { recursive: true });
}

export function getUploadsDir() {
  ensureDirectories();
  return UPLOADS_DIR;
}

export function getPdfOutputDir() {
  ensureDirectories();
  return PDF_OUTPUT_DIR;
}

// ---------------------------------------------------------------------------
// Layout constants — A4 page (595.28 × 841.89 pts)
// ---------------------------------------------------------------------------
const PAGE_W = 595.28;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2; // 499.28
const PAGE_H = 841.89;
const BOTTOM_MARGIN = 60;

const PRIORITY_COLORS: Record<string, string> = {
  High: "#DC2626",
  Medium: "#D97706",
  Low: "#16A34A",
};
const PRIORITY_BG: Record<string, string> = {
  High: "#FEF2F2",
  Medium: "#FFFBEB",
  Low: "#F0FDF4",
};
const PRIORITY_HL: Record<string, string> = {
  High: "#FCA5A5",
  Medium: "#FCD34D",
  Low: "#6EE7B7",
};
const CONFIDENCE_HL: Record<string, string> = {
  High: "#BBF7D0",
  Medium: "#FDE68A",
  Low: "#FECACA",
};
const CONFIDENCE_TEXT: Record<string, string> = {
  High: "#166534",
  Medium: "#92400E",
  Low: "#991B1B",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetX(doc: InstanceType<typeof PDFDocument>) {
  doc.text("", MARGIN, doc.y);
}

function hRule(
  doc: InstanceType<typeof PDFDocument>,
  color = "#E5E7EB",
  gap = 1
) {
  doc.save().moveTo(MARGIN, doc.y).lineTo(PAGE_W - MARGIN, doc.y)
    .strokeColor(color).lineWidth(gap).stroke().restore();
  doc.moveDown(0.6);
}

function estimateTextHeight(
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  fontSize: number,
  width: number
): number {
  const lineHeight = fontSize * 1.4;
  const charsPerLine = Math.floor(width / (fontSize * 0.55));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  return lines * lineHeight;
}

function drawNotebookLines(doc: InstanceType<typeof PDFDocument>) {
  const lineSpacing = 14.4;
  const lineColor = "#DDE6F0";
  const lineWidth = 0.25;
  doc.save();
  doc.strokeColor(lineColor).lineWidth(lineWidth);
  for (let y = MARGIN; y < PAGE_H - 20; y += lineSpacing) {
    doc.moveTo(MARGIN - 4, y).lineTo(PAGE_W - MARGIN + 4, y).stroke();
  }
  doc.restore();
}

function newPage(doc: InstanceType<typeof PDFDocument>) {
  doc.addPage();
  drawNotebookLines(doc);
  doc.text("", MARGIN, MARGIN);
}

function ensureSpace(
  doc: InstanceType<typeof PDFDocument>,
  minHeight: number
) {
  if (doc.y + minHeight > PAGE_H - BOTTOM_MARGIN) {
    newPage(doc);
  }
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderHeader(
  doc: InstanceType<typeof PDFDocument>,
  params: {
    subject: string;
    classOrCourse?: string | null;
    boardOrUniversity?: string | null;
    yearsAnalyzed: number | string[];
  }
) {
  doc.save()
    .rect(0, 0, PAGE_W, 6)
    .fill("#D97706")
    .restore();

  doc.text("", MARGIN, 30);
  doc.fontSize(28).fillColor("#D97706").font("Kalam-Bold")
    .text("Smart Study Guide", MARGIN, 30, { width: CONTENT_W, align: "center" });
  doc.moveDown(0.4);

  doc.fontSize(20).fillColor("#111827").font("Kalam-Bold")
    .text(params.subject, MARGIN, doc.y, { width: CONTENT_W, align: "center" });
  doc.moveDown(0.3);

  const meta = [params.classOrCourse, params.boardOrUniversity]
    .filter(Boolean).join("  ·  ");
  if (meta) {
    doc.fontSize(11).fillColor("#6B7280").font("Helvetica")
      .text(meta, MARGIN, doc.y, { width: CONTENT_W, align: "center" });
    doc.moveDown(0.25);
  }

  const yearsLabel = Array.isArray(params.yearsAnalyzed)
    ? `${params.yearsAnalyzed.length} year(s) of previous papers`
    : `${params.yearsAnalyzed} year(s) of previous papers`;

  doc.fontSize(10).fillColor("#9CA3AF").font("Helvetica")
    .text(`Based on ${yearsLabel}`, MARGIN, doc.y, {
      width: CONTENT_W,
      align: "center",
    });
  doc.moveDown(1);

  hRule(doc, "#D97706", 1.5);
}

function renderSummaryTable(
  doc: InstanceType<typeof PDFDocument>,
  chapters: ChapterResult[]
) {
  doc.fontSize(15).fillColor("#D97706").font("Kalam-Bold")
    .text("Chapter Priority Overview", MARGIN, doc.y, { width: CONTENT_W });
  doc.moveDown(0.6);

  // Columns: Chapter(205) | Priority(70) | Confidence(75) | Freq(45) | Marks(100)
  const cols = [
    { label: "Chapter / Topic", w: 205, x: MARGIN },
    { label: "Priority", w: 70, x: MARGIN + 205 },
    { label: "Confidence", w: 75, x: MARGIN + 275 },
    { label: "Freq", w: 45, x: MARGIN + 350 },
    { label: "Marks", w: 99, x: MARGIN + 395 },
  ];

  const headerY = doc.y;
  doc.save()
    .rect(MARGIN, headerY - 4, CONTENT_W, 20)
    .fill("#F3F4F6")
    .restore();

  cols.forEach((col) => {
    doc.fontSize(9).fillColor("#374151").font("Helvetica-Bold")
      .text(col.label, col.x + 4, headerY, { width: col.w - 4 });
  });

  let rowY = headerY + 20;
  doc.save().moveTo(MARGIN, rowY).lineTo(PAGE_W - MARGIN, rowY)
    .strokeColor("#D1D5DB").lineWidth(0.5).stroke().restore();
  rowY += 4;

  chapters.forEach((ch, idx) => {
    if (rowY > PAGE_H - BOTTOM_MARGIN) {
      doc.addPage();
      rowY = MARGIN;
    }

    if (idx % 2 === 1) {
      doc.save().rect(MARGIN, rowY - 2, CONTENT_W, 18).fill("#FAFAFA").restore();
    }

    const priority = ch.overall_priority ?? (ch as any).priority ?? "Low";
    const confidence = ch.confidence_level ?? "Medium";
    const pColor = PRIORITY_COLORS[priority] ?? "#374151";

    // Chapter name
    doc.fontSize(9).fillColor("#111827").font("Helvetica")
      .text(ch.chapter_name || "—", cols[0].x + 4, rowY, { width: cols[0].w - 8 });

    // Priority pill
    const pillW = 55;
    const pillX = cols[1].x + (cols[1].w - pillW) / 2;
    doc.save()
      .roundedRect(pillX, rowY - 2, pillW, 15, 3)
      .fill(PRIORITY_HL[priority] ?? "#E5E7EB")
      .restore();
    doc.fontSize(8).fillColor(pColor).font("Kalam-Bold")
      .text(priority, pillX, rowY + 1, { width: pillW, align: "center" });

    // Confidence pill
    const confW = 58;
    const confX = cols[2].x + (cols[2].w - confW) / 2;
    doc.save()
      .roundedRect(confX, rowY - 2, confW, 15, 3)
      .fill(CONFIDENCE_HL[confidence] ?? "#E5E7EB")
      .restore();
    doc.fontSize(8).fillColor(CONFIDENCE_TEXT[confidence] ?? "#374151").font("Kalam-Bold")
      .text(confidence, confX, rowY + 1, { width: confW, align: "center" });

    // Frequency
    const freq = ch.total_frequency ?? (ch as any).frequency ?? 0;
    doc.fontSize(9).fillColor("#374151").font("Helvetica")
      .text(`${freq}×`, cols[3].x + 4, rowY, { width: cols[3].w - 4, align: "center" });

    // Marks
    doc.fontSize(9).fillColor("#374151").font("Helvetica")
      .text(ch.marks_weightage ?? "—", cols[4].x + 4, rowY, { width: cols[4].w - 4 });

    rowY += 18;
  });

  doc.save().moveTo(MARGIN, rowY).lineTo(PAGE_W - MARGIN, rowY)
    .strokeColor("#D1D5DB").lineWidth(0.5).stroke().restore();

  doc.text("", MARGIN, rowY + 16);
  doc.moveDown(0.5);
}

function renderChapterNote(
  doc: InstanceType<typeof PDFDocument>,
  chapter: ChapterResult,
  index: number
) {
  const priority = chapter.overall_priority ?? (chapter as any).priority ?? "Low";
  const pColor = PRIORITY_COLORS[priority] ?? "#374151";
  const confidence = chapter.confidence_level ?? "Medium";
  const freq = chapter.total_frequency ?? (chapter as any).frequency ?? 0;

  const subTopics = chapter.sub_topics ?? [];
  const blockHeight = 80 + subTopics.length * 24 + 60;
  ensureSpace(doc, Math.min(blockHeight, 200));

  const startY = doc.y;

  // Left accent bar
  doc.save().rect(MARGIN, startY, 4, 16).fill(pColor).restore();

  // Chapter heading
  doc.fontSize(14).fillColor("#111827").font("Kalam-Bold")
    .text(`${index + 1}. ${chapter.chapter_name}`, MARGIN + 12, startY, {
      width: CONTENT_W - 200,
    });

  // Priority pill
  const pillY = startY + 1;
  const pillW = 80;
  const pillX = PAGE_W - MARGIN - pillW;
  doc.save()
    .roundedRect(pillX, pillY, pillW, 16, 4)
    .fill(PRIORITY_HL[priority] ?? "#E5E7EB")
    .restore();
  doc.fontSize(8.5).fillColor(pColor).font("Kalam-Bold")
    .text(`${priority} Priority`, pillX, pillY + 3, { width: pillW, align: "center" });

  // Confidence badge
  const confW = 80;
  const confX = pillX - confW - 6;
  doc.save()
    .roundedRect(confX, pillY, confW, 16, 4)
    .fill(CONFIDENCE_HL[confidence] ?? "#E5E7EB")
    .restore();
  doc.fontSize(8.5).fillColor(CONFIDENCE_TEXT[confidence] ?? "#374151").font("Kalam-Bold")
    .text(`${confidence} Conf.`, confX, pillY + 3, { width: confW, align: "center" });

  doc.moveDown(0.5);
  resetX(doc);

  // Years appeared + frequency inline
  if (Array.isArray(chapter.years_appeared) && chapter.years_appeared.length > 0) {
    const yearsStr = chapter.years_appeared.join("  ·  ");
    doc.fontSize(8.5).fillColor("#6B7280").font("Helvetica")
      .text(`Appeared in: ${yearsStr}   ·   ${freq}× total`, MARGIN, doc.y, { width: CONTENT_W });
    doc.moveDown(0.4);
    resetX(doc);
  }

  // Question type breakdown — compact inline
  if (chapter.question_type_breakdown) {
    const qt = chapter.question_type_breakdown;
    const parts = [
      qt.mcq !== "None" && qt.mcq ? `MCQ: ${qt.mcq}` : null,
      qt.short_answer !== "None" && qt.short_answer ? `Short: ${qt.short_answer}` : null,
      qt.long_answer !== "None" && qt.long_answer ? `Long: ${qt.long_answer}` : null,
      qt.numerical_or_case_study !== "None" && qt.numerical_or_case_study ? `Case/Num: ${qt.numerical_or_case_study}` : null,
    ].filter(Boolean);

    if (parts.length > 0) {
      doc.fontSize(8.5).fillColor("#6B7280").font("Helvetica-Oblique")
        .text(`Question types: ${parts.join("  |  ")}`, MARGIN, doc.y, { width: CONTENT_W });
      doc.moveDown(0.5);
      resetX(doc);
    }
  }

  // ---- Study note (3 sections as object) ----
  const note = chapter.study_note;
  if (note && typeof note === "object") {
    const sections = [
      { label: "Kya Padhna Hai", body: note.kya_padhna_hai },
      { label: "Kaise Poochha Jaata Hai", body: note.kaise_poochha_jaata_hai },
      { label: "Repeat Pattern", body: note.repeat_pattern },
    ];

    sections.forEach((part) => {
      if (!part.body) return;
      resetX(doc);
      ensureSpace(doc, 40);

      doc.fontSize(10.5).fillColor(pColor).font("Kalam-Bold")
        .text(`${part.label}:`, MARGIN, doc.y, { width: CONTENT_W });
      doc.moveDown(0.1);
      resetX(doc);
      doc.fontSize(10).fillColor("#374151").font("Helvetica")
        .text(part.body, MARGIN + 8, doc.y, {
          width: CONTENT_W - 8,
          lineBreak: true,
          lineGap: 2,
        });
      doc.moveDown(0.4);
    });
  } else if (note && typeof note === "string") {
    // Backward compat: old string format
    resetX(doc);
    doc.fontSize(10).fillColor("#374151").font("Helvetica")
      .text(note as string, MARGIN, doc.y, {
        width: CONTENT_W,
        lineBreak: true,
        lineGap: 2,
      });
    doc.moveDown(0.5);
  }

  // ---- Sub-topics ----
  if (subTopics.length > 0) {
    doc.moveDown(0.2);
    ensureSpace(doc, subTopics.length * 26 + 20);
    resetX(doc);

    doc.fontSize(10.5).fillColor("#92400E").font("Kalam-Bold")
      .text("Sub-topics:", MARGIN, doc.y, { width: CONTENT_W });
    doc.moveDown(0.2);

    subTopics.forEach((st: SubTopic) => {
      resetX(doc);
      ensureSpace(doc, 30);
      const stY = doc.y;

      // Sticky chip background
      const chipH = estimateTextHeight(doc, st.note ?? "", 9, CONTENT_W - 60) + 18;
      doc.save()
        .roundedRect(MARGIN + 4, stY, CONTENT_W - 8, Math.max(chipH, 26), 3)
        .fill("#FEFCE8")
        .restore();
      doc.save()
        .rect(MARGIN + 4, stY, 3, Math.max(chipH, 26))
        .fill("#F59E0B")
        .restore();

      // Sub-topic name (line 1)
      doc.fontSize(9).fillColor("#78350F").font("Kalam-Bold")
        .text(`  ${st.sub_topic_name}`, MARGIN + 10, stY + 4, {
          width: CONTENT_W - 20,
          lineBreak: false,
        });

      // Freq + years (line 2, compact)
      const yearsShort = (st.years_appeared ?? []).join(" · ");
      const stFreqStr = `${st.frequency}×  ${yearsShort ? `— ${yearsShort}` : ""}`;
      doc.fontSize(7.5).fillColor("#92400E").font("Helvetica")
        .text(`  ${stFreqStr}`, MARGIN + 10, stY + 16, {
          width: CONTENT_W - 20,
          lineBreak: false,
        });

      // Note text (line 3+)
      if (st.note) {
        resetX(doc);
        doc.fontSize(9).fillColor("#374151").font("Helvetica")
          .text(st.note, MARGIN + 12, stY + 27, {
            width: CONTENT_W - 20,
            lineBreak: true,
            lineGap: 1,
          });
        // Advance cursor past the chip
        const chipBottom = stY + Math.max(chipH, 40);
        if (doc.y < chipBottom) {
          doc.text("", MARGIN, chipBottom + 2);
        }
      } else {
        doc.text("", MARGIN, stY + 32);
      }
      doc.moveDown(0.3);
    });
  }

  // ---- Key terms ----
  if (
    (priority === "High" || priority === "Medium") &&
    Array.isArray(chapter.key_terms) &&
    chapter.key_terms.length > 0
  ) {
    doc.moveDown(0.2);
    ensureSpace(doc, chapter.key_terms.length * 14 + 24);
    resetX(doc);

    doc.fontSize(10).fillColor("#92400E").font("Kalam-Bold")
      .text("Key Terms:", MARGIN, doc.y, { width: CONTENT_W });
    doc.moveDown(0.25);

    chapter.key_terms.forEach((term) => {
      resetX(doc);
      ensureSpace(doc, 18);
      const termX = MARGIN + 4;
      const termY = doc.y;
      const chipW = Math.min(term.length * 6.5 + 20, CONTENT_W - 8);
      doc.save()
        .roundedRect(termX, termY, chipW, 16, 3)
        .fill("#FEF3C7")
        .restore();
      doc.save()
        .rect(termX, termY, 3, 16)
        .fill("#F59E0B")
        .restore();
      doc.fontSize(9).fillColor("#78350F").font("Kalam")
        .text(`  ${term}`, termX, termY + 2, { width: chipW - 4, lineBreak: false });
      doc.moveDown(0.5);
    });
  }

  doc.moveDown(0.8);
  resetX(doc);
  hRule(doc, "#E5E7EB", 0.5);
}

// ---------------------------------------------------------------------------
// Strategy tiers renderer
// ---------------------------------------------------------------------------

interface StrategyTier {
  emoji: string;
  title: string;
  subtitle: string;
  chapters: ChapterResult[];
  color: string;
  bg: string;
}

function buildStrategyTiers(chapters: ChapterResult[]): StrategyTier[] {
  const getPrio = (c: ChapterResult) => c.overall_priority ?? (c as any).priority ?? "Low";
  const getFreq = (c: ChapterResult) => c.total_frequency ?? (c as any).frequency ?? 0;

  const total = chapters.length;
  const high = [...chapters.filter((c) => getPrio(c) === "High")].sort(
    (a, b) => getFreq(b) - getFreq(a)
  );
  const medium = [...chapters.filter((c) => getPrio(c) === "Medium")].sort(
    (a, b) => getFreq(b) - getFreq(a)
  );
  const low = [...chapters.filter((c) => getPrio(c) === "Low")].sort(
    (a, b) => getFreq(b) - getFreq(a)
  );

  const totalFreq = chapters.reduce((s, c) => s + getFreq(c), 0) || 1;
  const freqCoverage = (chs: ChapterResult[]) =>
    Math.round((chs.reduce((s, c) => s + getFreq(c), 0) / totalFreq) * 100);

  return [
    {
      emoji: "🎯",
      title: "Bas Pass Hona Hai",
      subtitle: `Just want to pass — ${high.length} of ${total} chapters · ~${freqCoverage(high)}% marks coverage`,
      chapters: high,
      color: "#DC2626",
      bg: "#FEF2F2",
    },
    {
      emoji: "📈",
      title: "Average Score Chahiye",
      subtitle: `Decent score — ${high.length + medium.length} of ${total} chapters · ~${freqCoverage([...high, ...medium])}% marks coverage`,
      chapters: [...high, ...medium],
      color: "#D97706",
      bg: "#FFFBEB",
    },
    {
      emoji: "🏆",
      title: "Top Karna Hai",
      subtitle: `Full coverage — all ${total} chapters · 100% marks coverage`,
      chapters: [...high, ...medium, ...low],
      color: "#16A34A",
      bg: "#F0FDF4",
    },
  ];
}

function renderStrategyTiers(
  doc: InstanceType<typeof PDFDocument>,
  chapters: ChapterResult[]
) {
  newPage(doc);

  doc.fontSize(20).fillColor("#D97706").font("Kalam-Bold")
    .text("Apni Strategy Chuno", MARGIN, doc.y, { width: CONTENT_W });
  doc.moveDown(0.2);
  doc.fontSize(10).fillColor("#6B7280").font("Helvetica")
    .text(
      "Pick your goal — here's exactly which chapters to study based on past paper patterns.",
      MARGIN, doc.y, { width: CONTENT_W }
    );
  doc.moveDown(0.8);
  hRule(doc, "#D97706", 1);

  const tiers = buildStrategyTiers(chapters);

  tiers.forEach((tier) => {
    ensureSpace(doc, tier.chapters.length * 13 + 70);

    const boxTop = doc.y;
    const estimatedHeight = tier.chapters.length * 13 + 58;

    doc.save()
      .rect(MARGIN, boxTop, CONTENT_W, estimatedHeight)
      .fill(tier.bg)
      .restore();

    doc.save()
      .rect(MARGIN, boxTop, 4, estimatedHeight)
      .fill(tier.color)
      .restore();

    doc.fontSize(13).fillColor(tier.color).font("Kalam-Bold")
      .text(`${tier.emoji}  ${tier.title}`, MARGIN + 12, boxTop + 10, {
        width: CONTENT_W - 20,
      });

    resetX(doc);
    doc.fontSize(8.5).fillColor("#6B7280").font("Helvetica")
      .text(tier.subtitle, MARGIN + 12, doc.y + 2, { width: CONTENT_W - 20 });
    doc.moveDown(0.4);
    resetX(doc);

    const sepY = doc.y + 2;
    doc.save()
      .moveTo(MARGIN + 12, sepY)
      .lineTo(PAGE_W - MARGIN - 8, sepY)
      .strokeColor(tier.color)
      .lineWidth(0.4)
      .stroke()
      .restore();
    doc.moveDown(0.5);
    resetX(doc);

    tier.chapters.forEach((ch, i) => {
      resetX(doc);
      doc.fontSize(9).fillColor("#111827").font("Helvetica")
        .text(`   ${i + 1}.  ${ch.chapter_name}`, MARGIN + 12, doc.y, {
          width: CONTENT_W - 24,
          lineBreak: false,
        });
      doc.moveDown(0.35);
    });

    doc.moveDown(0.6);
    resetX(doc);
  });
}

// ---------------------------------------------------------------------------
// Cross-chapter patterns renderer
// ---------------------------------------------------------------------------

function renderCrossChapterPatterns(
  doc: InstanceType<typeof PDFDocument>,
  patterns: string[]
) {
  if (!patterns || patterns.length === 0) return;

  ensureSpace(doc, patterns.length * 30 + 60);
  resetX(doc);
  doc.moveDown(0.5);

  doc.save()
    .rect(MARGIN, doc.y, CONTENT_W, 2)
    .fill("#6366F1")
    .restore();
  doc.moveDown(0.8);
  resetX(doc);

  doc.fontSize(16).fillColor("#6366F1").font("Kalam-Bold")
    .text("Cross-Chapter Patterns", MARGIN, doc.y, { width: CONTENT_W });
  doc.moveDown(0.3);
  resetX(doc);

  doc.fontSize(9.5).fillColor("#6B7280").font("Helvetica")
    .text(
      "Yeh chapters exam mein aksar ek saath poochhe jaate hain — inhe milake padho.",
      MARGIN, doc.y, { width: CONTENT_W }
    );
  doc.moveDown(0.6);
  resetX(doc);

  patterns.forEach((pattern, i) => {
    resetX(doc);
    ensureSpace(doc, 30);
    const patY = doc.y;
    const patH = estimateTextHeight(doc, pattern, 9.5, CONTENT_W - 24) + 14;
    doc.save()
      .roundedRect(MARGIN, patY, CONTENT_W, Math.max(patH, 22), 4)
      .fill("#EEF2FF")
      .restore();
    doc.save()
      .rect(MARGIN, patY, 4, Math.max(patH, 22))
      .fill("#6366F1")
      .restore();
    doc.fontSize(9).fillColor("#374151").font("Helvetica")
      .text(`  ${i + 1}.  ${pattern}`, MARGIN + 10, patY + 6, {
        width: CONTENT_W - 16,
        lineBreak: true,
        lineGap: 2,
      });
    if (doc.y < patY + Math.max(patH, 22)) {
      doc.text("", MARGIN, patY + Math.max(patH, 22) + 4);
    }
    doc.moveDown(0.4);
  });
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function generateStudyGuidePdf(params: {
  analysisId: number;
  subject: string;
  classOrCourse: string | null | undefined;
  boardOrUniversity: string | null | undefined;
  aiResult: AiAnalysisResult;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    ensureDirectories();

    const fileName = `study-guide-${params.analysisId}-${Date.now()}.pdf`;
    const filePath = path.join(PDF_OUTPUT_DIR, fileName);
    const stream = fs.createWriteStream(filePath);

    const doc = new PDFDocument({
      margin: MARGIN,
      size: "A4",
      autoFirstPage: true,
      bufferPages: false,
    });

    doc.registerFont("Kalam", KALAM);
    doc.registerFont("Kalam-Bold", KALAM_BOLD);

    drawNotebookLines(doc);
    doc.pipe(stream);

    // ---- Header ----
    renderHeader(doc, {
      subject: params.subject,
      classOrCourse: params.classOrCourse,
      boardOrUniversity: params.boardOrUniversity,
      yearsAnalyzed: params.aiResult.years_analyzed ?? 1,
    });

    // ---- Summary table ----
    renderSummaryTable(doc, params.aiResult.chapters);

    // ---- Detailed notes section ----
    newPage(doc);

    doc.fontSize(20).fillColor("#D97706").font("Kalam-Bold")
      .text("Detailed Study Notes", MARGIN, doc.y, { width: CONTENT_W });
    doc.moveDown(0.3);

    doc.fontSize(10).fillColor("#6B7280").font("Helvetica")
      .text("Read these notes carefully — they're based on actual patterns found in your past papers.",
        MARGIN, doc.y, { width: CONTENT_W });
    doc.moveDown(0.8);
    hRule(doc, "#D97706", 1);

    const getPrio = (c: ChapterResult) => c.overall_priority ?? (c as any).priority ?? "Low";
    const ordered = [
      ...params.aiResult.chapters.filter((c) => getPrio(c) === "High"),
      ...params.aiResult.chapters.filter((c) => getPrio(c) === "Medium"),
      ...params.aiResult.chapters.filter((c) => getPrio(c) === "Low"),
    ];

    ordered.forEach((chapter, i) => {
      renderChapterNote(doc, chapter, i);
    });

    // ---- Cross-chapter patterns ----
    if (params.aiResult.cross_chapter_patterns?.length) {
      renderCrossChapterPatterns(doc, params.aiResult.cross_chapter_patterns);
    }

    // ---- Strategy Tiers ----
    renderStrategyTiers(doc, params.aiResult.chapters);

    // ---- Overall strategy ----
    ensureSpace(doc, 100);
    resetX(doc);
    doc.moveDown(0.5);

    doc.save()
      .rect(MARGIN, doc.y, CONTENT_W, 2)
      .fill("#D97706")
      .restore();
    doc.moveDown(1);
    resetX(doc);

    doc.fontSize(16).fillColor("#D97706").font("Kalam-Bold")
      .text("Overall Exam Strategy", MARGIN, doc.y, { width: CONTENT_W });
    doc.moveDown(0.5);
    resetX(doc);

    doc.fontSize(11).fillColor("#374151").font("Helvetica")
      .text(params.aiResult.overall_strategy_tip, MARGIN, doc.y, {
        width: CONTENT_W,
        lineBreak: true,
        lineGap: 3,
      });

    // ---- Footer ----
    doc.moveDown(2);
    resetX(doc);
    doc.fontSize(8).fillColor("#9CA3AF").font("Helvetica")
      .text("Generated by Smart Study Guide  ·  Study Smart, Score More!", MARGIN, doc.y, {
        width: CONTENT_W,
        align: "center",
      });

    doc.end();

    stream.on("finish", () => resolve(fileName));
    stream.on("error", reject);
  });
}
