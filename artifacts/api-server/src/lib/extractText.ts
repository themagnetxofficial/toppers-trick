import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { PDFParse } from "pdf-parse";
import { logger } from "./logger";
import { runInOcrQueue } from "./ocrQueue";

const execFileAsync = promisify(execFile);
const MINIMUM_TEXT_LENGTH = 100;
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const OCR_LANGUAGE_DATA_DIRS = [
  path.resolve(process.cwd(), "assets", "tessdata"),
  path.resolve(process.cwd(), "dist", "tessdata"),
  path.resolve(MODULE_DIR, "tessdata"),
];

function getBundledOcrLanguageDataDir(): string {
  const languageDataDir = OCR_LANGUAGE_DATA_DIRS.find((directory) =>
    fs.existsSync(path.join(directory, "eng.traineddata.gz")),
  );

  if (!languageDataDir) {
    throw new Error(
      `Bundled English OCR data is missing. Checked: ${OCR_LANGUAGE_DATA_DIRS.join(", ")}`,
    );
  }

  return languageDataDir;
}

async function createBundledOcrWorker() {
  const { createWorker } = await import("tesseract.js");

  // Do not download language data from a CDN during an analysis. Production
  // hosts can block or time out that request, which previously left image-only
  // PDFs with no usable text despite their pages being readable.
  return createWorker("eng", 1, {
    langPath: getBundledOcrLanguageDataDir(),
    gzip: true,
    cacheMethod: "none",
  });
}

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

/**
 * pdf-parse packages a Node-compatible PDF renderer, so this path continues
 * to work on hosts that do not provide Poppler command-line tools.
 */
async function extractTextViaPdfParse(filePath: string): Promise<string> {
  let parser: PDFParse | null = null;

  try {
    parser = new PDFParse({ data: fs.readFileSync(filePath) });
    const result = await parser.getText();
    return result.text.trim();
  } catch (err) {
    logger.warn({ err, filePath }, "pdf-parse text extraction failed");
    return "";
  } finally {
    await parser?.destroy().catch(() => undefined);
  }
}

async function recognizeImagesWithOcr(
  images: Array<string | Buffer>,
  filePath: string,
): Promise<string> {
  const worker = await createBundledOcrWorker();

  try {
    const texts: string[] = [];
    for (const image of images) {
      const { data } = await worker.recognize(image);
      if (data.text?.trim()) texts.push(data.text.trim());
    }
    return texts.join("\n\n");
  } finally {
    await worker.terminate();
  }
}

async function recognizeRenderedPdfPages(
  parser: PDFParse,
  pageCount: number,
  filePath: string,
): Promise<string> {
  const worker = await createBundledOcrWorker();

  try {
    const texts: string[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const screenshot = await parser.getScreenshot({
        partial: [pageNumber],
        scale: 1.8,
      });
      const page = screenshot.pages[0]?.data;

      if (!(page instanceof Uint8Array)) {
        logger.warn({ filePath, pageNumber }, "PDF page could not be rendered for OCR");
        continue;
      }

      const { data } = await worker.recognize(Buffer.from(page));
      if (data.text?.trim()) texts.push(data.text.trim());
    }

    return texts.join("\n\n");
  } finally {
    await worker.terminate();
  }
}

// ---------------------------------------------------------------------------
// Scanned PDF: render pages with pdf-parse, then OCR with tesseract.
// This has no dependency on Hostinger-provided system binaries.
// ---------------------------------------------------------------------------
async function extractTextViaPdfParseOcr(filePath: string): Promise<string> {
  return runInOcrQueue(async () => {
    let parser: PDFParse | null = null;

    try {
      parser = new PDFParse({ data: fs.readFileSync(filePath) });
      const info = await parser.getInfo();
      logger.info(
        {
          filePath,
          pages: info.total,
        },
        "Running OCR on PDF pages rendered by pdf-parse",
      );
      return await recognizeRenderedPdfPages(parser, info.total, filePath);
    } catch (err) {
      logger.error({ err, filePath }, "OCR from pdf-parse PDF pages failed");
      throw err;
    } finally {
      await parser?.destroy().catch(() => undefined);
    }
  });
}

