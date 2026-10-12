import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { classroomMemberships, classrooms, quizAttempts, users } from "@/db/schema";
import { deriveStatus, initialsOf } from "@/lib/student-data";
import { formatStudentCode } from "@/lib/student-code";
import { getAuthenticatedSupabaseUser, getOrCreateAppUser } from "@/lib/server-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ classId: string }> };

function parseClassId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(request: Request, { params }: RouteContext) {
  const authUser = await getAuthenticatedSupabaseUser(request);
  if (!authUser) return Response.json({ message: "Vui lòng đăng nhập" }, { status: 401 });

  try {
    const user = await getOrCreateAppUser(authUser);
    const classId = parseClassId((await params).classId);
    if (!classId) return Response.json({ message: "Lớp học không hợp lệ" }, { status: 400 });
    const [classroom] = await db
      .select()
      .from(classrooms)
      .where(and(eq(classrooms.id, classId), eq(classrooms.teacherId, user.id)))
      .limit(1);
    if (!classroom || (user.role !== "teacher" && user.role !== "admin")) {
      return Response.json({ message: "Không tìm thấy lớp học" }, { status: 404 });
    }

    const rows = await db
      .select({
        student: users,
        correct: quizAttempts.correctAnswers,
        score: quizAttempts.score,
        completedAt: quizAttempts.completedAt,
      })
      .from(classroomMemberships)
      .innerJoin(users, eq(classroomMemberships.studentId, users.id))
      .leftJoin(quizAttempts, eq(quizAttempts.userId, users.id))
      .where(eq(classroomMemberships.classroomId, classId))
      .orderBy(asc(users.displayName));
    const studentsById = new Map<number, {
      id: string;
      studentCode: string;
      fullName: string;
      email: string;
      birthDate: string;
      gender: "Nam" | "Nữ" | "Chưa cập nhật";
      className: string;
      parentName: string;
      parentPhone: string;
      score: number;
      lessonsCompleted: number;
      totalLessons: number;
      lastActive: string;
      status: ReturnType<typeof deriveStatus>;
    }>();
    for (const row of rows) {
      const appUser = row.student;
      const existing = studentsById.get(appUser.id);
      if (existing) {
        if (row.score !== null) {
          existing.score += row.score;
          existing.lessonsCompleted += 1;
        }
        if (row.completedAt && row.completedAt.toISOString().slice(0, 10) > existing.lastActive) {
          existing.lastActive = row.completedAt.toISOString().slice(0, 10);
        }
        continue;
      }
      const name = appUser.displayName;
      const normalizedBirthDate = appUser.birthDate?.match(/^\d{2}\/\d{2}\/\d{4}$/)
        ? `${appUser.birthDate.slice(6)}-${appUser.birthDate.slice(3, 5)}-${appUser.birthDate.slice(0, 2)}`
        : appUser.birthDate ?? "";
      studentsById.set(appUser.id, {
        id: String(appUser.id),
        studentCode: formatStudentCode(appUser.id),
        fullName: name,
        email: appUser.email,
        birthDate: normalizedBirthDate,
        gender: "Chưa cập nhật",
        className: classroom.label,
        parentName: "Chưa cập nhật",
        parentPhone: "Chưa cập nhật",
        score: row.score ?? 0,
        lessonsCompleted: row.score === null ? 0 : 1,
        totalLessons: 100,
        lastActive: row.completedAt?.toISOString().slice(0, 10) ?? appUser.lastActiveAt.toISOString().slice(0, 10),
        status: deriveStatus(row.score ?? 0),
      });
    }
    const students = [...studentsById.values()].map((student) => {
      const lessonsCompleted = student.lessonsCompleted;
      const score = lessonsCompleted ? Math.round(student.score / lessonsCompleted) : 0;
      return { ...student, score, status: deriveStatus(score) };
    });
    return Response.json({
      classroom: { ...classroom, id: String(classroom.id) },
      students,
      initials: students.map((student) => ({ id: student.id, value: initialsOf(student.fullName) })),
    });
  } catch (error) {
    console.error("Load classroom details error", error);
    return Response.json({ message: "Không thể tải thông tin lớp học" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const authUser = await getAuthenticatedSupabaseUser(request);
  if (!authUser) return Response.json({ message: "Vui lòng đăng nhập" }, { status: 401 });

  try {
    const user = await getOrCreateAppUser(authUser);
    if (user.role !== "teacher" && user.role !== "admin") {
      return Response.json({ message: "Chỉ giáo viên mới được xoá lớp học" }, { status: 403 });
    }
    const classId = parseClassId((await params).classId);
    if (!classId) return Response.json({ message: "Lớp học không hợp lệ" }, { status: 400 });
    const deleted = await db
      .delete(classrooms)
      .where(and(eq(classrooms.id, classId), eq(classrooms.teacherId, user.id)))
      .returning({ id: classrooms.id });
    if (!deleted.length) return Response.json({ message: "Không tìm thấy lớp học" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Delete classroom error", error);
    return Response.json({ message: "Không thể xoá lớp học" }, { status: 500 });
  }
}
