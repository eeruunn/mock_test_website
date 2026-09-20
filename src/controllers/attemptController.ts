import { Response } from "express";
import prisma from "../config/db";
import { AuthRequest } from "../middleware/authMiddleware";

// POST /api/attempts/start
export const startAttempt = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { examId } = req.body;

    if (!examId) {
      return res.status(400).json({ error: "examId is required" });
    }

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: { category: true },
    });
    if (!exam || !exam.isPublished) {
      return res.status(404).json({ error: "Exam not found" });
    }

    // Check access if this exam's category is a paid one
    if (exam.category.price > 0) {
      const purchase = await prisma.purchase.findFirst({
        where: { userId, categoryId: exam.categoryId, status: "paid" },
      });
      if (!purchase) {
        return res
          .status(402)
          .json({ error: "Payment required for this category" });
      }
    }

    // Prevent starting a new attempt if one is already in progress for this exam
    const existingAttempt = await prisma.attempt.findFirst({
      where: { userId, examId, status: "in_progress" },
    });

    if (existingAttempt) {
      return res.status(200).json(existingAttempt); // resume the existing one
    }

    const startedAt = new Date();
    const expiresAt = new Date(
      startedAt.getTime() + exam.totalDurationMin * 60 * 1000
    );

    const attempt = await prisma.attempt.create({
      data: {
        userId,
        examId,
        status: "in_progress",
        startedAt,
        expiresAt,
      },
    });

    res.status(201).json(attempt);
  } catch (error) {
    console.error("Start attempt error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

// PATCH /api/attempts/:id/answer
export const saveAnswer = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const attemptId = req.params.id as string;
    const {
      questionId,
      selectedOptionIds,
      numericAnswer,
      isFlagged,
      timeSpentSec,
    } = req.body;

    if (!questionId) {
      return res.status(400).json({ error: "questionId is required" });
    }

    const attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
    });

    if (!attempt) {
      return res.status(404).json({ error: "Attempt not found" });
    }
    if (attempt.userId !== userId) {
      return res.status(403).json({ error: "This is not your attempt" });
    }
    if (attempt.status !== "in_progress") {
      return res
        .status(400)
        .json({ error: "This attempt is no longer active" });
    }
    if (attempt.expiresAt && new Date() > attempt.expiresAt) {
      return res.status(400).json({ error: "This attempt has expired" });
    }

    // Validate the question actually belongs to this exam
    const question: any = await prisma.question.findUnique({
      where: { id: questionId },
      include: { section: true, options: true },
    });

    if (!question || question.section.examId !== attempt.examId) {
      return res.status(400).json({ error: "Invalid question for this exam" });
    }

    // Validate selectedOptionIds actually belong to this question
    if (selectedOptionIds && selectedOptionIds.length > 0) {
      const validOptionIds = new Set(question.options.map((o: any) => o.id));
      const allValid = selectedOptionIds.every((id: string) =>
        validOptionIds.has(id)
      );
      if (!allValid) {
        return res.status(400).json({ error: "Invalid option selected" });
      }
    }

    const response = await prisma.response.upsert({
      where: {
        attemptId_questionId: { attemptId, questionId },
      },
      update: {
        selectedOptionIds: selectedOptionIds || [],
        numericAnswer: numericAnswer ?? null,
        isFlagged: isFlagged ?? false,
        timeSpentSec: timeSpentSec ?? 0,
      },
      create: {
        attemptId,
        questionId,
        selectedOptionIds: selectedOptionIds || [],
        numericAnswer: numericAnswer ?? null,
        isFlagged: isFlagged ?? false,
        timeSpentSec: timeSpentSec ?? 0,
      },
    });

    res.json(response);
  } catch (error) {
    console.error("Save answer error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

// POST /api/attempts/:id/submit
export const submitAttempt = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const attemptId = req.params.id as string;

    const attempt: any = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        responses: {
          include: {
            question: {
              include: { options: true, section: true },
            },
          },
        },
      },
    });

    if (!attempt) {
      return res.status(404).json({ error: "Attempt not found" });
    }
    if (attempt.userId !== userId) {
      return res.status(403).json({ error: "This is not your attempt" });
    }
    if (attempt.status !== "in_progress") {
      return res
        .status(400)
        .json({ error: "This attempt was already submitted" });
    }

    const allQuestions: any[] = await prisma.question.findMany({
      where: { section: { examId: attempt.examId } },
      include: { section: true, options: true },
    });

    const responseByQuestionId = new Map(
      attempt.responses.map((r: any) => [r.questionId, r])
    );

    const sectionStats: Record<string, any> = {};

    let totalMarksScored = 0;
    let totalCorrect = 0;
    let totalWrong = 0;
    let totalUnattempted = 0;

    for (const question of allQuestions) {
      const sectionId = question.sectionId;
      if (!sectionStats[sectionId]) {
        sectionStats[sectionId] = {
          sectionId,
          sectionName: question.section.name,
          marks: 0,
          correct: 0,
          wrong: 0,
          unattempted: 0,
        };
      }

      const response: any = responseByQuestionId.get(question.id);

      if (!response || response.selectedOptionIds.length === 0) {
        sectionStats[sectionId].unattempted++;
        totalUnattempted++;
        if (response) {
          await prisma.response.update({
            where: { id: response.id },
            data: { isCorrect: null, marksAwarded: 0 },
          });
        }
        continue;
      }

      const correctOptionIds = question.options
        .filter((o: any) => o.isCorrect)
        .map((o: any) => o.id);

      const isCorrect =
        response.selectedOptionIds.length === correctOptionIds.length &&
        response.selectedOptionIds.every((id: string) =>
          correctOptionIds.includes(id)
        );

      const marksAwarded = isCorrect ? question.marks : -question.negativeMarks;

      await prisma.response.update({
        where: { id: response.id },
        data: { isCorrect, marksAwarded },
      });

      sectionStats[sectionId].marks += marksAwarded;
      totalMarksScored += marksAwarded;

      if (isCorrect) {
        sectionStats[sectionId].correct++;
        totalCorrect++;
      } else {
        sectionStats[sectionId].wrong++;
        totalWrong++;
      }
    }

    await prisma.attempt.update({
      where: { id: attemptId },
      data: { status: "submitted", submittedAt: new Date() },
    });

    const result = await prisma.result.create({
      data: {
        attemptId,
        totalMarksScored,
        totalCorrect,
        totalWrong,
        totalUnattempted,
        sectionBreakdown: Object.values(sectionStats),
      },
    });

    res.json(result);
  } catch (error) {
    console.error("Submit attempt error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

// GET /api/attempts/:id/result
export const getResult = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const attemptId = req.params.id as string;

    const attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { result: true },
    });

    if (!attempt) {
      return res.status(404).json({ error: "Attempt not found" });
    }
    if (attempt.userId !== userId) {
      return res.status(403).json({ error: "This is not your attempt" });
    }
    if (attempt.status !== "submitted" || !attempt.result) {
      return res
        .status(400)
        .json({ error: "This attempt has not been submitted yet" });
    }

    res.json(attempt.result);
  } catch (error) {
    console.error("Get result error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

// GET /api/attempts/history
export const getAttemptHistory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const attempts = await prisma.attempt.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        exam: {
          select: {
            id: true,
            title: true,
            slug: true,
            totalMarks: true,
          },
        },
        result: {
          select: {
            totalMarksScored: true,
            totalCorrect: true,
            totalWrong: true,
            totalUnattempted: true,
          },
        },
      },
    });

    res.json(attempts);
  } catch (error) {
    console.error("Get attempt history error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};
