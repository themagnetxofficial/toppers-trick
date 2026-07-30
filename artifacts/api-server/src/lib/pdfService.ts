import PDFDocument from "pdfkit";
import { AiAnalysisResult } from "./openai";
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
      margin: 50,
      size: "A4",
    });

    doc.pipe(stream);

    // Title page header
    doc
      .fontSize(24)
      .fillColor("#D97706")
      .text("Smart Study Guide", { align: "center" });

    doc.moveDown(0.5);

    doc
      .fontSize(18)
      .fillColor("#1F2937")
      .text(params.subject, { align: "center" });

    if (params.classOrCourse || params.boardOrUniversity) {
      doc.moveDown(0.3);
      doc
        .fontSize(12)
        .fillColor("#6B7280")
        .text(
          [params.classOrCourse, params.boardOrUniversity]
            .filter(Boolean)
            .join(" | "),
          { align: "center" }
        );
    }

    doc.moveDown(0.3);
    doc
      .fontSize(11)
      .fillColor("#6B7280")
      .text(`Years Analyzed: ${params.aiResult.years_analyzed}`, {
        align: "center",
      });

    doc.moveDown(1);

    // Divider line
    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .strokeColor("#E5E7EB")
      .lineWidth(1)
      .stroke();

    doc.moveDown(1);

    // Summary table header
    doc.fontSize(14).fillColor("#D97706").text("Chapter Priority Summary");
    doc.moveDown(0.5);

    // Table header row
    const colWidths = [200, 70, 80, 100];
    const headers = ["Chapter", "Frequency", "Priority", "Marks"];
    const tableX = 50;
    let tableY = doc.y;

    doc.fontSize(10).fillColor("#374151");
    headers.forEach((h, i) => {
      const x = tableX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.text(h, x, tableY, { width: colWidths[i], align: "left" });
    });

    tableY += 18;
    doc
      .moveTo(tableX, tableY)
      .lineTo(545, tableY)
      .strokeColor("#D1D5DB")
      .stroke();
    tableY += 6;

    // Table rows
    const priorityColors: Record<string, string> = {
      High: "#DC2626",
      Medium: "#D97706",
      Low: "#16A34A",
    };

    params.aiResult.chapters.forEach((chapter) => {
      const color = priorityColors[chapter.priority] || "#374151";
      const row = [
        chapter.chapter_name,
        String(chapter.frequency),
        chapter.priority,
        chapter.marks_weightage,
      ];

      row.forEach((cell, i) => {
        const x = tableX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc
          .fontSize(9)
          .fillColor(i === 2 ? color : "#374151")
          .text(cell, x, tableY, { width: colWidths[i] - 5, align: "left" });
      });

      tableY += 18;

      if (tableY > 750) {
        doc.addPage();
        tableY = 50;
      }
    });

    doc.y = tableY + 10;
    doc.moveDown(1);

    // Divider
    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .strokeColor("#E5E7EB")
      .stroke();
    doc.moveDown(1);

    // Detailed study notes
    const highMedChapters = params.aiResult.chapters.filter(
      (c) =>
        (c.priority === "High" || c.priority === "Medium") && c.study_note
    );

    if (highMedChapters.length > 0) {
      doc.fontSize(14).fillColor("#D97706").text("Study Notes");
      doc.moveDown(0.5);

      highMedChapters.forEach((chapter) => {
        const color = priorityColors[chapter.priority] || "#374151";
        const badge = chapter.priority === "High" ? "HIGH PRIORITY" : "MEDIUM PRIORITY";

        doc.fontSize(12).fillColor("#1F2937").text(chapter.chapter_name, {
          continued: true,
        });
        doc
          .fontSize(9)
          .fillColor(color)
          .text(`  [${badge}]`);

        doc.moveDown(0.3);

        if (chapter.study_note) {
          doc
            .fontSize(10)
            .fillColor("#4B5563")
            .text(chapter.study_note, { width: 495 });
        }

        doc.moveDown(0.8);
      });
    }

    // Overall strategy tip
    doc.moveDown(0.5);
    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .strokeColor("#E5E7EB")
      .stroke();
    doc.moveDown(1);

    doc.fontSize(14).fillColor("#D97706").text("Exam Strategy Tip");
    doc.moveDown(0.5);
    doc
      .fontSize(11)
      .fillColor("#374151")
      .text(params.aiResult.overall_strategy_tip, { width: 495 });

    doc.moveDown(2);
    doc
      .fontSize(9)
      .fillColor("#9CA3AF")
      .text("Generated by Smart Study Guide — Study Smart, Score More!", {
        align: "center",
      });

    doc.end();

    stream.on("finish", () => resolve(fileName));
    stream.on("error", reject);
  });
}
