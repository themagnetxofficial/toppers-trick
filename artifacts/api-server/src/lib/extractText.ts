import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { logger } from "./logger";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Text-based PDF: use pdftotext (poppler) — fast, no API issues
// ---------------------------------------------------------------------------
async function extractTextViaPdfToText(filePath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("pdftotext", ["-layout", filePath, "-"]);
    return stdout.trim();
  } catch (err) {
    logger.warn({ err, filePath }, "pdftotext failed");
    return "";
  }
}

// ---------------------------------------------------------------------------
// Scanned PDF: render each page to PPM with pdftoppm, then OCR with tesseract
// ---------------------------------------------------------------------------
async function extractTextViaOcrFromPdf(filePath: string): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "smartstudy-"));
  try {
    // Render all pages at 200 dpi (good balance of speed vs accuracy for A4 scans)
    await execFileAsync("pdftoppm", ["-r", "200", filePath, path.join(tmpDir, "page")]);

    const pages = fs
      .readdirSync(tmpDir)
      .filter((f) => f.endsWith(".ppm"))
      .sort(); // natural page order

    if (pages.length === 0) {
      logger.warn({ filePath }, "pdftoppm produced no pages");
      return "";
    }

    logger.info({ filePath, pages: pages.length }, "Running OCR on scanned PDF pages");

    // Run tesseract on each page sequentially to avoid worker memory spikes
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    const texts: string[] = [];

    for (const page of pages) {
      const imgPath = path.join(tmpDir, page);
      const { data } = await worker.recognize(imgPath);
      if (data.text?.trim()) texts.push(data.text.trim());
    }

    await worker.terminate();
    return texts.join("\n\n");
  } catch (err) {
    logger.error({ err, filePath }, "OCR from scanned PDF failed");
    return "";
  } finally {
    // Clean up temp page images
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

// ---------------------------------------------------------------------------
// Image file: OCR directly with tesseract
// ---------------------------------------------------------------------------
async function extractFromImage(filePath: string): Promise<string> {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    const { data } = await worker.recognize(filePath);
    await worker.terminate();
    return data.text?.trim() ?? "";
  } catch (err) {
    logger.error({ err, filePath }, "OCR extraction from image failed");
    return "";
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function extractTextFromFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    // Try fast text extraction first
    const text = await extractTextViaPdfToText(filePath);

    // Heuristic: if we got less than 100 meaningful chars it's likely a scanned PDF
    if (text.length < 100) {
      logger.info(
        { filePath, textLen: text.length },
        "PDF has little/no selectable text — falling back to OCR"
      );
      return extractTextViaOcrFromPdf(filePath);
    }

    return text;
  }

  if ([".jpg", ".jpeg", ".png"].includes(ext)) {
    return extractFromImage(filePath);
  }

  return "";
}

export async function extractTextFromFiles(filePaths: string[]): Promise<string> {
  const texts = await Promise.all(filePaths.map((fp) => extractTextFromFile(fp)));
  return texts.filter(Boolean).join("\n\n---\n\n");
}

/**
 * Extract text from each file separately, then combine with year labels so
 * the AI can track which questions appeared in which paper.
 */
export async function extractTextFromFilesWithLabels(
  filePaths: string[]
): Promise<{ text: string; yearLabels: string[] }> {
  const texts = await Promise.all(filePaths.map((fp) => extractTextFromFile(fp)));
  const yearLabels = filePaths.map((_, i) => `Paper ${i + 1}`);
  const labeled = texts.map(
    (t, i) => `--- Year: Paper ${i + 1} ---\n\n${t.trim() || "(No text extracted from this file)"}`
  );
  return {
    text: labeled.join("\n\n"),
    yearLabels,
  };
}
