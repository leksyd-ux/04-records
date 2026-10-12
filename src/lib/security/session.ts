import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const SESSION_COOKIE_NAME = "records_session_token";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const AUTH_SECRET = process.env.AUTH_SECRET || "dev-secret-key-assessment-04-records-min-32-chars";

function signToken(sessionId: string): string {
  const hmac = crypto.createHmac("sha256", AUTH_SECRET);
  hmac.update(sessionId);
  return `${sessionId}.${hmac.digest("hex")}`;
}

function verifyToken(token: string): string | null {
  const [sessionId, signature] = token.split(".");
  if (!sessionId || !signature) return null;

  const hmac = crypto.createHmac("sha256", AUTH_SECRET);
  hmac.update(sessionId);
  const expected = hmac.digest("hex");

  try {
    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return sessionId;
    }
  } catch {
    return null;
  }
  return null;
}

export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const session = await prisma.session.create({
    data: {
      userId,
      expiresAt,
    },
  });

  const token = signToken(session.id);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return session;
}

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const sessionId = verifyToken(token);
  if (!sessionId) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const sessionId = verifyToken(token);
    if (sessionId) {
      await prisma.session.deleteMany({ where: { id: sessionId } });
    }
    cookieStore.delete(SESSION_COOKIE_NAME);
  }
}
