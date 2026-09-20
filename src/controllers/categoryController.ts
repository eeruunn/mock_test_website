import { Request, Response } from "express";
import prisma from "../config/db";

// GET /api/categories
export const listCategories = async (req: Request, res: Response) => {
  try {
    const categories = await prisma.examCategory.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        price: true,
        _count: {
          select: { exams: true },
        },
      },
    });

    res.json(categories);
  } catch (error) {
    console.error("List categories error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};
