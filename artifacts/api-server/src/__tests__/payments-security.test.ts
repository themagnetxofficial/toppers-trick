import { createHmac } from "crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const paymentsTable = { id: { name: "id" } };
  const creditBatchesTable = { name: "credit_batches" };

  const state = {
    payment: {
      id: 31,
      userId: 7,
      amount: 8900,
      razorpayPaymentId: null as string | null,
      status: "pending",
    },
    insertedBatches: [] as Array<Record<string, unknown>>,
    pendingPayments: [] as Array<Record<string, unknown>>,
  };

  const tx = {
    execute: vi.fn(async () => ({ rows: [{ ...state.payment }] })),
    update: vi.fn(() => ({
      set: vi.fn((values: { razorpayPaymentId: string; status: string }) => ({
        where: vi.fn(async () => {
          state.payment.razorpayPaymentId = values.razorpayPaymentId;
          state.payment.status = values.status;
        }),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        state.insertedBatches.push(values);
      }),
    })),
  };

  const db = {
    transaction: vi.fn(async (callback: (executor: typeof tx) => unknown) =>
      callback(tx),
    ),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        state.pendingPayments.push(values);
      }),
    })),
  };

  return {
    paymentsTable,
    creditBatchesTable,
    state,
    tx,
    db,
    createOrder: vi.fn(async () => ({ id: "order_secure_123" })),
    getCreditInfo: vi.fn(async () => ({
      creditsRemaining: 5,
      totalPurchased: 5,
      freeCreditUsed: false,
      nextExpiresAt: null,
      batches: [],
    })),
  };
});

vi.mock("@workspace/db", () => ({
  db: mocks.db,
  paymentsTable: mocks.paymentsTable,
  creditBatchesTable: mocks.creditBatchesTable,
}));

vi.mock("../lib/auth", () => ({
  requireAuth: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    req.userId = 7;
    next();
  },
}));

vi.mock("../lib/credits", () => ({
  getCreditInfo: mocks.getCreditInfo,
}));

vi.mock("../lib/razorpayClient", () => ({
  createRazorpayClient: vi.fn(() => ({
    orders: { create: mocks.createOrder },
  })),
}));

vi.mock("../lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import paymentsRouter from "../routes/payments";

const SECRET = "test_razorpay_secret";
const ORDER_ID = "order_secure_123";
const PAYMENT_ID = "pay_secure_456";

function signatureFor(orderId = ORDER_ID, paymentId = PAYMENT_ID) {
  return createHmac("sha256", SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", paymentsRouter);
  return app;
}

describe("Razorpay payment confirmation security", () => {
  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = "key_test_dummy";
    process.env.RAZORPAY_KEY_SECRET = SECRET;
    mocks.state.payment = {
      id: 31,
      userId: 7,
      amount: 8900,
      razorpayPaymentId: null,
      status: "pending",
    };
    mocks.state.insertedBatches.length = 0;
    mocks.state.pendingPayments.length = 0;
    vi.clearAllMocks();
  });

  it("creates an order and records a pending payment", async () => {
    const response = await request(buildApp())
      .post("/api/payments/order")
      .send({ packageId: "starter" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      orderId: ORDER_ID,
      amount: 8900,
      currency: "INR",
      credits: 5,
    });
    expect(mocks.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 8900, currency: "INR" }),
    );
    expect(mocks.state.pendingPayments).toEqual([
      expect.objectContaining({
        userId: 7,
        amount: 8900,
        razorpayOrderId: ORDER_ID,
        status: "pending",
      }),
    ]);
  });

  it("keeps order failures generic in the response", async () => {
    mocks.createOrder.mockRejectedValueOnce(new Error("private SDK detail"));

    const response = await request(buildApp())
      .post("/api/payments/order")
      .send({ packageId: "starter" });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Failed to create payment order" });
    expect(mocks.state.pendingPayments).toHaveLength(0);
  });

  it("rejects a forged client callback before touching the database", async () => {
    const response = await request(buildApp())
      .post("/api/payments/verify")
      .send({
        razorpayOrderId: ORDER_ID,
        razorpayPaymentId: PAYMENT_ID,
        razorpaySignature: "forged-signature",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Payment verification failed");
    expect(mocks.db.transaction).not.toHaveBeenCalled();
    expect(mocks.state.insertedBatches).toHaveLength(0);
  });

  it("verifies a valid signature before creating the purchased credit batch", async () => {
    const response = await request(buildApp())
      .post("/api/payments/verify")
      .send({
        razorpayOrderId: ORDER_ID,
        razorpayPaymentId: PAYMENT_ID,
        razorpaySignature: signatureFor(),
      });

    expect(response.status).toBe(200);
    expect(mocks.state.payment).toMatchObject({
      status: "success",
      razorpayPaymentId: PAYMENT_ID,
    });
    expect(mocks.state.insertedBatches).toHaveLength(1);
    expect(mocks.state.insertedBatches[0]).toMatchObject({
      userId: 7,
      creditsTotal: 5,
      creditsRemaining: 5,
      isPaid: true,
      paymentId: 31,
    });
  });

  it("rejects a valid payment confirmation for another user's order", async () => {
    mocks.state.payment.userId = 99;

    const response = await request(buildApp())
      .post("/api/payments/verify")
      .send({
        razorpayOrderId: ORDER_ID,
        razorpayPaymentId: PAYMENT_ID,
        razorpaySignature: signatureFor(),
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Payment verification failed");
    expect(mocks.state.insertedBatches).toHaveLength(0);
  });

  it("handles a repeated valid confirmation without double-crediting", async () => {
    const body = {
      razorpayOrderId: ORDER_ID,
      razorpayPaymentId: PAYMENT_ID,
      razorpaySignature: signatureFor(),
    };

    const first = await request(buildApp())
      .post("/api/payments/verify")
      .send(body);
    const second = await request(buildApp())
      .post("/api/payments/verify")
      .send(body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mocks.db.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.state.insertedBatches).toHaveLength(1);
  });
});