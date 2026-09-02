import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const {
  getText,
  getInfo,
  getScreenshot,
  destroy,
  transcribeImagesWithVision,
} = vi.hoisted(() => ({
  getText: vi.fn(),
  getInfo: vi.fn(),
  getScreenshot: vi.fn(),
  destroy: vi.fn(),
  transcribeImagesWithVision: vi.fn(),
}));

vi.mock("pdf-parse", () => ({
  PDFParse: class {
    getText = getText;
    getInfo = getInfo;
    getScreenshot = getScreenshot;
    destroy = destroy;
  },
}));

vi.mock("../lib/openai", () => ({ transcribeImagesWithVision }));

import {
  extractTextFromFile,
  extractTextFromFilesWithLabels,
  getCreditsForPageCount,
  getTotalPageCount,
} from "../lib/extractText";

const temporaryFiles: string[] = [];

function makeTemporaryFile(extension: ".pdf" | ".jpg" | ".png"): string {
  const filePath = path.join(
    os.tmpdir(),
    `vision-extraction-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`,
  );
  fs.writeFileSync(filePath, "test input");
  temporaryFiles.push(filePath);
  return filePath;
}

beforeEach(() => {
  vi.clearAllMocks();
  getText.mockResolvedValue({ text: "" });
  getInfo.mockResolvedValue({ total: 1 });
  getScreenshot.mockResolvedValue({ pages: [{ data: new Uint8Array([1, 2, 3]) }] });
  destroy.mockResolvedValue(undefined);
  transcribeImagesWithVision.mockResolvedValue("Question 1: Explain photosynthesis.");
});

