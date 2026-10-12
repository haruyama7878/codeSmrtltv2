import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { classroomInvitations, classroomMemberships, classrooms, users } from "@/db/schema";
import { getAuthenticatedSupabaseUser, getOrCreateAppUser } from "@/lib/server-user";
import { parseStudentCode } from "@/lib/student-code";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ classId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const authUser = await getAuthenticatedSupabaseUser(request);
  if (!authUser) return Response.json({ message: "Vui lòng đăng nhập" }, { status: 401 });

  try {
    const teacher = await getOrCreateAppUser(authUser);
    if (teacher.role !== "teacher" && teacher.role !== "admin") {
      return Response.json({ message: "Chỉ giáo viên mới được mời học sinh vào lớp" }, { status: 403 });
    }
    const classroomId = Number((await params).classId);
    if (!Number.isSafeInteger(classroomId) || classroomId < 1) {
      return Response.json({ message: "Lớp học không hợp lệ" }, { status: 400 });
    }
    const body: unknown = await request.json();
    const code = body && typeof body === "object" && "studentCode" in body && typeof body.studentCode === "string"
      ? body.studentCode.trim().toUpperCase()
      : "";
    const studentId = parseStudentCode(code);
    if (!studentId) return Response.json({ message: "Mã ID học sinh không hợp lệ" }, { status: 400 });

    const [classroom] = await db.select({ id: classrooms.id })
      .from(classrooms)
      .where(and(eq(classrooms.id, classroomId), eq(classrooms.teacherId, teacher.id)))
      .limit(1);
    if (!classroom) return Response.json({ message: "Không tìm thấy lớp học của bạn" }, { status: 404 });

    const [student] = await db.select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, studentId))
      .limit(1);
    if (!student || student.role !== "student") return Response.json({ message: "Không tìm thấy học sinh với mã ID này" }, { status: 404 });

    const [membership] = await db.select({ id: classroomMemberships.id })
      .from(classroomMemberships)
      .where(and(eq(classroomMemberships.classroomId, classroomId), eq(classroomMemberships.studentId, student.id)))
      .limit(1);
    if (membership) return Response.json({ message: "Học sinh đã là thành viên của lớp này" }, { status: 409 });

    const [invitation] = await db.insert(classroomInvitations)
      .values({ classroomId, studentId: student.id })
      .onConflictDoUpdate({
        target: [classroomInvitations.classroomId, classroomInvitations.studentId],
        set: { status: "pending", createdAt: new Date(), respondedAt: null },
      })
      .returning({ id: classroomInvitations.id, status: classroomInvitations.status });
    return Response.json({ invitation: { id: String(invitation.id), status: invitation.status } }, { status: 201 });
  } catch (error) {
    console.error("Invite student to classroom error", error);
    return Response.json({ message: "Không thể gửi lời mời vào lớp" }, { status: 500 });
  }
}
