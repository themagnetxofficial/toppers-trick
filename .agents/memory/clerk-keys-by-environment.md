---
name: Clerk keys by environment
description: Environment separation and Vite exposure constraints for external Clerk keys.
---

Use the matching Clerk test instance in the Replit development preview and the live instance only in production builds. Inject exactly one publishable key from Vite configuration rather than referencing both keys in browser source.

**Why:** Clerk live keys reject Replit preview origins, while deriving a live key from the preview hostname points Clerk JS at a nonexistent host. Vite can also embed every `VITE_` variable when a dependency dynamically reads `import.meta.env`, so merely choosing between two browser variables can leak the test publishable key into production assets.

**How to apply:** Keep the API's publishable and secret keys environment-aware. Restrict Vite's client environment prefix allowlist and verify production JavaScript contains a live key prefix but no test key prefix after every auth configuration change.