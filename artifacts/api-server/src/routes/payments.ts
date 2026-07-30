import { Router, IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, paymentsTable, creditsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { createHmac } from "crypto";
import {
  CreatePaymentOrderResponse,
  VerifyPaymentBody,
  VerifyPaymentResponse,
  ListPaymentsResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ₹129 pack = 12900 paise
const PACK_AMOUNT_PAISE = 12900;
const CREDITS_PER_PACK = 10;

async function getRazorpay() {
  const Razorpay = (await import("razorpay")).default;
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID ?? "",
    key_secret: process.env.RAZORPAY_KEY_SECRET ?? "",
  });
}

router.post(
  "/payments/order",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      res.status(503).json({ error: "Payment service not configured" });
      return;
    }

    try {
      const razorpay = await getRazorpay();
      const order = await razorpay.orders.create({
        amount: PACK_AMOUNT_PAISE,
        currency: "INR",
        receipt: `order_user_${req.userId}_${Date.now()}`,
      });

      // Log pending payment
      await db.insert(paymentsTable).values({
        userId: req.userId!,
        amount: PACK_AMOUNT_PAISE,
        razorpayOrderId: order.id as string,
        status: "pending",
      });

      res.status(201).json(
        CreatePaymentOrderResponse.parse({
          orderId: order.id,
          amount: PACK_AMOUNT_PAISE,
          currency: "INR",
          key: process.env.RAZORPAY_KEY_ID,
        })
      );
    } catch (err) {
      logger.error({ err }, "Failed to create Razorpay order");
      res.status(500).json({ error: "Failed to create payment order" });
    }
  }
);

router.post(
  "/payments/verify",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = VerifyPaymentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } =
      parsed.data;

    // Verify signature
    const secret = process.env.RAZORPAY_KEY_SECRET ?? "";
    const generated = createHmac("sha256", secret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (generated !== razorpaySignature) {
      logger.warn({ razorpayOrderId }, "Payment signature verification failed");
      res.status(400).json({ error: "Payment verification failed" });
      return;
    }

    // Update payment record
    await db
      .update(paymentsTable)
      .set({ razorpayPaymentId, status: "success" })
      .where(eq(paymentsTable.razorpayOrderId, razorpayOrderId));

    // Add credits
    const credits = await db
      .select()
      .from(creditsTable)
      .where(eq(creditsTable.userId, req.userId!))
      .limit(1)
      .then((rows) => rows[0]);

    const newCredits = (credits?.creditsRemaining ?? 0) + CREDITS_PER_PACK;
    const newTotal = (credits?.totalPurchased ?? 0) + CREDITS_PER_PACK;

    if (credits) {
      await db
        .update(creditsTable)
        .set({
          creditsRemaining: newCredits,
          totalPurchased: newTotal,
          updatedAt: new Date(),
        })
        .where(eq(creditsTable.userId, req.userId!));
    } else {
      await db.insert(creditsTable).values({
        userId: req.userId!,
        creditsRemaining: CREDITS_PER_PACK,
        totalPurchased: CREDITS_PER_PACK,
      });
    }

    logger.info(
      { userId: req.userId, razorpayPaymentId },
      "Payment verified, credits added"
    );

    res.json(
      VerifyPaymentResponse.parse({
        creditsRemaining: newCredits,
        totalPurchased: newTotal,
        freeCreditUsed: credits?.freeCreditUsed ?? false,
      })
    );
  }
);

router.get(
  "/payments/history",
  requireAuth,
  async (req, res): Promise<void> => {
    const payments = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.userId, req.userId!))
      .orderBy(paymentsTable.createdAt);

    res.json(
      ListPaymentsResponse.parse(
        payments
          .slice()
          .reverse()
          .map((p) => ({
            id: p.id,
            amount: p.amount,
            razorpayPaymentId: p.razorpayPaymentId,
            status: p.status,
            createdAt: p.createdAt,
          }))
      )
    );
  }
);

export default router;
