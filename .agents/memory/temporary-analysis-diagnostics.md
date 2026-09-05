---
name: Temporary analysis diagnostics
description: Governs which analysis stages may persist temporary underlying-error details.
---

Temporary underlying-error diagnostics must remain limited to unexpected text-extraction/OCR failures. Do not enable them for AI-analysis failures unless the user explicitly instructs you to do so.

**Why:** The AI-analysis extension was temporary investigation instrumentation and was explicitly reverted as the final diagnostic change of the session. AI failures should return the normal sanitized, refund-aware message.

**How to apply:** When changing analysis failure handling or tests, preserve OCR-only diagnostic behavior and sanitized AI-analysis errors. Treat any future AI diagnostic extension as opt-in work requiring direct user approval.