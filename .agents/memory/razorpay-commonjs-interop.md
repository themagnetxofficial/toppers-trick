---
name: Razorpay CommonJS interop
description: Production-only constructor mismatch when loading the Razorpay SDK in the ESM API bundle.
---

Razorpay's installed Node SDK is CommonJS and exports its constructor directly via `module.exports`. Do not assume `.default` on a dynamic import resolves to the constructor in every production runtime; prefer Node's `createRequire(import.meta.url)` to load its direct CommonJS export from the ESM server bundle.

**Why:** A production payment-order attempt failed with "Razorpay is not a constructor" even though local Node returned a constructor from a dynamic import's default. Source-level tests did not exercise this path.

**How to apply:** When changing payment SDK loading or build configuration, check the actual package export and instantiate the client from the built server output with dummy values; no network request is necessary for this constructor check.