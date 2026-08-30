---
name: AI repair schema validation
description: Compact AI repair patches must be schema-validated before they are merged or persisted.
---

Repair responses are patches, not trusted complete analysis results. Validate every added or replaced topic against the public response schema before merging; otherwise a partial topic can be saved successfully and make the result endpoint fail later.

**Why:** A long multi-paper run produced topics missing required fields. The background job persisted them, and the strict result serializer returned HTTP 500 instead of a usable analysis state.

**How to apply:** Preserve valid baseline topics, discard incomplete repair additions, and mark the result degraded when quality remains incomplete. Keep a read-time compatibility path for already-persisted malformed rows.