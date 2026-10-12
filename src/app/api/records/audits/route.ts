import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/security/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const audits = await prisma.deletionAudit.findMany({
      where: {
        deletedByUserId: session.user.id,
      },
      orderBy: {
        deletedAt: "desc",
      },
      take: 20,
    });

    return NextResponse.json({ audits });
  } catch (error) {
    console.error("List audits error:", error);
    return NextResponse.json({ error: "Failed to fetch deletion audits." }, { status: 500 });
  }
}
