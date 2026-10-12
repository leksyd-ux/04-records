import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/security/hash";
import { createSession } from "@/lib/security/session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const targetUser = body.user === 2 || body.email?.includes("user2") ? 2 : 1;

    const email = body.email || (targetUser === 2 ? "user2.evaluator@example.com" : "user1.evaluator@example.com");
    const name = body.name || (targetUser === 2 ? "Evaluator User Two" : "Evaluator User One");
    const passwordHash = await hashPassword("AssessmentPassword123!");

    const user = await prisma.user.upsert({
      where: { email },
      update: { name },
      create: {
        email,
        name,
        passwordHash,
        emailVerifiedAt: new Date(),
      },
    });

    await createSession(user.id);

    return NextResponse.json({
      success: true,
      message: `Authenticated as ${name}.`,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    console.error("Demo login error:", error);
    return NextResponse.json({ error: "Failed to establish demo session." }, { status: 500 });
  }
}
