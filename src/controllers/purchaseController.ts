import { Response } from "express";
import prisma from "../config/db";
import { AuthRequest } from "../middleware/authMiddleware";
import razorpay from "../config/razorpay";
import crypto from "crypto";

// GET /api/purchases/mine
export const getMyPurchases = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const purchases = await prisma.purchase.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        category: { select: { name: true, slug: true } },
      },
    });

    res.json(purchases);
  } catch (error) {
    console.error("Get purchases error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

// POST /api/purchases/create-order
export const createOrder = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { categoryIds } = req.body;

    if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
      return res
        .status(400)
        .json({ error: "categoryIds must be a non-empty array" });
    }

    const categories = await prisma.examCategory.findMany({
      where: { id: { in: categoryIds } },
    });

    if (categories.length !== categoryIds.length) {
      return res
        .status(404)
        .json({ error: "One or more categories not found" });
    }
    if (categories.some((c) => c.price <= 0)) {
      return res.status(400).json({ error: "One or more categories are free" });
    }

    const totalAmount = categories.reduce((sum, c) => sum + c.price, 0);
    const amountInPaise = Math.round(totalAmount * 100);

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `bundle_${Date.now()}`,
    });

    // Create one pending Purchase per category, all tied to this order
    const purchases = await Promise.all(
      categories.map((cat) =>
        prisma.purchase.create({
          data: {
            userId,
            categoryId: cat.id,
            amount: cat.price,
            status: "pending",
            razorpayOrderId: order.id,
          },
        })
      )
    );

    res.json({
      orderId: order.id,
      amount: amountInPaise,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID,
      purchaseIds: purchases.map((p) => p.id),
      totalAmount,
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        price: c.price,
      })),
    });
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

// POST /api/purchases/verify
export const verifyPayment = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res
        .status(400)
        .json({ error: "Missing payment verification fields" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET as string)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Payment verification failed" });
    }

    // Find every pending purchase tied to this order, for this user
    const purchases = await prisma.purchase.findMany({
      where: { razorpayOrderId: razorpay_order_id, userId, status: "pending" },
    });

    if (purchases.length === 0) {
      return res.status(404).json({ error: "No matching purchases found" });
    }

    const paidAt = new Date();
    const expiresAt = new Date(paidAt.getTime() + 30 * 24 * 60 * 60 * 1000);

    await prisma.purchase.updateMany({
      where: { razorpayOrderId: razorpay_order_id, userId, status: "pending" },
      data: {
        status: "paid",
        razorpayPaymentId: razorpay_payment_id,
        paidAt,
        expiresAt,
      },
    });

    res.json({
      success: true,
      categoriesUnlocked: purchases.map((p) => p.categoryId),
    });
  } catch (error) {
    console.error("Verify payment error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};
