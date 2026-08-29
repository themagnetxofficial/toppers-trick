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

import { extractTextFromFile } from "../lib/extractText";

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
});

process.on("exit", () => {
  for (const filePath of temporaryFiles) fs.rmSync(filePath, { force: true });
});