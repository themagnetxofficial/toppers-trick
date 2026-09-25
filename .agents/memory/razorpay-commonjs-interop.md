---
name: Razorpay production dependencies
description: Hostinger-specific missing nested SDK packages and the payment build verification rule.
---

Bundle the Razorpay SDK and its dependencies into the server output rather than loading the package from production `node_modules` at runtime. Keep an isolated compiled-client smoke check outside workspace `node_modules`, including a mock order request that never reaches the network.

**Why:** The SDK is CommonJS and dynamic import yielded a constructor mismatch in production; switching to a runtime CommonJS load exposed missing `axios`, then `combined-stream` after promoting the next layer of dependencies. Both were present locally. Hostinger's packaging cannot be trusted to supply nested package dependencies. A local constructor check that runs beside installed dependencies did not detect this.

**How to apply:** After changing the SDK or bundler, verify the server output includes the SDK and its nested dependencies, then run the isolated build check with dummy credentials and an in-memory HTTP adapter. Do not claim a live payment succeeds until Hostinger serves the new build and an authorized user confirms the production flow.