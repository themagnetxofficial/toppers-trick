---
name: Multi-paper AI coverage
description: Rules for ensuring exam analysis compares every uploaded paper instead of overfitting to the first file.
---

For multi-paper analysis, keep each uploaded paper as its own labeled AI input block with a per-paper budget. Never apply one global prefix truncation to the combined corpus, and treat the uploaded paper labels as authoritative in the stored result.

**Why:** A global character cut can be consumed entirely by the first long PDF, causing the model to receive or report only that paper while the UI still implies a multi-year comparison.

**How to apply:** Any future prompt or extraction change must retain every paper label, include a separate bounded block per paper, and display complete paper coverage in the result. Normalize model-reported coverage against the actual uploaded labels.