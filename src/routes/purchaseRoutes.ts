import { Router } from "express";
import { getMyPurchases } from "../controllers/purchaseController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

router.get("/mine", authMiddleware, getMyPurchases);

export default router;
