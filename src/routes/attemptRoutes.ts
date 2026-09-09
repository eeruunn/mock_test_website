import { Router } from "express";
import {
  startAttempt,
  saveAnswer,
  submitAttempt,
  getResult,
} from "../controllers/attemptController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

router.post("/start", authMiddleware, startAttempt);
router.patch("/:id/answer", authMiddleware, saveAnswer);
router.post("/:id/submit", authMiddleware, submitAttempt);
router.get("/:id/result", authMiddleware, getResult);

export default router;
