import { Router, IRouter } from "express";
import { db, contactSubmissionsTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/contact", async (req, res): Promise<void> => {
  const { name, email, subject, message } = req.body ?? {};

  if (
    !name?.trim() || typeof name !== "string" ||
    !email?.trim() || typeof email !== "string" ||
    !subject?.trim() || typeof subject !== "string" ||
    !message?.trim() || typeof message !== "string"
  ) {
    res.status(400).json({ error: "All fields are required" });
    return;
  }

  if (name.length > 200 || email.length > 200 || subject.length > 500 || message.length > 5000) {
    res.status(400).json({ error: "Input too long" });
    return;
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  if (!emailOk) {
    res.status(400).json({ error: "Invalid email address" });
    return;
  }

  try {
    await db.insert(contactSubmissionsTable).values({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: subject.trim(),
      message: message.trim(),
    });
    logger.info({ email: email.trim() }, "Contact form submission received");
    res.status(201).json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to save contact submission");
    res.status(500).json({ error: "Failed to save submission" });
  }
});

export default router;
