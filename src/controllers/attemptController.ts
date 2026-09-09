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

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam || !exam.isPublished) {
      return res.status(404).json({ error: "Exam not found" });
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
    const { id: attemptId } = req.params;
    const {
      questionId,
      selectedOptionIds,
      numericAnswer,
      isFlagged,
      timeSpentSec,
    } = req.body;

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
    const { id: attemptId } = req.params;

    const attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        responses: { include: { question: { include: { options: true } } } },
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

    // Score each response
    let totalMarksScored = 0;
    let totalCorrect = 0;
    let totalWrong = 0;

    for (const response of attempt.responses) {
      const correctOptionIds: string[] = response.question.options
        .filter((o: { isCorrect: boolean }) => o.isCorrect)
        .map((o: { id: string }) => o.id);

      const isCorrect =
        response.selectedOptionIds.length > 0 &&
        response.selectedOptionIds.length === correctOptionIds.length &&
        response.selectedOptionIds.every((id: string) =>
          correctOptionIds.includes(id)
        );
      const marksAwarded = isCorrect
        ? response.question.marks
        : response.selectedOptionIds.length > 0
        ? -response.question.negativeMarks
        : 0;

      totalMarksScored += marksAwarded;
      if (isCorrect) totalCorrect++;
      else if (response.selectedOptionIds.length > 0) totalWrong++;

      await prisma.response.update({
        where: { id: response.id },
        data: { isCorrect, marksAwarded },
      });
    }

    const totalQuestions = await prisma.question.count({
      where: { section: { examId: attempt.examId } },
    });
    const totalUnattempted = totalQuestions - attempt.responses.length;

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
        sectionBreakdown: {}, // we'll build this out properly later
      },
    });

    res.json(result);
  } catch (error) {
    console.error("Submit attempt error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};
