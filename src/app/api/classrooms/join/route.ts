import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { classroomMemberships, classrooms, users } from "@/db/schema";
import { getAuthenticatedSupabaseUser, getOrCreateAppUser } from "@/lib/server-user";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authUser = await getAuthenticatedSupabaseUser(request);
  if (!authUser) return Response.json({ message: "Vui lòng đăng nhập" }, { status: 401 });

  try {
    const student = await getOrCreateAppUser(authUser);
    if (student.role !== "student") {
      return Response.json({ message: "Chỉ học sinh mới có thể tham gia lớp bằng mã lớp" }, { status: 403 });
    }
    const body: unknown = await request.json();
    const code = body && typeof body === "object" && "code" in body && typeof body.code === "string"
      ? body.code.trim().toUpperCase()
      : "";
    if (!/^[A-F0-9]{10}$/.test(code)) return Response.json({ message: "Mã lớp không hợp lệ" }, { status: 400 });

    const [classroom] = await db.select().from(classrooms).where(eq(classrooms.joinCode, code)).limit(1);
    if (!classroom) return Response.json({ message: "Không tìm thấy lớp với mã này" }, { status: 404 });

    await db
      .insert(classroomMemberships)
      .values({ classroomId: classroom.id, studentId: student.id })
      .onConflictDoNothing();

    const [teacher] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, classroom.teacherId)).limit(1);
    return Response.json({
      classroom: {
        id: String(classroom.id),
        name: classroom.name,
        label: classroom.label,
        subject: classroom.subject,
        description: classroom.description,
        color: classroom.color,
        teacherName: teacher?.displayName ?? "Giáo viên",
      },
    }, { status: 200 });
  } catch (error) {
    console.error("Join classroom error", error);
    return Response.json({ message: "Không thể tham gia lớp học" }, { status: 500 });
  }
}
