import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Extend Express's Request type to include our custom "user" field
export interface AuthRequest extends Request {
  user?: {
    userId: string;
    phone: string;
  };
}

export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1]; // "Bearer <token>" -> just the token part

  try {
    const decoded = jwt.verify(
      token as string,
      process.env.JWT_SECRET as string
    ) as {
      userId: string;
      phone: string;
    };

    req.user = decoded; // attach user info to the request for later use
    next(); // token is valid, continue to the actual route handler
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};
