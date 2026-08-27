---
name: Analysis topic-quality fallback
description: Hard two-call launch boundary for topic analysis quality checks and compact patching.
---

For launch, analysis is hard-capped at two provider calls: one initial result and one compact patch. Any remaining topic-count or quality shortfall is advisory and the best parseable result must be returned.

**Why:** Strong patching and full regeneration caused expensive repair cascades and timeouts. Real-paper tests showed the two-call cap eliminated analysis-quality failures/refunds even when only 14-16 topics survived.

**How to apply:** Do not retry provider errors or malformed initial JSON within analysis, and do not add strong patches, full fallback, verification, or coverage repair. Fail only for operational/unparseable responses; improve coverage later through safer means.