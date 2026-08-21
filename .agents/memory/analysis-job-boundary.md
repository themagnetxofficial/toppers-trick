---
name: Background analysis boundary
description: Request/processing boundary and shared concurrency policy for paper analyses.
---

Create and retry endpoints must acknowledge the `processing` analysis before dispatching OCR, AI analysis, or PDF generation. File extraction and OpenAI vision calls use shared, bounded concurrency while preserving the uploaded paper and page order.

**Why:** Multi-paper scanned uploads can take longer than a proxy request window. Starting expensive work on the request path risks gateway timeouts, while unconstrained parallel rendering or vision calls risks Hostinger capacity and upstream rate limits.

**How to apply:** Keep the acknowledgement path limited to validation, credit/database changes, and a small processing response. Any future OCR or document-processing work must use the shared limits rather than adding unbounded `Promise.all` calls.