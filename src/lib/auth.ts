import bcrypt from "bcryptjs";
import { sign, verify } from "hono/jwt";
import { env } from "./env.js";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface JwtPayload {
  sub: string; // user id
  email: string;
  exp: number;
  [key: string]: unknown;
}

export async function createToken(userId: string, email: string): Promise<string> {
  const payload: JwtPayload = {
    sub: userId,
    email,
    exp: Math.floor(Date.now() / 1000) + env.JWT_EXPIRES_IN,
  };
  return sign(payload, env.JWT_SECRET, "HS256");
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  return (await verify(token, env.JWT_SECRET, "HS256")) as JwtPayload;
}
