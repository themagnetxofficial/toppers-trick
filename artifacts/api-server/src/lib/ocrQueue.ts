/**
 * Tesseract and PDF rendering are memory-intensive. One queue shared by the
 * API process prevents concurrent background analyses from competing for the
 * same small deployment container.
 */
let queueTail: Promise<void> = Promise.resolve();

export async function runInOcrQueue<T>(work: () => Promise<T>): Promise<T> {
  let releaseSlot!: () => void;
  const slot = new Promise<void>((resolve) => {
    releaseSlot = resolve;
  });
  const previous = queueTail;
  queueTail = slot;

  await previous;
  try {
    return await work();
  } finally {
    releaseSlot();
  }
}