import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { classroomInvitations, classrooms, users } from "@/db/schema";
import { getAuthenticatedSupabaseUser, getOrCreateAppUser } from "@/lib/server-user";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authUser = await getAuthenticatedSupabaseUser(request);
  if (!authUser) return Response.json({ message: "Vui lòng đăng nhập" }, { status: 401 });

  try {
    const student = await getOrCreateAppUser(authUser);
    if (student.role !== "student") return Response.json({ message: "Chỉ học sinh mới có lời mời lớp" }, { status: 403 });
    const rows = await db.select({
      id: classroomInvitations.id,
      status: classroomInvitations.status,
      createdAt: classroomInvitations.createdAt,
      classroomId: classrooms.id,
      classroomName: classrooms.name,
      classroomLabel: classrooms.label,
      subject: classrooms.subject,
      teacherName: users.displayName,
    })
      .from(classroomInvitations)
      .innerJoin(classrooms, eq(classroomInvitations.classroomId, classrooms.id))
      .innerJoin(users, eq(classrooms.teacherId, users.id))
      .where(and(eq(classroomInvitations.studentId, student.id), eq(classroomInvitations.status, "pending")))
      .orderBy(asc(classroomInvitations.createdAt));
    return Response.json({
      invitations: rows.map((row) => ({
        id: String(row.id),
        classroomId: String(row.classroomId),
        classroomName: row.classroomName,
        classroomLabel: row.classroomLabel,
        subject: row.subject,
        teacherName: row.teacherName,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Load classroom invitations error", error);
    return Response.json({ message: "Không thể tải lời mời vào lớp" }, { status: 500 });
  }
}
