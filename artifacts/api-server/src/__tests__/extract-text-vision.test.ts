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
    );
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

  it("extracts at most two uploaded papers at once and preserves their input order", async () => {
    const firstPaper = makeTemporaryFile(".jpg");
    const secondPaper = makeTemporaryFile(".jpg");
    const thirdPaper = makeTemporaryFile(".jpg");
    const pending: Array<{ label: string; resolve: (text: string) => void }> = [];

    transcribeImagesWithVision.mockImplementation(
      (images: Array<{ label: string }>) =>
        new Promise<string>((resolve) => {
          pending.push({ label: images[0]!.label, resolve });
        }),
    );

    const extraction = extractTextFromFilesWithLabels([
      firstPaper,
      secondPaper,
      thirdPaper,
    ]);

    await vi.waitFor(() => expect(transcribeImagesWithVision).toHaveBeenCalledTimes(2));
    const first = pending.find((item) => item.label === path.basename(firstPaper));
    const second = pending.find((item) => item.label === path.basename(secondPaper));
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    second!.resolve("Second paper text");
    await vi.waitFor(() => expect(transcribeImagesWithVision).toHaveBeenCalledTimes(3));
    const third = pending.find((item) => item.label === path.basename(thirdPaper));
    expect(third).toBeDefined();

    first!.resolve("First paper text");
    third!.resolve("Third paper text");

    await expect(extraction).resolves.toMatchObject({
      papers: [
        { label: "Paper 1", text: "First paper text" },
        { label: "Paper 2", text: "Second paper text" },
        { label: "Paper 3", text: "Third paper text" },
      ],
    });
  });

  it("shares the two-paper extraction limit across simultaneous analyses", async () => {
    const firstAnalysisPapers = [makeTemporaryFile(".jpg"), makeTemporaryFile(".jpg")];
    const secondAnalysisPapers = [makeTemporaryFile(".jpg"), makeTemporaryFile(".jpg")];
    const pending: Array<{ label: string; resolve: (text: string) => void }> = [];

    transcribeImagesWithVision.mockImplementation(
      (images: Array<{ label: string }>) =>
        new Promise<string>((resolve) => {
          pending.push({ label: images[0]!.label, resolve });
        }),
    );

    const firstExtraction = extractTextFromFilesWithLabels(firstAnalysisPapers);
    const secondExtraction = extractTextFromFilesWithLabels(secondAnalysisPapers);

    await vi.waitFor(() => expect(transcribeImagesWithVision).toHaveBeenCalledTimes(2));
    expect(pending).toHaveLength(2);

    pending[0]!.resolve("First result");
    pending[1]!.resolve("Second result");
    await vi.waitFor(() => expect(transcribeImagesWithVision).toHaveBeenCalledTimes(4));

    for (const item of pending.slice(2)) {
      item.resolve(`Result for ${item.label}`);
    }

    await expect(Promise.all([firstExtraction, secondExtraction])).resolves.toHaveLength(2);
  });
});

process.on("exit", () => {
  for (const filePath of temporaryFiles) fs.rmSync(filePath, { force: true });
});