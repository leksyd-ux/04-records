import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/security/session";
import { prisma } from "@/lib/prisma";
import { generatePublicId } from "@/lib/records/id";
import { CreateRecordSchema } from "@/lib/records/validation";

/**
 * GET /api/records
 * Lists records owned strictly by the authenticated user.
 * Structural invariant: WHERE userId = session.user.id
 */
export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    // Single indexed query scoped strictly to authenticated user
    const records = await prisma.record.findMany({
      where: {
        userId: session.user.id,
      },
      select: {
        publicId: true,
        title: true,
        content: true,
        category: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      records,
      count: records.length,
      user: { id: session.user.id, email: session.user.email, name: session.user.name },
    });
  } catch (error) {
    console.error("List records error:", error);
    return NextResponse.json({ error: "Failed to fetch records." }, { status: 500 });
  }
}

/**
 * POST /api/records
 * Creates a new record owned by the authenticated user with an opaque publicId.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const parseResult = CreateRecordSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { title, content, category, status } = parseResult.data;
    const publicId = generatePublicId();

    const record = await prisma.record.create({
      data: {
        publicId,
        userId: session.user.id,
        title,
        content,
        category,
        status,
      },
      select: {
        publicId: true,
        title: true,
        content: true,
        category: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Record created successfully.",
        record,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create record error:", error);
    return NextResponse.json({ error: "Failed to create record." }, { status: 500 });
  }
}
