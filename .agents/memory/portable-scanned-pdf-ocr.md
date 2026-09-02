---
name: Vision transcription for scanned papers
description: Rules for extracting selectable PDF text locally and transcribing scans through OpenAI vision.
---

Use `pdf-parse` for PDFs with usable embedded text, but measure meaningful letters/numbers after removing its page-number placeholders; image-only PDFs can otherwise look non-empty. For scans, render pages in-process and transcribe them through OpenAI vision in original order with explicit page markers. Send standalone JPG/JPEG/PNG uploads to vision directly. Do not add Poppler, Tesseract, language-model files, or local OCR workers back into the API.

**Why:** Managed hosting exhausted its process limit while spawning Poppler and Tesseract workers. In-process rendering plus sequential vision requests avoids host binaries and worker fan-out while keeping scanned papers usable.

**How to apply:** Keep the 50-character raw threshold for usable PDFs, plus a lower meaningful-character check after placeholder removal. Render scanned PDF pages at readable resolution, submit one page at a time using the low-cost vision model, reject output cut off by the provider, and pass the complete labeled paper to analysis. Never use a head/tail slice that silently removes middle questions.