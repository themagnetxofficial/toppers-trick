import PDFDocument from "pdfkit";
import { AiAnalysisResult, ChapterResult } from "./openai";
import path from "path";
import fs from "fs";

// process.cwd() is the pnpm workspace root when run via --filter, not the
// api-server directory. Use import.meta.dirname (Node 21+) to anchor paths
// to the compiled output file's location, then go up one level to the
// api-server package root.
const API_SERVER_ROOT = path.resolve(import.meta.dirname, "..");
const UPLOADS_DIR = path.join(API_SERVER_ROOT, "uploads");
const PDF_OUTPUT_DIR = path.join(API_SERVER_ROOT, "generated_pdfs");

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
const BOTTOM_MARGIN = 60; // space to keep clear at bottom

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset x cursor to left margin and return current y. PDFKit forgets x after
 *  absolute-positioned text calls; calling this before any flow-text block is
 *  essential to avoid text starting mid-page. */
function resetX(doc: InstanceType<typeof PDFDocument>) {
  // Writing an empty string at the margin anchors the cursor x without moving y
  doc.text("", MARGIN, doc.y);
}

/** Draw a horizontal rule at current y, then advance */
function hRule(
  doc: InstanceType<typeof PDFDocument>,
  color = "#E5E7EB",
  gap = 1
) {
  doc.save().moveTo(MARGIN, doc.y).lineTo(PAGE_W - MARGIN, doc.y)
    .strokeColor(color).lineWidth(gap).stroke().restore();
  doc.moveDown(0.6);
}

/** Estimate text height for a given string, font size, and width. Used for
 *  pre-emptive page breaks — avoids orphaned headings. */
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

/** Add a new page and reset the cursor to the top margin. */
function newPage(doc: InstanceType<typeof PDFDocument>) {
  doc.addPage();
  doc.text("", MARGIN, MARGIN);
}

/** Guard: if remaining space is less than minHeight, add a new page. */
function ensureSpace(
  doc: InstanceType<typeof PDFDocument>,
  minHeight: number
) {
  if (doc.y + minHeight > PAGE_H - BOTTOM_MARGIN) {
    newPage(doc);
  }
}

/**
 * Parse a three-part AI study note into labelled segments.
 * The AI produces notes like:
 *   "Kya padhna hai: ... Kaise poochha jaata hai: ... Repeat pattern: ..."
 * We split on these known labels so each part can be rendered distinctly.
 */
function parseNoteParts(note: string): Array<{ label: string; body: string }> {
  const PATTERNS = [
    /kya\s+padhna\s+hai\s*:/i,
    /kaise\s+poochha?\s+jaata?\s+hai\s*:/i,
    /repeat\s+pattern\s*:/i,
  ];
  const LABELS = ["Kya Padhna Hai", "Kaise Poochha Jaata Hai", "Repeat Pattern"];

  // Find positions of each label in the note text
  const positions: Array<{ idx: number; label: string }> = [];
  for (let i = 0; i < PATTERNS.length; i++) {
    const m = note.match(PATTERNS[i]);
    if (m && m.index !== undefined) {
      positions.push({ idx: m.index, label: LABELS[i] });
    }
  }

  if (positions.length === 0) {
    // No three-part structure — return as single block
    return [{ label: "", body: cleanNoteBody(note) }];
  }

  positions.sort((a, b) => a.idx - b.idx);

  const parts: Array<{ label: string; body: string }> = [];
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].idx;
    const end = i + 1 < positions.length ? positions[i + 1].idx : note.length;
    // strip the label text itself from the body, then clean trailing artefacts
    let body = note.slice(start, end);
    body = body.replace(PATTERNS[i], "").trim();
    body = cleanNoteBody(body);
    if (body) parts.push({ label: positions[i].label, body });
  }
  return parts;
}

/**
 * Strip stray (a)/(b)/(c) letter-label artefacts that the model sometimes
 * appends to the end of a section body (e.g. "…in modern organizations. (b)").
 * Also normalises excess whitespace.
 */
