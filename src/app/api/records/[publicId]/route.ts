import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/security/session";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/records/[publicId]
 * Detail view: enforces structural ownership query.
 * Distinguishes 401 (unauthenticated), 403 (cross-user access forbidden), 404 (non-existent).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const { publicId } = await params;

    // Structural ownership query: WHERE publicId = ? AND userId = ?
    const record = await prisma.record.findFirst({
      where: {
        publicId,
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
    });

    if (record) {
      return NextResponse.json({ record });
    }

    // Distinguish 403 (Cross-user unauthorized attempt) vs 404 (Does not exist)
    const existsForOtherUser = await prisma.record.findUnique({
      where: { publicId },
      select: { userId: true },
    });

    if (existsForOtherUser) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to access another user's record." },
        { status: 403 }
      );
    }

    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  } catch (error) {
    console.error("Get record detail error:", error);
    return NextResponse.json({ error: "Failed to resolve record." }, { status: 500 });
  }
}

/**
 * DELETE /api/records/[publicId]
 * Deletion flow:
 * 1. Enforces structural ownership (cannot delete another user's record)
 * 2. Writes full deletion audit log BEFORE / transactionally with record deletion
 * 3. Deletes record while preserving the audit record independently
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const { publicId } = await params;

    // Verify ownership before mutation
    const targetRecord = await prisma.record.findFirst({
      where: {
        publicId,
        userId: session.user.id,
      },
    });

    if (!targetRecord) {
      // Check if it exists for another user to return 403
      const existsForOtherUser = await prisma.record.findUnique({
        where: { publicId },
        select: { userId: true },
      });

      if (existsForOtherUser) {
        return NextResponse.json(
          { error: "Forbidden: You cannot delete another user's record." },
          { status: 403 }
        );
      }

      return NextResponse.json({ error: "Record not found." }, { status: 404 });
    }

    // Transactionally persist Deletion Audit BEFORE deleting the record
    await prisma.$transaction(async (tx) => {
      // Step A: Record full audit snapshot
      await tx.deletionAudit.create({
        data: {
          recordPublicId: targetRecord.publicId,
          recordTitle: targetRecord.title,
          recordSnapshot: {
            title: targetRecord.title,
            content: targetRecord.content,
            category: targetRecord.category,
            status: targetRecord.status,
            createdAt: targetRecord.createdAt.toISOString(),
          },
          deletedByUserId: session.user.id,
          deletedByUserEmail: session.user.email,
          deletedAt: new Date(),
        },
      });

      // Step B: Delete the record
      await tx.record.delete({
        where: { id: targetRecord.id },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Record deleted and permanent audit logged.",
      publicId,
    });
  } catch (error) {
    console.error("Delete record error:", error);
    return NextResponse.json({ error: "Failed to delete record." }, { status: 500 });
  }
}
