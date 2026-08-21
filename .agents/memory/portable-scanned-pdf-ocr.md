---
name: Vision transcription for scanned papers
description: Rules for extracting selectable PDF text locally and transcribing scans through OpenAI vision.
---

Use `pdf-parse` for PDFs with usable embedded text. For image-only PDFs, render pages in-process and transcribe them through OpenAI vision in original page order. Send standalone JPG/JPEG/PNG uploads to vision directly. Do not add Poppler, Tesseract, language-model files, or local OCR workers back into the API.

**Why:** Managed hosting exhausted its process limit while spawning Poppler and Tesseract workers. In-process rendering plus sequential vision requests avoids host binaries and worker fan-out while keeping scanned papers usable.

**How to apply:** Preserve the 50-character usable-embedded-text threshold that matches analysis validation. Render scanned PDF pages at readable resolution, submit one page at a time using the low-cost vision model, and keep failures explicit so the existing refund/retry flow handles them.