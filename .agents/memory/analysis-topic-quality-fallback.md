---
name: Analysis topic-quality fallback
description: Hard two-call launch boundary for topic analysis quality checks and compact patching.
---

Analysis is hard-capped at two provider calls: one initial result and one compact patch. After the patch, ordinary topic-count or quality shortfalls remain advisory and return the best parseable result as degraded, but a result below 30% of the paper-count-specific minimum topic target is a hard failure.

**Why:** Strong patching and full regeneration caused expensive repair cascades and timeouts, while returning catastrophically sparse repaired guides risks presenting unusable study material. The narrow floor protects against that failure without reviving repair cascades for normal 14-16 topic shortfalls.

**How to apply:** Do not retry provider errors or malformed initial JSON within analysis, and do not add strong patches, full fallback, verification, or coverage repair. Apply the 30% floor only after the single repair has been validated; otherwise preserve the degraded-result path for non-catastrophic issues.