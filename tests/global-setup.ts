/**
 * Playwright global setup — LIVE suite only (playwright.live.config.ts).
 *
 * What this does:
 *  1. Hard-fails if CLERK_SECRET_KEY is absent (no silent skip for this suite).
 *  2. Initialises Clerk testing mode.
 *  3. Generates a real, text-extractable PDF fixture for the upload test.
 *  4. Creates a throw-away Clerk test user via the Admin API.
 *  5. Launches Chromium, signs the user in through the UI, saves the browser
 *     storage state to .auth/user.json so every test spec starts pre-authenticated.
 *  6. Returns a teardown that deletes the Clerk user and temp files.
 *
 * Storage state is reused by playwright.live.config.ts via `use.storageState`.
 * The stubbed config (playwright.config.ts) reads the same file if it exists
 * but does NOT depend on this setup running first.
 */

import { chromium, type FullConfig } from "@playwright/test";
import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// Stable paths (computed relative to this file so they are CWD-independent)
// ---------------------------------------------------------------------------
const TESTS_DIR = path.resolve(__dirname);
const FIXTURE_DIR = path.join(TESTS_DIR, "fixtures");
const SAMPLE_PDF_PATH = path.join(FIXTURE_DIR, "sample-question-paper.pdf");
const AUTH_DIR = path.join(TESTS_DIR, ".auth");
export const AUTH_STATE = path.join(AUTH_DIR, "user.json");

