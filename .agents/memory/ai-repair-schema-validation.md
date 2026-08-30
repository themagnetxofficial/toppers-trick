---
name: AI repair schema validation
description: Compact AI repair patches must be schema-validated before they are merged or persisted.
---

Repair responses are patches, not trusted complete analysis results. Validate every added or replaced topic against the public response schema before merging. Normalize safe top-level metadata before strict validation; if topics are absent, empty, or all structurally incomplete, preserve the raw response and allow exactly one grounded repair against an explicitly empty accepted baseline.

**Why:** Long multi-paper runs have returned valid JSON with missing topic fields and, separately, missing top-level fields. Rejecting the envelope before bounded topic recovery causes a refundable failure despite successful paper extraction.

**How to apply:** Restore only non-grounding metadata such as the submitted subject and a strategy built from grounded topic names. Preserve valid baseline topics, discard incomplete repair additions, and mark recovered results degraded. With no usable initial topics, repair only from uploaded paper text and fail clearly if no schema-valid grounded topic can be recovered.