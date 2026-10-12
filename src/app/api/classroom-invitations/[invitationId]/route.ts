import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { classroomInvitations, classroomMemberships } from "@/db/schema";
import { getAuthenticatedSupabaseUser, getOrCreateAppUser } from "@/lib/server-user";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ invitationId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const authUser = await getAuthenticatedSupabaseUser(request);
  if (!authUser) return Response.json({ message: "Vui lòng đăng nhập" }, { status: 401 });

  try {
    const student = await getOrCreateAppUser(authUser);
    if (student.role !== "student") return Response.json({ message: "Chỉ học sinh mới có thể phản hồi lời mời" }, { status: 403 });
    const invitationId = Number((await params).invitationId);
    if (!Number.isSafeInteger(invitationId) || invitationId < 1) {
      return Response.json({ message: "Lời mời không hợp lệ" }, { status: 400 });
    }
    const body: unknown = await request.json();
    const decision = body && typeof body === "object" && "decision" in body ? body.decision : null;
    if (decision !== "accepted" && decision !== "declined") {
      return Response.json({ message: "Phản hồi lời mời không hợp lệ" }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {
      const [invitation] = await tx.select()
        .from(classroomInvitations)
        .where(and(
          eq(classroomInvitations.id, invitationId),
          eq(classroomInvitations.studentId, student.id),
          eq(classroomInvitations.status, "pending"),
        ))
        .limit(1);
      if (!invitation) return null;

      if (decision === "accepted") {
        await tx.insert(classroomMemberships)
          .values({ classroomId: invitation.classroomId, studentId: student.id })
          .onConflictDoNothing();
      }
      const [updated] = await tx.update(classroomInvitations)
        .set({ status: decision, respondedAt: new Date() })
        .where(eq(classroomInvitations.id, invitationId))
        .returning({ id: classroomInvitations.id, status: classroomInvitations.status });
      return updated;
    });
    if (!result) return Response.json({ message: "Lời mời không còn hiệu lực" }, { status: 404 });
    return Response.json({ invitation: { id: String(result.id), status: result.status } });
  } catch (error) {
    console.error("Respond to classroom invitation error", error);
    return Response.json({ message: "Không thể phản hồi lời mời" }, { status: 500 });
  }
}
