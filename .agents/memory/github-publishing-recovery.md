---
name: GitHub publishing recovery
description: How to publish verified changes when the workspace Git HTTPS credential is no longer accepted.
---

When GitHub rejects the workspace's HTTPS remote credential but the Replit GitHub connection is healthy and has `repo` scope, publish through the connected GitHub REST API rather than handling a token.

**Why:** The command-line credential helper can become stale independently of the Replit GitHub OAuth connection. The API proxy refreshes authentication without exposing a credential.

**How to apply:** Before writing, read `main`'s ref and require the expected SHA so no newer remote work is overwritten. Create blobs/tree/commit and update the branch non-forcibly. Keep the local commit as the recovery point, and separately repair the command-line remote for future normal pushes.