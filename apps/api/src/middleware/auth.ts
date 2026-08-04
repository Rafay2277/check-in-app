import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, verifyStaffToken } from "../lib/tokens";

export type AuthedRequest = Request & {
  memberId?: string;
  staffSessionId?: string;
};

export function requireMemberAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  try {
    const payload = verifyAccessToken(header.slice(7));
    req.memberId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired access token" });
  }
}

export function requireStaffAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Staff session required" });
    return;
  }

  try {
    const payload = verifyStaffToken(header.slice(7));
    req.staffSessionId = payload.sid;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired staff session" });
  }
}
