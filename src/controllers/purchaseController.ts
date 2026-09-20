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
    const { categoryId } = req.body;

    if (!categoryId) {
      return res.status(400).json({ error: "categoryId is required" });
    }

    const category = await prisma.examCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }
    if (category.price <= 0) {
      return res.status(400).json({ error: "This category is free" });
    }

    // Razorpay wants amount in paise (smallest currency unit), not rupees
    const amountInPaise = Math.round(category.price * 100);

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `cat_${categoryId}_${Date.now()}`,
    });

    // Create a pending Purchase record tied to this order
    const purchase = await prisma.purchase.create({
      data: {
        userId,
        categoryId,
        amount: category.price,
        status: "pending",
        razorpayOrderId: order.id,
      },
    });

    res.json({
      orderId: order.id,
      amount: amountInPaise,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID,
      purchaseId: purchase.id,
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
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      purchaseId,
    } = req.body;

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !purchaseId
    ) {
      return res
        .status(400)
        .json({ error: "Missing payment verification fields" });
    }

    // Verify the signature is genuinely from Razorpay, not spoofed
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET as string)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Payment verification failed" });
    }

    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
    });

    if (!purchase || purchase.userId !== userId) {
      return res.status(404).json({ error: "Purchase not found" });
    }
    if (purchase.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({ error: "Order mismatch" });
    }

    const paidAt = new Date();
    const expiresAt = new Date(paidAt.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days

    const updated = await prisma.purchase.update({
      where: { id: purchaseId },
      data: {
        status: "paid",
        razorpayPaymentId: razorpay_payment_id,
        paidAt,
        expiresAt,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("Verify payment error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};
