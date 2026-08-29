import { beforeEach, describe, expect, it, vi } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create } };
  },
}));

import { transcribeImagesWithVision } from "../lib/openai";

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  vi.clearAllMocks();
  create.mockResolvedValue({
    choices: [{ message: { content: "1. Define the law of demand." } }],
  });
});

describe("OpenAI vision transcription", () => {
  it("uses gpt-5-nano and includes every labeled image", async () => {
    const text = await transcribeImagesWithVision([
      {
        data: Buffer.from("first image"),
        mimeType: "image/png",
        label: "paper.pdf, page 1",
      },
      {
        data: Buffer.from("second image"),
        mimeType: "image/jpeg",
        label: "paper.jpg",
      },
    ]);

    expect(text).toBe(
      "--- OCR page 1: paper.pdf, page 1 ---\n1. Define the law of demand.\n\n" +
        "--- OCR page 2: paper.jpg ---\n1. Define the law of demand.",
    );
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        model: "gpt-5-nano",
        max_completion_tokens: 8192,
        messages: [
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({ type: "text", text: expect.stringContaining("paper.pdf, page 1") }),
              expect.objectContaining({
                type: "image_url",
                image_url: expect.objectContaining({
                  url: `data:image/png;base64,${Buffer.from("first image").toString("base64")}`,
                }),
              }),
            ]),
          }),
        ],
      }),
    );
  });

  it("limits concurrent vision calls and preserves input order when responses finish out of order", async () => {
    const pending: Array<{ label: string; resolve: (content: string) => void }> = [];
    create.mockImplementation((request) => {
      const content = request.messages[0].content;
      const prompt = content.find((item: { type: string }) => item.type === "text") as {
        text: string;
      };
      const label = prompt.text.match(/from (.+?), scanning/)?.[1] ?? "unknown";

      return new Promise((resolve) => {
        pending.push({
          label,
          resolve: (responseContent) =>
            resolve({ choices: [{ message: { content: responseContent } }] }),
        });
      });
    });

    const transcription = transcribeImagesWithVision([
      { data: Buffer.from("one"), mimeType: "image/png", label: "page 1" },
      { data: Buffer.from("two"), mimeType: "image/png", label: "page 2" },
      { data: Buffer.from("three"), mimeType: "image/png", label: "page 3" },
      { data: Buffer.from("four"), mimeType: "image/png", label: "page 4" },
    ]);

    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(3));
    expect(pending.map((item) => item.label)).toEqual(["page 1", "page 2", "page 3"]);

    pending.find((item) => item.label === "page 2")!.resolve("Second page");
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(4));
    expect(pending.map((item) => item.label)).toContain("page 4");

    pending.find((item) => item.label === "page 1")!.resolve("First page");
    pending.find((item) => item.label === "page 3")!.resolve("Third page");
    pending.find((item) => item.label === "page 4")!.resolve("Fourth page");

    await expect(transcription).resolves.toBe(
      "--- OCR page 1: page 1 ---\nFirst page\n\n" +
        "--- OCR page 2: page 2 ---\nSecond page\n\n" +
        "--- OCR page 3: page 3 ---\nThird page\n\n" +
        "--- OCR page 4: page 4 ---\nFourth page",
    );
  });

  it("retries an empty vision response before accepting recovered text", async () => {
    create.mockResolvedValueOnce({ choices: [{ message: { content: "" } }] });

    await expect(
      transcribeImagesWithVision([
        {
          data: Buffer.from("image"),
          mimeType: "image/png",
          label: "page 1",
        },
      ]),
    ).resolves.toBe("--- OCR page 1: page 1 ---\n1. Define the law of demand.");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not accept a vision page whose transcription was cut off", async () => {
    create.mockResolvedValue({
      choices: [
        {
          finish_reason: "length",
          message: { content: "Partial question text" },
        },
      ],
    });

    await expect(
      transcribeImagesWithVision([
        {
          data: Buffer.from("image"),
          mimeType: "image/png",
          label: "page 1",
        },
      ]),
    ).rejects.toThrow("transcription was cut off");
    expect(create).toHaveBeenCalledTimes(4);
  });

  it("uses the secondary vision model after both primary attempts return empty text", async () => {
    create
      .mockResolvedValueOnce({ choices: [{ message: { content: "" } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: "" } }] })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "Recovered by secondary OCR." } }],
      });

    await expect(
      transcribeImagesWithVision([
        {
          data: Buffer.from("image"),
          mimeType: "image/png",
          label: "page 1",
        },
      ]),
    ).resolves.toBe("--- OCR page 1: page 1 ---\nRecovered by secondary OCR.");

    expect(create).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ model: "gpt-4o-mini" }),
    );
  });

  it("retries one transient vision request failure before failing the paper", async () => {
    create
      .mockRejectedValueOnce(new Error("temporary network interruption"))
      .mockResolvedValueOnce({
        choices: [{ message: { content: "Recovered transcription." } }],
      });

    await expect(
      transcribeImagesWithVision([
        {
          data: Buffer.from("image"),
          mimeType: "image/png",
          label: "page 1",
        },
      ]),
    ).resolves.toBe("--- OCR page 1: page 1 ---\nRecovered transcription.");
    expect(create).toHaveBeenCalledTimes(2);
  });
});