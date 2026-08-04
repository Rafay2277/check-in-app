import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config";

const BCRYPT_ROUNDS = 10;

export function hashOpaqueToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function generateOtpCode(): string {
  return String(crypto.randomInt(100000, 999999));
}

export async function hashOtpCode(code: string): Promise<string> {
  return bcrypt.hash(code, BCRYPT_ROUNDS);
}

export async function verifyOtpCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}

export type AccessTokenPayload = {
  sub: string;
  typ: "access";
};

export type StaffTokenPayload = {
  typ: "staff";
  sid: string;
};

export function signAccessToken(memberId: string): string {
  const payload: AccessTokenPayload = { sub: memberId, typ: "access" };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  if (decoded.typ !== "access" || !decoded.sub) {
    throw new Error("Invalid access token");
  }
  return decoded;
}

export function signStaffToken(): string {
  const payload: StaffTokenPayload = {
    typ: "staff",
    sid: crypto.randomUUID(),
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.STAFF_SESSION_TTL_SECONDS,
  });
}

export function verifyStaffToken(token: string): StaffTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as StaffTokenPayload;
  if (decoded.typ !== "staff") {
    throw new Error("Invalid staff token");
  }
  return decoded;
}

export function refreshExpiryDate(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000);
}
