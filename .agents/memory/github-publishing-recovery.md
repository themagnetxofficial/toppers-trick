---
name: GitHub publishing recovery
description: How to publish verified changes when the workspace Git HTTPS credential is no longer accepted.
---

When GitHub rejects the workspace Git HTTPS credential but the Replit GitHub connection is healthy and has repository scope, publish through the connected GitHub REST API rather than handling a token.

**Why:** The command-line credential helper can become stale independently of the Replit GitHub OAuth connection. The API proxy refreshes authentication without exposing a credential.

**How to apply:** Read `main`'s ref immediately before writing, require its expected SHA, create blobs/tree/commit with that SHA as the only parent, then update the branch with `force: false`. Verify the final ref points to the newly-created commit.

If the connector sandbox rejects a large combined write payload during durable replay, split the Git-data flow into small API calls: create blobs, create the tree, then create and update the commit. Keep each branch update guarded by a fresh ref check.

**Why:** The connector may reject an oversized or complex replay payload before it reaches GitHub, even though the authenticated API itself is healthy.

**How to apply:** Do not retry a force push or expose a token. Use the existing authenticated connection, confirm the remote SHA again before the final commit/ref call, and verify the branch after it succeeds.