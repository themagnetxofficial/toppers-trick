---
name: Temporary analysis diagnostics
description: Governs which analysis stages may persist temporary underlying-error details.
---

Temporary underlying-error diagnostics must remain limited to unexpected text-extraction/OCR failures. Do not enable them for AI-analysis failures unless the user explicitly instructs you to do so.

**Why:** An AI-analysis diagnostic showed a production failure was the intentional catastrophic-quality floor for genuinely thin AI output, not a payment build regression. Underlying errors are owner-visible, so leaving this temporary extension enabled would expose unnecessary technical detail.

**How to apply:** Preserve OCR-only diagnostics and sanitized, refund-aware AI-analysis errors. Investigate quality-floor failures as content-quality outcomes before attributing them to deployment tooling.