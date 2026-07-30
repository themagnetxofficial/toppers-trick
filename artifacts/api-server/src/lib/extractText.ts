import fs from "fs";
import path from "path";
import { logger } from "./logger";

export async function extractTextFromFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    return extractFromPdf(filePath);
  } else if ([".jpg", ".jpeg", ".png"].includes(ext)) {
    return extractFromImage(filePath);
  }

  return "";
}

async function extractFromPdf(filePath: string): Promise<string> {
  try {
    // Dynamic import to avoid ESM issues
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = (pdfParseModule as any).default ?? pdfParseModule;
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    const text = data.text?.trim() ?? "";

    // If PDF text extraction yields little text, it might be a scanned PDF
    if (text.length < 100) {
      logger.info({ filePath }, "PDF text extraction yielded little text, may be scanned");
      return text; // Return what we have
    }

    return text;
  } catch (err) {
    logger.error({ err, filePath }, "PDF text extraction failed");
    return "";
  }
}

async function extractFromImage(filePath: string): Promise<string> {
  try {
    // Dynamic import tesseract.js
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    const { data } = await worker.recognize(filePath);
    await worker.terminate();
    return data.text?.trim() ?? "";
  } catch (err) {
    logger.error({ err, filePath }, "OCR extraction failed");
    return "";
  }
}

export async function extractTextFromFiles(
  filePaths: string[]
): Promise<string> {
  const texts = await Promise.all(
    filePaths.map((fp) => extractTextFromFile(fp))
  );
  return texts.filter(Boolean).join("\n\n---\n\n");
}