// Legacy fallback for hosts where the bundled renderer is unavailable.
async function extractTextViaPopplerOcr(filePath: string): Promise<string> {
  return runInOcrQueue(async () => {
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

      return await recognizeImagesWithOcr(
        pages.map((page) => path.join(tmpDir, page)),
        filePath,
      );
    } catch (err) {
      logger.error({ err, filePath }, "OCR from scanned PDF failed");
      throw err;
    } finally {
      // Clean up temp page images
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Image file: OCR directly with tesseract
// ---------------------------------------------------------------------------
async function extractFromImage(filePath: string): Promise<string> {
  return runInOcrQueue(async () => {
    try {
      return await recognizeImagesWithOcr([filePath], filePath);
    } catch (err) {
      logger.error({ err, filePath }, "OCR extraction from image failed");
      throw err;
    }
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function extractTextFromFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    // Try fast text extraction first
    const popplerText = await extractTextViaPdfToText(filePath);

    // pdf-parse is a portable fallback for hosts without the Poppler binaries.
    const parsedText =
      popplerText.length < MINIMUM_TEXT_LENGTH
        ? await extractTextViaPdfParse(filePath)
        : "";
    const text =
      parsedText.length > popplerText.length ? parsedText : popplerText;

    // If neither text parser yields enough content, treat it as a scan and OCR
    // its rendered pages. The Poppler renderer remains a final backup only.
    if (text.length < MINIMUM_TEXT_LENGTH) {
      logger.info(
        { filePath, textLen: text.length },
        "PDF has little/no selectable text — falling back to OCR"
      );
      let renderedOcrError: unknown;
      try {
        const ocrText = await extractTextViaPdfParseOcr(filePath);
        if (ocrText) return ocrText;
      } catch (err) {
        renderedOcrError = err;
      }

      try {
        const fallbackOcrText = await extractTextViaPopplerOcr(filePath);
        if (fallbackOcrText) return fallbackOcrText;
      } catch (fallbackErr) {
        if (renderedOcrError instanceof Error) {
          throw new Error(
            `Both portable PDF OCR and the Poppler fallback failed for ${path.basename(filePath)}. ` +
              `Fallback error: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
            { cause: renderedOcrError },
          );
        }
        throw fallbackErr;
      }

      if (renderedOcrError) throw renderedOcrError;

      throw new Error(
        `OCR completed for ${path.basename(filePath)} but returned no readable text.`,
      );
    }

    return text;
  }

  if ([".jpg", ".jpeg", ".png"].includes(ext)) {
    return extractFromImage(filePath);
  }

  return "";
}

export async function extractTextFromFiles(filePaths: string[]): Promise<string> {
  const texts: string[] = [];
  for (const filePath of filePaths) {
    texts.push(await extractTextFromFile(filePath));
  }
  return texts.filter(Boolean).join("\n\n---\n\n");
}

/**
 * Extract text from each file separately, then combine with year labels so
 * the AI can track which questions appeared in which paper.
 */
export async function extractTextFromFilesWithLabels(
  filePaths: string[]
): Promise<{
  text: string;
  yearLabels: string[];
  papers: Array<{ label: string; text: string }>;
  extractedCharacterCount: number;
}> {
  const texts: string[] = [];
  for (const filePath of filePaths) {
    texts.push(await extractTextFromFile(filePath));
  }
  const yearLabels = filePaths.map((_, i) => `Paper ${i + 1}`);
  const papers = texts.map((text, i) => ({
    label: yearLabels[i],
    text: text.trim(),
  }));
  const labeled = texts.map(
    (t, i) => `--- Year: Paper ${i + 1} ---\n\n${t.trim() || "(No text extracted from this file)"}`
  );
  return {
    text: labeled.join("\n\n"),
    yearLabels,
    papers,
    extractedCharacterCount: texts.reduce((total, text) => total + text.trim().length, 0),
  };
}
