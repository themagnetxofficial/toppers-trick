---
name: Temporary analysis diagnostics
description: Governs which analysis stages may persist temporary underlying-error details.
---

Temporary underlying-error diagnostics should be enabled for a specific failure stage only with explicit user instruction. They are not a default for AI-analysis failures.

**Why:** A prior AI-analysis extension was reverted when no longer needed. These diagnostics expose underlying errors to analysis owners, so broadening them should remain a deliberate, short-lived debugging choice.

**How to apply:** When investigating a production-only failure, keep any explicitly requested extension limited to the selected stages; restore sanitized, refund-aware messages once the failure is diagnosed.