describe("vision extraction fallback", () => {
  it.each([
    [19, 1],
    [20, 2],
    [40, 2],
    [41, 3],
  ])("charges %i pages at %i credit tier", (pages, credits) => {
    expect(getCreditsForPageCount(pages)).toBe(credits);
  });

  it("sums PDF metadata pages and counts images without rendering", async () => {
    const firstPdf = makeTemporaryFile(".pdf");
    const secondPdf = makeTemporaryFile(".pdf");
    const image = makeTemporaryFile(".png");
    getInfo
      .mockResolvedValueOnce({ total: 19 })
      .mockResolvedValueOnce({ total: 2 });

    await expect(getTotalPageCount([firstPdf, secondPdf, image])).resolves.toBe(22);
    expect(getInfo).toHaveBeenCalledTimes(2);
    expect(getScreenshot).not.toHaveBeenCalled();
    expect(transcribeImagesWithVision).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(2);
  });

  it("counts an unreadable PDF as one page", async () => {
    const filePath = makeTemporaryFile(".pdf");
    getInfo.mockRejectedValueOnce(new Error("invalid PDF"));

    await expect(getTotalPageCount([filePath])).resolves.toBe(1);
    expect(getScreenshot).not.toHaveBeenCalled();
    expect(transcribeImagesWithVision).not.toHaveBeenCalled();
  });

  it("keeps selectable-text PDFs on pdf-parse and bypasses vision", async () => {
    const filePath = makeTemporaryFile(".pdf");
    const embeddedText = "Question 1: ".repeat(12);
    getText.mockResolvedValueOnce({ text: embeddedText });

    await expect(extractTextFromFile(filePath)).resolves.toBe(embeddedText.trim());
    expect(transcribeImagesWithVision).not.toHaveBeenCalled();
    expect(getScreenshot).not.toHaveBeenCalled();
  });

  it("keeps short but usable selectable-text PDFs out of the vision fallback", async () => {
    const filePath = makeTemporaryFile(".pdf");
    const embeddedText = "Question 1: Define the law of demand and give one example.";
    expect(embeddedText.length).toBeGreaterThanOrEqual(50);
    expect(embeddedText.length).toBeLessThan(100);
    getText.mockResolvedValueOnce({ text: embeddedText });

    await expect(extractTextFromFile(filePath)).resolves.toBe(embeddedText);
    expect(transcribeImagesWithVision).not.toHaveBeenCalled();
    expect(getScreenshot).not.toHaveBeenCalled();
  });

  it("does not mistake pdf-parse page placeholders for usable paper text", async () => {
    const filePath = makeTemporaryFile(".pdf");
    getText.mockResolvedValueOnce({
      text: "-- 1 of 31 --\n\n-- 2 of 31 --\n\n-- 31 of 31 --",
    });

    await expect(extractTextFromFile(filePath)).resolves.toContain("photosynthesis");
    expect(getScreenshot).toHaveBeenCalledWith({
      partial: [1],
      desiredWidth: 1600,
    });
    expect(transcribeImagesWithVision).toHaveBeenCalled();
  });

  it("renders every image-only PDF page in order and sends PNGs to vision", async () => {
    const filePath = makeTemporaryFile(".pdf");
    getInfo.mockResolvedValueOnce({ total: 3 });
    getScreenshot
      .mockResolvedValueOnce({ pages: [{ data: new Uint8Array([1]) }] })
      .mockResolvedValueOnce({ pages: [{ data: new Uint8Array([2]) }] })
      .mockResolvedValueOnce({ pages: [{ data: new Uint8Array([3]) }] });

    await expect(extractTextFromFile(filePath)).resolves.toContain("photosynthesis");
    expect(getScreenshot).toHaveBeenNthCalledWith(1, {
      partial: [1],
      desiredWidth: 1600,
    });
    expect(getScreenshot).toHaveBeenNthCalledWith(3, {
      partial: [3],
      desiredWidth: 1600,
    });
    expect(transcribeImagesWithVision).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ mimeType: "image/png", label: expect.stringContaining("page 1") }),
        expect.objectContaining({ mimeType: "image/png", label: expect.stringContaining("page 2") }),
        expect.objectContaining({ mimeType: "image/png", label: expect.stringContaining("page 3") }),
      ]),
       expect.objectContaining({ batchSize: 2 }),
    );
  });

  it("extracts files concurrently while preserving paper order and progress metadata", async () => {
    const firstFile = makeTemporaryFile(".png");
    const secondFile = makeTemporaryFile(".jpg");
    const progress: Array<{
      fileIndex: number;
      fileName: string;
      current: number;
      total: number;
    }> = [];

    transcribeImagesWithVision.mockImplementation(
      async (
        images: Array<{ label: string }>,
        options?: { onImageComplete?: () => void | Promise<void> },
      ) => {
        const label = images[0]!.label;
        if (label === path.basename(firstFile)) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        await options?.onImageComplete?.();
        return `Transcribed ${label}`;
      },
    );

    const result = await extractTextFromFilesWithLabels(
      [firstFile, secondFile],
      {
        onProgress: async ({ fileIndex, fileName, current, total }) => {
          progress.push({ fileIndex, fileName, current, total });
        },
      },
    );

    expect(result.papers).toEqual([
      { label: "Paper 1", text: `Transcribed ${path.basename(firstFile)}` },
      { label: "Paper 2", text: `Transcribed ${path.basename(secondFile)}` },
    ]);
    expect(progress.slice(0, 2)).toEqual([
      { fileIndex: 0, fileName: path.basename(firstFile), current: 0, total: 0 },
      { fileIndex: 1, fileName: path.basename(secondFile), current: 0, total: 0 },
    ]);
    expect(progress).toContainEqual({
      fileIndex: 0,
      fileName: path.basename(firstFile),
      current: 1,
      total: 1,
    });
    expect(progress).toContainEqual({
      fileIndex: 1,
      fileName: path.basename(secondFile),
      current: 1,
      total: 1,
    });
  });

  it.each([".jpg", ".png"] as const)(
    "sends uploaded %s files directly to vision",
    async (extension) => {
      const filePath = makeTemporaryFile(extension);

      await expect(extractTextFromFile(filePath)).resolves.toContain("photosynthesis");
      expect(getText).not.toHaveBeenCalled();
      expect(transcribeImagesWithVision).toHaveBeenCalledWith([
        expect.objectContaining({
          mimeType: extension === ".png" ? "image/png" : "image/jpeg",
          label: path.basename(filePath),
        }),
      ]);
    },
  );

  it("fails explicitly when a scanned PDF page cannot be rendered", async () => {
    const filePath = makeTemporaryFile(".pdf");
    getScreenshot.mockResolvedValueOnce({ pages: [] });

    await expect(extractTextFromFile(filePath)).rejects.toThrow("Could not render page 1");
    expect(transcribeImagesWithVision).not.toHaveBeenCalled();
  });
});

process.on("exit", () => {
  for (const filePath of temporaryFiles) fs.rmSync(filePath, { force: true });
});