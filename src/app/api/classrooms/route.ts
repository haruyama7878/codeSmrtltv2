import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { classroomMemberships, classrooms, users } from "@/db/schema";
import { getAuthenticatedSupabaseUser, getOrCreateAppUser } from "@/lib/server-user";

export const dynamic = "force-dynamic";

function validClassroomInput(body: unknown): body is {
  name: string;
  label: string;
  subject: string;
  description: string;
  color: string;
} {
  if (!body || typeof body !== "object") return false;
  const value = body as Record<string, unknown>;
  return typeof value.name === "string" && value.name.trim().length > 0 && value.name.length <= 120
    && typeof value.label === "string" && value.label.trim().length > 0 && value.label.length <= 40
    && typeof value.subject === "string" && value.subject.trim().length > 0 && value.subject.length <= 80
    && typeof value.description === "string" && value.description.length <= 500
    && typeof value.color === "string" && ["purple", "teal", "pink", "amber", "blue", "green"].includes(value.color);
}

export async function GET(request: Request) {
  const authUser = await getAuthenticatedSupabaseUser(request);
  if (!authUser) return Response.json({ message: "Vui lòng đăng nhập" }, { status: 401 });

  try {
    const user = await getOrCreateAppUser(authUser);
    if (user.role === "teacher" || user.role === "admin") {
      const rows = await db
        .select({
          id: classrooms.id,
          name: classrooms.name,
          label: classrooms.label,
          subject: classrooms.subject,
          description: classrooms.description,
          color: classrooms.color,
          joinCode: classrooms.joinCode,
          studentCount: classroomMemberships.id,
        })
        .from(classrooms)
        .leftJoin(classroomMemberships, eq(classroomMemberships.classroomId, classrooms.id))
        .where(eq(classrooms.teacherId, user.id))
        .orderBy(asc(classrooms.createdAt));
      const grouped = new Map<number, (typeof rows)[number] & { studentCount: number }>();
      for (const row of rows) {
        const existing = grouped.get(row.id);
        if (existing) existing.studentCount += row.studentCount === null ? 0 : 1;
        else grouped.set(row.id, { ...row, studentCount: row.studentCount === null ? 0 : 1 });
      }
      return Response.json({ classrooms: [...grouped.values()].map(({ studentCount, ...item }) => ({ ...item, id: String(item.id), studentCount })) });
    }

    const memberships = await db
      .select({
        id: classrooms.id,
        name: classrooms.name,
        label: classrooms.label,
        subject: classrooms.subject,
        description: classrooms.description,
        color: classrooms.color,
        teacherName: users.displayName,
        joinedAt: classroomMemberships.joinedAt,
      })
      .from(classroomMemberships)
      .innerJoin(classrooms, eq(classroomMemberships.classroomId, classrooms.id))
      .innerJoin(users, eq(classrooms.teacherId, users.id))
      .where(eq(classroomMemberships.studentId, user.id))
      .orderBy(asc(classrooms.name));
    return Response.json({ classrooms: memberships.map((item) => ({ ...item, id: String(item.id) })) });
  } catch (error) {
    console.error("Load classrooms error", error);
    return Response.json({ message: "Không thể tải danh sách lớp học" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authUser = await getAuthenticatedSupabaseUser(request);
  if (!authUser) return Response.json({ message: "Vui lòng đăng nhập" }, { status: 401 });

  try {
    const user = await getOrCreateAppUser(authUser);
    if (user.role !== "teacher" && user.role !== "admin") {
      return Response.json({ message: "Chỉ giáo viên mới được tạo lớp học" }, { status: 403 });
    }
    const body: unknown = await request.json();
    if (!validClassroomInput(body)) return Response.json({ message: "Thông tin lớp học không hợp lệ" }, { status: 400 });

    const [created] = await db
      .insert(classrooms)
      .values({
        teacherId: user.id,
        name: body.name.trim(),
        label: body.label.trim().toUpperCase(),
        subject: body.subject.trim(),
        description: body.description.trim(),
        color: body.color,
        joinCode: randomBytes(5).toString("hex").toUpperCase(),
      })
      .returning();
    return Response.json({ classroom: { ...created, id: String(created.id), studentCount: 0 } }, { status: 201 });
  } catch (error) {
    console.error("Create classroom error", error);
    return Response.json({ message: "Không thể tạo lớp học" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authUser = await getAuthenticatedSupabaseUser(request);
  if (!authUser) return Response.json({ message: "Vui lòng đăng nhập" }, { status: 401 });

  try {
    const user = await getOrCreateAppUser(authUser);
    if (user.role !== "teacher" && user.role !== "admin") {
      return Response.json({ message: "Chỉ giáo viên mới được cập nhật lớp học" }, { status: 403 });
    }
    const body: unknown = await request.json();
    const value = body as Record<string, unknown> | null;
    const id = Number(value?.id);
    if (!validClassroomInput(value) || !Number.isSafeInteger(id) || id < 1) {
      return Response.json({ message: "Thông tin lớp học không hợp lệ" }, { status: 400 });
    }
    const [updated] = await db
      .update(classrooms)
      .set({
        name: value.name.trim(),
        label: value.label.trim().toUpperCase(),
        subject: value.subject.trim(),
        description: value.description.trim(),
        color: value.color,
      })
      .where(and(eq(classrooms.id, id), eq(classrooms.teacherId, user.id)))
      .returning();
    if (!updated) return Response.json({ message: "Không tìm thấy lớp học" }, { status: 404 });
    return Response.json({ classroom: { ...updated, id: String(updated.id) } });
  } catch (error) {
    console.error("Update classroom error", error);
    return Response.json({ message: "Không thể cập nhật lớp học" }, { status: 500 });
  }
}
