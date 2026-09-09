import { Router } from "express";
import { listExams, getExamById } from "../controllers/examController";

const router = Router();

router.get("/", listExams);
router.get("/:id", getExamById);

export default router;
