---
name: Workspace typecheck declarations
description: Refreshing generated workspace declarations when cross-package schema changes are not visible to TypeScript
---

When API typecheck reports that fields already present in a workspace package's source schema do not exist, rebuild that package's declarations before changing application code.

**Why:** The monorepo API compiler can resolve an older declaration output from a workspace package even while its TypeScript source has the current schema. Treating the stale declaration as an application defect leads to unnecessary casts or duplicate schema edits.

**How to apply:** Rebuild the affected workspace package with its TypeScript project configuration, then rerun the dependent package's typecheck and build. Keep generated declaration output out of the feature diff unless the repository explicitly tracks it.