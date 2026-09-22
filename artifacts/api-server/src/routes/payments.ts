import { Router, IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, paymentsTable, creditBatchesTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { validatePaymentVerification } from "razorpay/dist/utils/razorpay-utils.js";
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
  starter: { amountPaise: 8900,  credits: 5,  label: "Starter Pack — 5 Analyses" },
  value:   { amountPaise: 16900, credits: 10, label: "Value Pack — 10 Analyses"  },
} as const;

type PackageId = keyof typeof PACKAGES;

class PaymentConfirmationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

interface LockedPayment {
  id: number;
  userId: number;
  amount: number;
  razorpayPaymentId: string | null;
  status: string;
}

const LEGACY_CREDITS_BY_AMOUNT = new Map([
  [6900, 5],
  [12900, 10],
]);

/** Derive credits from a stored amount (paise). Defaults to 10 for legacy records. */
function creditsForAmount(amountPaise: number): number {
  for (const pkg of Object.values(PACKAGES)) {
    if (pkg.amountPaise === amountPaise) return pkg.credits;
  }
  return LEGACY_CREDITS_BY_AMOUNT.get(amountPaise) ?? 10;
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

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      res.status(503).json({ error: "Payment service not configured" });
      return;
    }

    // Razorpay's official helper verifies HMAC-SHA256(order_id|payment_id)
    // with the server-only key secret before any payment or credit mutation.
    const signatureIsValid = validatePaymentVerification(
      {
        order_id: razorpayOrderId,
        payment_id: razorpayPaymentId,
      },
      razorpaySignature,
      secret,
    );

    if (!signatureIsValid) {
      logger.warn({ razorpayOrderId }, "Payment signature verification failed");
      res.status(400).json({ error: "Payment verification failed" });
      return;
    }

    try {
      const confirmation = await db.transaction(async (tx) => {
        // Serialize confirmations for this order. A retry waits for the first
        // transaction, then observes status=success and does not add credits.
        const lockedResult = await tx.execute(sql`
          SELECT
            id,
            user_id AS "userId",
            amount,
            razorpay_payment_id AS "razorpayPaymentId",
            status
          FROM payments
          WHERE razorpay_order_id = ${razorpayOrderId}
          FOR UPDATE
        `);
        const paymentRow = lockedResult.rows[0] as unknown as
          | LockedPayment
          | undefined;

        if (!paymentRow || Number(paymentRow.userId) !== req.userId) {
          throw new PaymentConfirmationError("Payment verification failed", 400);
        }

        const creditsToAward = creditsForAmount(paymentRow.amount);

        if (paymentRow.status === "success") {
          if (paymentRow.razorpayPaymentId !== razorpayPaymentId) {
            throw new PaymentConfirmationError(
              "Payment order has already been completed",
              409,
            );
          }
          return { creditsToAward, expiresAt: null, alreadyCredited: true };
        }

        if (paymentRow.status !== "pending") {
          throw new PaymentConfirmationError(
            "Payment order cannot be completed",
            409,
          );
        }

        await tx
          .update(paymentsTable)
          .set({ razorpayPaymentId, status: "success" })
          .where(eq(paymentsTable.id, paymentRow.id));

        // Payment status and its credit batch commit or roll back together.
        const purchasedAt = new Date();
        const expiresAt = new Date(purchasedAt);
        expiresAt.setDate(expiresAt.getDate() + 30);

        await tx.insert(creditBatchesTable).values({
          userId: req.userId!,
          creditsTotal: creditsToAward,
          creditsRemaining: creditsToAward,
          isPaid: true,
          purchasedAt,
          expiresAt,
          paymentId: paymentRow.id,
        });

        return { creditsToAward, expiresAt, alreadyCredited: false };
      });

      const creditInfo = await getCreditInfo(req.userId!);

      logger.info(
        {
          userId: req.userId,
          razorpayPaymentId,
          creditsToAward: confirmation.creditsToAward,
          expiresAt: confirmation.expiresAt,
          alreadyCredited: confirmation.alreadyCredited,
        },
        confirmation.alreadyCredited
          ? "Duplicate payment confirmation handled idempotently"
          : "Payment verified, credits batch created",
      );

      res.json(
        VerifyPaymentResponse.parse({
          creditsRemaining: creditInfo.creditsRemaining,
          totalPurchased: creditInfo.totalPurchased,
          freeCreditUsed: false,
        }),
      );
    } catch (err) {
      if (err instanceof PaymentConfirmationError) {
        logger.warn(
          { razorpayOrderId, userId: req.userId, reason: err.message },
          "Payment confirmation rejected",
        );
        res.status(err.statusCode).json({ error: err.message });
        return;
      }

      logger.error(
        { err, razorpayOrderId, userId: req.userId },
        "Payment confirmation failed",
      );
      res.status(500).json({ error: "Failed to confirm payment" });
    }
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