function cleanNoteBody(text: string): string {
  return text
    .replace(/\s*\([abc]\)\s*$/i, "")   // trailing (a)/(b)/(c)
    .replace(/\s*\([abc]\)\s*/gi, " ")  // mid-text (a)/(b)/(c)
    .trim();
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
    yearsAnalyzed: number;
  }
) {
  // Orange accent bar at top
  doc.save()
    .rect(0, 0, PAGE_W, 6)
    .fill("#D97706")
    .restore();

  doc.text("", MARGIN, 30);

  // Title
  doc.fontSize(26).fillColor("#D97706").font("Helvetica-Bold")
    .text("Smart Study Guide", MARGIN, 30, { width: CONTENT_W, align: "center" });
  doc.moveDown(0.4);

  // Subject
  doc.fontSize(20).fillColor("#111827").font("Helvetica-Bold")
    .text(params.subject, MARGIN, doc.y, { width: CONTENT_W, align: "center" });
  doc.moveDown(0.3);

  // Meta line
  const meta = [params.classOrCourse, params.boardOrUniversity]
    .filter(Boolean).join("  ·  ");
  if (meta) {
    doc.fontSize(11).fillColor("#6B7280").font("Helvetica")
      .text(meta, MARGIN, doc.y, { width: CONTENT_W, align: "center" });
    doc.moveDown(0.25);
  }

  doc.fontSize(10).fillColor("#9CA3AF").font("Helvetica")
    .text(`Based on ${params.yearsAnalyzed} year(s) of previous papers`, MARGIN, doc.y, {
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
  doc.fontSize(13).fillColor("#D97706").font("Helvetica-Bold")
    .text("Chapter Priority Overview", MARGIN, doc.y, { width: CONTENT_W });
  doc.moveDown(0.6);

  // Column layout
  const cols = [
    { label: "Chapter / Topic", w: 235, x: MARGIN },
    { label: "Priority", w: 80, x: MARGIN + 235 },
    { label: "Frequency", w: 75, x: MARGIN + 315 },
    { label: "Marks", w: 90, x: MARGIN + 390 },
  ];

  // Header row background
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

    // Alternating row tint
    if (idx % 2 === 1) {
      doc.save().rect(MARGIN, rowY - 2, CONTENT_W, 18).fill("#FAFAFA").restore();
    }

    const pColor = PRIORITY_COLORS[ch.priority] ?? "#374151";

    // Chapter name
    doc.fontSize(9).fillColor("#111827").font("Helvetica")
      .text(ch.chapter_name || "—", cols[0].x + 4, rowY, { width: cols[0].w - 8 });

    // Priority — colored pill
    const pillW = 66;
    const pillX = cols[1].x + (cols[1].w - pillW) / 2;
    doc.save()
      .roundedRect(pillX, rowY - 1, pillW, 13, 6)
      .fill(PRIORITY_BG[ch.priority] ?? "#F3F4F6")
      .restore();
    doc.save()
      .roundedRect(pillX, rowY - 1, pillW, 13, 6)
      .stroke(pColor)
      .restore();
    doc.fontSize(8).fillColor(pColor).font("Helvetica-Bold")
      .text(ch.priority, pillX, rowY + 1, { width: pillW, align: "center" });

    // Frequency
    doc.fontSize(9).fillColor("#374151").font("Helvetica")
      .text(`${ch.frequency}×`, cols[2].x + 4, rowY, { width: cols[2].w - 4, align: "center" });

    // Marks
    doc.fontSize(9).fillColor("#374151").font("Helvetica")
      .text(ch.marks_weightage, cols[3].x + 4, rowY, { width: cols[3].w - 4 });

    rowY += 18;
  });

  // Table bottom border
  doc.save().moveTo(MARGIN, rowY).lineTo(PAGE_W - MARGIN, rowY)
    .strokeColor("#D1D5DB").lineWidth(0.5).stroke().restore();

  // Sync PDFKit internal cursor to after the table
  doc.text("", MARGIN, rowY + 16);
  doc.moveDown(0.5);
}

