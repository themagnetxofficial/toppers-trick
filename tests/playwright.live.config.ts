/**
 * Playwright config — LIVE / real-API suite.
 *
 * Hits the real API server: real upload, real OpenAI analysis, real PDF.
 * Requires ALL of the following to be configured (as Replit secrets):
 *   CLERK_SECRET_KEY  — so global-setup can create a Clerk test user and
 *                       save browser auth state to .auth/user.json
 *   DATABASE_URL      — auto-provided in the Replit workspace
 *   OPENAI_API_KEY    — auto-provided in the Replit workspace
 *
 * The web app and API server workflows must both be running.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=https://<replit-dev-domain> \
 *     pnpm --filter @workspace/tests test:e2e:live
 */
import path from "path";
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const AUTH_STATE = path.join(__dirname, ".auth", "user.json");

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/flow.live.spec.ts"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "html",

  // Default per-test timeout — individual tests may override this.
  // The live AI-analysis test sets its own 3-minute timeout.
  timeout: 60_000,

  use: {
    baseURL: BASE_URL,
    // Every test in this suite starts pre-authenticated (saved by global-setup)
    storageState: AUTH_STATE,
    trace: "on",
    screenshot: "on",
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
  },

  // Hard-fails when CLERK_SECRET_KEY is absent — intentional for this suite.
  globalSetup: "./global-setup.ts",

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
