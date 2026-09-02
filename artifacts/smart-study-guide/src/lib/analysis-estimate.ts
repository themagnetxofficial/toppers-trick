export async function estimateTotalPages(files: File[]): Promise<number> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  let total = 0;
  for (const file of files) {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        total += pdf.numPages;
      } catch {
        total += 1;
      }
    } else {
      total += 1;
    }
  }
  return total;
}

export function getEstimatedCredits(totalPages: number): number {
  if (totalPages > 40) return 3;
  if (totalPages >= 20) return 2;
  return 1;
}

export function getEstimatedTimeLabel(totalPages: number): string {
  if (totalPages > 40) return "10-11 min";
  if (totalPages >= 20) return "7-9 min";
  return "5-6 min";
}