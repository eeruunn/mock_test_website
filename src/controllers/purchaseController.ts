import { Response } from "express";
import prisma from "../config/db";
import { AuthRequest } from "../middleware/authMiddleware";

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
