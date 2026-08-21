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
  it("uses gpt-5-nano and sends one labeled image at a time", async () => {
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

    expect(text).toBe("1. Define the law of demand.\n\n1. Define the law of demand.");
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

  it("rejects an empty vision response instead of treating it as usable text", async () => {
    create.mockResolvedValueOnce({ choices: [{ message: { content: "" } }] });

    await expect(
      transcribeImagesWithVision([
        {
          data: Buffer.from("image"),
          mimeType: "image/png",
          label: "page 1",
        },
      ]),
    ).rejects.toThrow("returned no transcription");
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
    ).resolves.toBe("Recovered transcription.");
    expect(create).toHaveBeenCalledTimes(2);
  });
});