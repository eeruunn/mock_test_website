import { Request, Response } from "express";
import prisma from "../config/db";

// GET /api/exams - list all published exams
export const listExams = async (req: Request, res: Response) => {
  try {
    const exams = await prisma.exam.findMany({
      where: { isPublished: true },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        totalDurationMin: true,
        totalMarks: true,
        isFree: true,
        category: {
          select: { name: true, slug: true },
        },
      },
    });

    res.json(exams);
  } catch (error) {
    console.error("List exams error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

// GET /api/exams/:id - get one exam with sections and questions (no correct answers revealed)
export const getExamById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const exam = await prisma.exam.findUnique({
      where: { id },
      include: {
        sections: {
          orderBy: { orderIndex: "asc" },
          include: {
            questions: {
              select: {
                id: true,
                questionType: true,
                questionText: true,
                questionImageUrl: true,
                marks: true,
                negativeMarks: true,
                difficulty: true,
                options: {
                  select: {
                    id: true,
                    optionText: true,
                    optionImageUrl: true,
                    orderIndex: true,
                    // isCorrect deliberately excluded - don't leak answers
                  },
                  orderBy: { orderIndex: "asc" },
                },
              },
            },
          },
        },
      },
    });

    if (!exam) {
      return res.status(404).json({ error: "Exam not found" });
    }

    res.json(exam);
  } catch (error) {
    console.error("Get exam error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};
