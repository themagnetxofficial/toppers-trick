import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import { logger } from "./logger";
import { transcribeImagesWithVision } from "./openai";

// Match the threshold enforced before an analysis can continue. Sparse PDF
// metadata from a scanned page must not prevent vision transcription, but a
// short document with usable selectable text should stay local.
const MINIMUM_USABLE_EMBEDDED_TEXT_LENGTH = 50;
const MINIMUM_MEANINGFUL_EMBEDDED_TEXT_LENGTH = 30;
const PDF_RENDER_WIDTH = 1600;
const PDF_PAGE_PLACEHOLDER_PATTERN = /^\s*--\s+\d+\s+of\s+\d+\s+--\s*$/gmu;

export interface TextExtractionProgress {
  fileIndex: number;
  fileCount: number;
  fileName: string;
  current: number;
  total: number;
}

type TextExtractionProgressReporter = (
  progress: TextExtractionProgress,
) => void | Promise<void>;

function hasMeaningfulEmbeddedText(text: string): boolean {
  const withoutPagePlaceholders = text.replace(PDF_PAGE_PLACEHOLDER_PATTERN, "");
  const meaningfulCharacterCount = withoutPagePlaceholders.replace(
    /[^\p{L}\p{N}]+/gu,
    "",
  ).length;
  return meaningfulCharacterCount >= MINIMUM_MEANINGFUL_EMBEDDED_TEXT_LENGTH;
}

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

/**
 * Count uploaded pages from cheap PDF metadata only. This helper is kept
 * separate from extraction so pricing never renders pages or invokes OCR.
 */
export async function getTotalPageCount(filePaths: string[]): Promise<number> {
  let total = 0;

  for (const filePath of filePaths) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== ".pdf") {
      total += 1;
      continue;
    }

    let parser: PDFParse | null = null;
    try {
      parser = new PDFParse({ data: fs.readFileSync(filePath) });
      const info = await parser.getInfo();
      total += info.total;
    } catch (err) {
      logger.warn(
        { err, filePath },
        "Could not read PDF page count; counting as 1 page",
      );
      total += 1;
    } finally {
      await parser?.destroy().catch(() => undefined);
    }
  }

  return total;
}

export function getCreditsForPageCount(totalPages: number): number {
  if (totalPages > 40) return 3;
  if (totalPages >= 20) return 2;
  return 1;
}

/**
 * Render image-only PDF pages with pdf-parse's in-process renderer, then have
 * OpenAI vision transcribe them in stable page order. This intentionally does
 * not launch Poppler or a local OCR worker, which are unavailable under the
 * Hostinger process limit.
 */
async function transcribeScannedPdfWithVision(
  filePath: string,
  onPageComplete?: (current: number, total: number) => void | Promise<void>,
): Promise<string> {
  let parser: PDFParse | null = null;

  try {
    parser = new PDFParse({ data: fs.readFileSync(filePath) });
    const info = await parser.getInfo();
    const pages: Array<{
      data: Buffer;
      mimeType: "image/png";
      label: string;
    }> = [];

    for (let pageNumber = 1; pageNumber <= info.total; pageNumber += 1) {
      const screenshot = await parser.getScreenshot({
        partial: [pageNumber],
        desiredWidth: PDF_RENDER_WIDTH,
      });
      const page = screenshot.pages[0]?.data;

      if (!(page instanceof Uint8Array) || page.length === 0) {
        throw new Error(
          `Could not render page ${pageNumber} of ${path.basename(filePath)} for vision transcription.`,
        );
      }

      pages.push({
        data: Buffer.from(page),
        mimeType: "image/png",
        label: `${path.basename(filePath)}, page ${pageNumber}`,
      });
    }

    if (pages.length === 0) {
      throw new Error(`No pages could be rendered from ${path.basename(filePath)}.`);
    }

    logger.info(
      { filePath, pages: pages.length },
      "Sending image-only PDF pages to OpenAI vision for transcription",
    );
    let completedPages = 0;
    let progressChain = Promise.resolve();
    const transcriptionOptions = onPageComplete
      ? {
          batchSize: 2,
          onImageComplete: () => {
            completedPages += 1;
            progressChain = progressChain.then(() =>
              onPageComplete(completedPages, pages.length),
            );
            return progressChain;
          },
        }
      : { batchSize: 2 };

    return transcriptionOptions
      ? await transcribeImagesWithVision(pages, transcriptionOptions)
      : await transcribeImagesWithVision(pages);
  } finally {
    await parser?.destroy().catch(() => undefined);
  }
}

async function transcribeImageWithVision(
  filePath: string,
  onPageComplete?: (current: number, total: number) => void | Promise<void>,
): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : "image/jpeg";

  logger.info({ filePath }, "Sending uploaded image to OpenAI vision for transcription");
  const transcriptionOptions = onPageComplete
    ? {
        onImageComplete: () => onPageComplete(1, 1),
      }
    : undefined;
  const image = {
    data: fs.readFileSync(filePath),
    mimeType,
    label: path.basename(filePath),
  } as const;
  return transcriptionOptions
    ? transcribeImagesWithVision([image], transcriptionOptions)
    : transcribeImagesWithVision([image]);
}

export async function extractTextFromFile(
  filePath: string,
  onProgress?: (current: number, total: number) => void | Promise<void>,
): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    const text = await extractTextViaPdfParse(filePath);
    if (hasMeaningfulEmbeddedText(text)) {
      await onProgress?.(1, 1);
      return text;
    }

    logger.info(
      { filePath, textLen: text.length },
      "PDF has little/no selectable text — using OpenAI vision transcription",
    );
    return transcribeScannedPdfWithVision(filePath, onProgress);
  }

  if ([".jpg", ".jpeg", ".png"].includes(ext)) {
    return transcribeImageWithVision(filePath, onProgress);
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
  filePaths: string[],
  options: { onProgress?: TextExtractionProgressReporter } = {},
): Promise<{
  text: string;
  yearLabels: string[];
  papers: Array<{ label: string; text: string }>;
  extractedCharacterCount: number;
}> {
  await Promise.all(
    filePaths.map((filePath, fileIndex) =>
      options.onProgress?.({
        fileIndex,
        fileCount: filePaths.length,
        fileName: path.basename(filePath),
        current: 0,
        total: 0,
      }),
    ),
  );
  const texts = await Promise.all(
    filePaths.map((filePath, fileIndex) =>
      extractTextFromFile(filePath, (current, total) =>
        options.onProgress?.({
          fileIndex,
          fileCount: filePaths.length,
          fileName: path.basename(filePath),
          current,
          total,
        }),
      ),
    ),
  );
  const yearLabels = filePaths.map((_, i) => `Paper ${i + 1}`);
  const papers = texts.map((text, i) => ({
    label: yearLabels[i],
    text: text.trim(),
  }));
  const labeled = texts.map(
    (text, i) =>
      `--- Year: Paper ${i + 1} ---\n\n${text.trim() || "(No text extracted from this file)"}`,
  );
  return {
    text: labeled.join("\n\n"),
    yearLabels,
    papers,
    extractedCharacterCount: texts.reduce((total, text) => total + text.trim().length, 0),
  };
}