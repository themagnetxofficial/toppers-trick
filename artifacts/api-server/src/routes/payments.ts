import { Router, IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, paymentsTable, creditBatchesTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { createHmac } from "crypto";
import {
  CreatePaymentOrderBody,
  CreatePaymentOrderResponse,
  VerifyPaymentBody,
  VerifyPaymentResponse,
  ListPaymentsResponse,
} from "@workspace/api-zod";
import { getCreditInfo } from "../lib/credits";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Available credit packages
const PACKAGES = {
  starter: { amountPaise: 6900,  credits: 5,  label: "Starter Pack — 5 Analyses" },
  value:   { amountPaise: 12900, credits: 10, label: "Value Pack — 10 Analyses"  },
} as const;

type PackageId = keyof typeof PACKAGES;

/** Derive credits from a stored amount (paise). Defaults to 10 for legacy records. */
function creditsForAmount(amountPaise: number): number {
  for (const pkg of Object.values(PACKAGES)) {
    if (pkg.amountPaise === amountPaise) return pkg.credits;
  }
  return 10; // fallback for pre-existing ₹129 records
}

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

    const parsed = CreatePaymentOrderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const packageId = parsed.data.packageId as PackageId;
    const pkg = PACKAGES[packageId];

    try {
      const razorpay = await getRazorpay();
      const order = await razorpay.orders.create({
        amount: pkg.amountPaise,
        currency: "INR",
        receipt: `order_user_${req.userId}_${Date.now()}`,
      });

      // Log pending payment
      await db.insert(paymentsTable).values({
        userId: req.userId!,
        amount: pkg.amountPaise,
        razorpayOrderId: order.id as string,
        packageName: packageId,
        status: "pending",
      });

      res.status(201).json(
        CreatePaymentOrderResponse.parse({
          orderId: order.id,
          amount: pkg.amountPaise,
          currency: "INR",
          key: process.env.RAZORPAY_KEY_ID,
          credits: pkg.credits,
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

    // Look up the pending payment to determine how many credits to award
    const paymentRow = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.razorpayOrderId, razorpayOrderId))
      .limit(1)
      .then((rows) => rows[0]);

    const creditsToAward = creditsForAmount(paymentRow?.amount ?? 12900);

    // Mark payment as successful
    await db
      .update(paymentsTable)
      .set({ razorpayPaymentId, status: "success" })
      .where(eq(paymentsTable.razorpayOrderId, razorpayOrderId));

    // Create a 30-day expiring credit batch for this purchase
    const purchasedAt = new Date();
    const expiresAt = new Date(purchasedAt);
    expiresAt.setDate(expiresAt.getDate() + 30);

    await db.insert(creditBatchesTable).values({
      userId: req.userId!,
      creditsTotal: creditsToAward,
      creditsRemaining: creditsToAward,
      isPaid: true,
      purchasedAt,
      expiresAt,
      paymentId: paymentRow?.id ?? null,
    });

    // Fetch updated credit info for the response
    const creditInfo = await getCreditInfo(req.userId!);

    logger.info(
      { userId: req.userId, razorpayPaymentId, creditsToAward, expiresAt },
      "Payment verified, credits batch created"
    );

    res.json(
      VerifyPaymentResponse.parse({
        creditsRemaining: creditInfo.creditsRemaining,
        totalPurchased: creditInfo.totalPurchased,
        freeCreditUsed: false,
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
