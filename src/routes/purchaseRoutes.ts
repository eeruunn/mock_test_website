import { Router } from "express";
import {
  getMyPurchases,
  createOrder,
  verifyPayment,
} from "../controllers/purchaseController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

router.get("/mine", authMiddleware, getMyPurchases);
router.post("/create-order", authMiddleware, createOrder);
router.post("/verify", authMiddleware, verifyPayment);

export default router;