function renderChapterNote(
  doc: InstanceType<typeof PDFDocument>,
  chapter: ChapterResult,
  index: number
) {
  const pColor = PRIORITY_COLORS[chapter.priority] ?? "#374151";
  const pBg = PRIORITY_BG[chapter.priority] ?? "#F9FAFB";

  // Estimate block height for page-break guard (rough: heading + note + key terms)
  const noteHeight = estimateTextHeight(doc, chapter.study_note ?? "", 10, CONTENT_W - 20);
  const blockHeight = 24 + noteHeight + (chapter.key_terms?.length ? chapter.key_terms.length * 14 + 20 : 0) + 30;
  ensureSpace(doc, Math.min(blockHeight, 220)); // trigger page break if less than ~220pt left

  const startY = doc.y;

  // Left accent bar
  doc.save()
    .rect(MARGIN, startY, 4, 14)
    .fill(pColor)
    .restore();

  // Chapter number + name
  doc.fontSize(13).fillColor("#111827").font("Helvetica-Bold")
    .text(`${index + 1}. ${chapter.chapter_name}`, MARGIN + 12, startY, {
      width: CONTENT_W - 80,
    });

  // Priority pill — draw to the right of the heading
  const pillY = startY;
  const pillW = 90;
  const pillX = PAGE_W - MARGIN - pillW;
  doc.save()
    .roundedRect(pillX, pillY, pillW, 15, 7)
    .fill(pBg)
    .restore();
  doc.save()
    .roundedRect(pillX, pillY, pillW, 15, 7)
    .stroke(pColor)
    .restore();
  doc.fontSize(8).fillColor(pColor).font("Helvetica-Bold")
    .text(`${chapter.priority} Priority`, pillX, pillY + 3, { width: pillW, align: "center" });

  doc.moveDown(0.5);
  resetX(doc); // ensure x is back at MARGIN after absolute text calls

  // ---- Study note ----
  const note = chapter.study_note ?? "";
  const noteParts = parseNoteParts(note);

  if (noteParts.length === 1 && !noteParts[0].label) {
    // Single block (Low priority or no three-part structure)
    doc.fontSize(10).fillColor("#374151").font("Helvetica")
      .text(noteParts[0].body, MARGIN, doc.y, {
        width: CONTENT_W,
        lineBreak: true,
        lineGap: 2,
      });
  } else {
    // Three-part structure: render each part with its label
    noteParts.forEach((part) => {
      resetX(doc);
      ensureSpace(doc, 40);

      // Part label
      doc.fontSize(9).fillColor(pColor).font("Helvetica-Bold")
        .text(`${part.label}:`, MARGIN, doc.y, { width: CONTENT_W });
      doc.moveDown(0.15);

      // Part body — indented slightly
      resetX(doc);
      doc.fontSize(10).fillColor("#374151").font("Helvetica")
        .text(part.body, MARGIN + 8, doc.y, {
          width: CONTENT_W - 8,
          lineBreak: true,
          lineGap: 2,
        });
      doc.moveDown(0.4);
    });
  }

  // ---- Key terms ----
  if (
    (chapter.priority === "High" || chapter.priority === "Medium") &&
    Array.isArray(chapter.key_terms) &&
    chapter.key_terms.length > 0
  ) {
    doc.moveDown(0.2);
    ensureSpace(doc, chapter.key_terms.length * 14 + 24);
    resetX(doc);

    // Key terms header
    doc.fontSize(9).fillColor("#6B7280").font("Helvetica-Bold")
      .text("Key Terms:", MARGIN, doc.y, { width: CONTENT_W });
    doc.moveDown(0.2);

    // Each term on its own line with a bullet
    chapter.key_terms.forEach((term) => {
      resetX(doc);
      doc.fontSize(9).fillColor("#374151").font("Helvetica")
        .text(`  •  ${term}`, MARGIN, doc.y, { width: CONTENT_W });
    });
  }

  doc.moveDown(0.8);
  resetX(doc);

  // Bottom separator for this chapter section
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
  const total = chapters.length;
  const high = [...chapters.filter((c) => c.priority === "High")].sort(
    (a, b) => b.frequency - a.frequency
  );
  const medium = [...chapters.filter((c) => c.priority === "Medium")].sort(
    (a, b) => b.frequency - a.frequency
  );
  const low = [...chapters.filter((c) => c.priority === "Low")].sort(
    (a, b) => b.frequency - a.frequency
  );

  // Marks coverage estimate: sum of frequencies for selected chapters / total frequencies * 100
  const totalFreq = chapters.reduce((s, c) => s + c.frequency, 0) || 1;
  const freqCoverage = (chs: ChapterResult[]) =>
    Math.round((chs.reduce((s, c) => s + c.frequency, 0) / totalFreq) * 100);

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

  doc.fontSize(16).fillColor("#D97706").font("Helvetica-Bold")
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

    // Tier box background
    doc.save()
      .rect(MARGIN, boxTop, CONTENT_W, estimatedHeight)
      .fill(tier.bg)
      .restore();

    // Left accent strip coloured by tier
    doc.save()
      .rect(MARGIN, boxTop, 4, estimatedHeight)
      .fill(tier.color)
      .restore();

    // Tier heading
    doc.fontSize(12).fillColor(tier.color).font("Helvetica-Bold")
      .text(`${tier.emoji}  ${tier.title}`, MARGIN + 12, boxTop + 10, {
        width: CONTENT_W - 20,
      });

    // Subtitle / coverage line
    resetX(doc);
    doc.fontSize(8.5).fillColor("#6B7280").font("Helvetica")
      .text(tier.subtitle, MARGIN + 12, doc.y + 2, { width: CONTENT_W - 20 });
    doc.moveDown(0.4);
    resetX(doc);

    // Separator inside box
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

    // Chapter list as compact bullets
    tier.chapters.forEach((ch, i) => {
      resetX(doc);
      const bullet = i === 0 ? "1." : `${i + 1}.`;
      doc.fontSize(9).fillColor("#111827").font("Helvetica")
        .text(`   ${bullet}  ${ch.chapter_name}`, MARGIN + 12, doc.y, {
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

    doc.pipe(stream);

    // ---- Header ----
    renderHeader(doc, {
      subject: params.subject,
      classOrCourse: params.classOrCourse,
      boardOrUniversity: params.boardOrUniversity,
      yearsAnalyzed: params.aiResult.years_analyzed,
    });

    // ---- Summary table ----
    renderSummaryTable(doc, params.aiResult.chapters);

    // ---- Detailed notes section ----
    // Always start notes on a fresh page for clean separation
    newPage(doc);

    doc.fontSize(16).fillColor("#D97706").font("Helvetica-Bold")
      .text("Detailed Study Notes", MARGIN, doc.y, { width: CONTENT_W });
    doc.moveDown(0.3);

    doc.fontSize(10).fillColor("#6B7280").font("Helvetica")
      .text("Read these notes carefully — they're based on actual patterns found in your past papers.",
        MARGIN, doc.y, { width: CONTENT_W });
    doc.moveDown(0.8);
    hRule(doc, "#D97706", 1);

    // Order: High → Medium → Low
    const ordered = [
      ...params.aiResult.chapters.filter((c) => c.priority === "High"),
      ...params.aiResult.chapters.filter((c) => c.priority === "Medium"),
      ...params.aiResult.chapters.filter((c) => c.priority === "Low"),
    ];

    ordered.forEach((chapter, i) => {
      renderChapterNote(doc, chapter, i);
    });

    // ---- Strategy Tiers: Apni Strategy Chuno ----
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

    doc.fontSize(13).fillColor("#D97706").font("Helvetica-Bold")
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
