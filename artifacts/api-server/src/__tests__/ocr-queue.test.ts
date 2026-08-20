import { describe, expect, it } from "vitest";
import { runInOcrQueue } from "../lib/ocrQueue";

describe("OCR queue", () => {
  it("runs concurrent OCR jobs one at a time", async () => {
    let activeJobs = 0;
    let highestActiveJobs = 0;
    const startOrder: number[] = [];

    await Promise.all(
      [1, 2, 3].map((job) =>
        runInOcrQueue(async () => {
          startOrder.push(job);
          activeJobs += 1;
          highestActiveJobs = Math.max(highestActiveJobs, activeJobs);
          await new Promise((resolve) => setTimeout(resolve, 5));
          activeJobs -= 1;
        }),
      ),
    );

    expect(startOrder).toEqual([1, 2, 3]);
    expect(highestActiveJobs).toBe(1);
  });
});