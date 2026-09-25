---
name: Razorpay CommonJS interop
description: Production-only constructor mismatch when loading the Razorpay SDK in the ESM API bundle.
---

Razorpay's installed Node SDK is CommonJS and exports its constructor directly via `module.exports`. Do not assume `.default` on a dynamic import resolves to the constructor in every production runtime; prefer Node's `createRequire(import.meta.url)` to load its direct CommonJS export from the ESM server bundle.

**Why:** A production payment-order attempt failed with "Razorpay is not a constructor" even though local Node returned a constructor from a dynamic import's default. Source-level tests did not exercise this path.

**How to apply:** When changing payment SDK loading or build configuration, check the actual package export and instantiate the client from the built server output with dummy values; no network request is necessary for this constructor check.

The production installer failed to make Razorpay's transitive `axios` dependency available even though pnpm had it in the lockfile. Keep `axios` as a direct runtime dependency of the API package rather than relying solely on transitive installation in this deployment environment.

**Why:** Once the CommonJS constructor loaded in production, order creation failed with "Cannot find module 'axios'"; the dependency was locked beneath Razorpay but was not declared by the API package.

**How to apply:** Preserve the API package's direct declaration through dependency upgrades, and verify its lockfile importer entry and installed module link when preparing production builds.