// ---------------------------------------------------------------------------
// PDF generation (pdfkit devDependency of @workspace/tests)
// ---------------------------------------------------------------------------
async function generateSamplePdf(outputPath: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PDFDocument = require("pdfkit") as typeof import("pdfkit");

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 60 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .text("Class 12 Physics — Previous Year Question Paper (2023)", {
        align: "center",
      });
    doc.moveDown(0.5);
    doc
      .fontSize(11)
      .font("Helvetica")
      .text("Time: 3 Hours     Maximum Marks: 70", { align: "center" });

    doc.moveDown(1);
    doc
      .fontSize(13)
      .font("Helvetica-Bold")
      .text("SECTION A — Multiple Choice (1 mark each)");
    doc.moveDown(0.4);
    doc.fontSize(11).font("Helvetica");
    [
      "Q1. Which of the following is NOT a vector? (a) Force (b) Velocity (c) Temperature (d) Acceleration",
      "Q2. The SI unit of electric potential is: (a) Joule (b) Volt (c) Coulomb (d) Ampere",
      "Q3. Ohm's Law relates: (a) charge and time (b) current and voltage (c) mass and acceleration (d) force and area",
    ].forEach((q) => {
      doc.text(q);
      doc.moveDown(0.3);
    });

    doc.moveDown(0.5);
    doc
      .fontSize(13)
      .font("Helvetica-Bold")
      .text("SECTION B — Short Answer (2 marks each)");
    doc.moveDown(0.4);
    doc.fontSize(11).font("Helvetica");
    [
      "Q4. Define refractive index and state Snell's Law.",
      "Q5. State Newton's Second Law of Motion with an example.",
      "Q6. What is electromagnetic induction? State Faraday's first law.",
      "Q7. Distinguish between nuclear fission and nuclear fusion.",
    ].forEach((q) => {
      doc.text(q);
      doc.moveDown(0.4);
    });

    doc.moveDown(0.5);
    doc
      .fontSize(13)
      .font("Helvetica-Bold")
      .text("SECTION C — Long Answer (5 marks each)");
    doc.moveDown(0.4);
    doc.fontSize(11).font("Helvetica");
    [
      "Q8. Derive the expression for kinetic energy. How does it depend on velocity?",
      "Q9. Explain the construction and working of a transformer. State its limitations.",
      "Q10. With a diagram, describe total internal reflection and its applications.",
    ].forEach((q) => {
      doc.text(q);
      doc.moveDown(0.4);
    });

    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Main global setup
// ---------------------------------------------------------------------------
export default async function globalSetup(config: FullConfig) {
  // 1. Hard-fail if required secret is absent — no silent skips for this suite
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "[global-setup] CLERK_SECRET_KEY is required. " +
        "Add it as a Replit secret and re-run the live e2e suite.",
    );
  }

  // 2. Initialise Clerk testing mode (must run before any token operations)
  await clerkSetup();

  // 3. Generate PDF fixture
  await generateSamplePdf(SAMPLE_PDF_PATH);
  process.env.TEST_FIXTURE_PDF_PATH = SAMPLE_PDF_PATH;
  console.log(`[global-setup] PDF fixture: ${SAMPLE_PDF_PATH}`);

  // 4. Create a throw-away Clerk test user via the Admin API
  const clerk = createClerkClient({ secretKey });
  const testEmail = `e2e-${Date.now()}@test.smartstudy.internal`;
  const testPassword = `E2E_Test_${Date.now()}_!Aa`;

  const user = await clerk.users.createUser({
    emailAddress: [testEmail],
    firstName: "E2E",
    lastName: "TestUser",
    skipPasswordChecks: true,
    password: testPassword,
  });
  process.env.TEST_CLERK_USER_ID = user.id;
  console.log(`[global-setup] Created test user: ${user.id} (${testEmail})`);

  // 5. Sign the user in via the browser and save storage state
  //    The storage state is what makes subsequent tests start authenticated
  //    without repeating the sign-in flow.
  const baseURL =
    config.projects[0].use.baseURL ??
    process.env.PLAYWRIGHT_BASE_URL ??
    "http://localhost:5173";

  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Tells Clerk to allow automated sign-in (bypasses bot-detection)
    await setupClerkTestingToken({ page });

    // Navigate to the app's sign-in page
    await page.goto(`${baseURL}/sign-in`, { waitUntil: "networkidle" });

    // Step 1: enter email address
    const emailInput =
      page.locator('input[name="identifier"]').first() ??
      page.getByRole("textbox", { name: /email/i });
    await emailInput.fill(testEmail);
    await page.getByRole("button", { name: /continue/i }).click();

    // Step 2: handle what Clerk shows next — either:
    //   (a) a password field  → fill it and submit
    //   (b) an email-code field → in dev mode the magic code is "424242"
    const passwordInput = page.locator('input[name="password"]');
    const codeInput = page.locator('input[name="code"]');

    try {
      await passwordInput.waitFor({ state: "visible", timeout: 8_000 });
      await passwordInput.fill(testPassword);
      await page.getByRole("button", { name: /continue|sign in/i }).click();
    } catch {
      // Clerk asked for an email verification code instead
      await codeInput.waitFor({ state: "visible", timeout: 8_000 });
      await codeInput.fill("424242");
      await page.getByRole("button", { name: /continue|verify/i }).click();

      // If there is now a password step, handle it too
      const maybePassword = page.locator('input[name="password"]');
      try {
        await maybePassword.waitFor({ state: "visible", timeout: 5_000 });
        await maybePassword.fill(testPassword);
        await page.getByRole("button", { name: /continue|sign in/i }).click();
      } catch {
        // No separate password step — already authenticated
      }
    }

    // Wait for the post-sign-in redirect (Clerk sends to / or /dashboard)
    await page.waitForURL(/\/(dashboard|analyze|$)/, { timeout: 30_000 });

    // Save the authenticated browser state
    await context.storageState({ path: AUTH_STATE });
    console.log(`[global-setup] Storage state saved: ${AUTH_STATE}`);
  } finally {
    await browser.close();
  }

  // 6. Return teardown: deletes the Clerk user and temp files
  return async () => {
    try {
      await clerk.users.deleteUser(user.id);
      console.log(`[global-setup] Deleted test user: ${user.id}`);
    } catch {
      console.warn("[global-setup] Could not delete test user — clean up manually if needed.");
    }
    for (const f of [AUTH_STATE, SAMPLE_PDF_PATH]) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
  };
}
