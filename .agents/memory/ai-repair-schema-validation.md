---
name: AI repair schema validation
description: Compact AI repair patches must be schema-validated before they are merged or persisted.
---

Repair responses are patches, not trusted complete analysis results. Validate every added or replaced topic against the public response schema before merging. Normalize safe top-level and topic metadata before strict validation; if topics are absent, empty, or still structurally incomplete, preserve the raw response and allow exactly one grounded repair against an explicitly empty accepted baseline.

**Why:** Long multi-paper runs have returned valid JSON with missing topic fields and, separately, missing top-level fields. Rejecting the envelope before bounded topic recovery causes a refundable failure despite successful paper extraction.

**How to apply:** Restore only non-grounding metadata such as subject, priority/confidence defaults, frequency derived from cited papers, marks text, question-type placeholders, and empty key-term arrays. Never synthesize topic names, paper evidence, or missing study-note sections. Apply the same bounded normalization to initial and repair topics, mark recovered results degraded, and fail if strict source verification still leaves no usable topic.