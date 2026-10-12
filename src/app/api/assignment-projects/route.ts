import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assignmentProjects } from "@/db/schema";
import { validQuestions } from "@/lib/assignment-validation";
import { getAuthenticatedSupabaseUser, getOrCreateAppUser } from "@/lib/server-user";

export const dynamic = "force-dynamic";

const MAX_PROJECT_JSON_LENGTH = 20_000_000;

async function getTeacher(request: Request) {
  const authUser = await getAuthenticatedSupabaseUser(request);
  if (!authUser) return { response: Response.json({ message: "Vui lòng đăng nhập" }, { status: 401 }) };
  const user = await getOrCreateAppUser(authUser);
  if (user.role !== "teacher" && user.role !== "admin") {
    return { response: Response.json({ message: "Chỉ giáo viên mới được quản lý bộ dự án" }, { status: 403 }) };
  }
  return { user };
}

async function readBody(request: Request): Promise<Record<string, unknown> | Response> {
  const text = await request.text();
  if (text.length > MAX_PROJECT_JSON_LENGTH) {
    return Response.json({ message: "Dữ liệu bộ dự án quá lớn; hãy giảm kích thước ảnh." }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ message: "Thông tin bộ dự án không hợp lệ" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ message: "Thông tin bộ dự án không hợp lệ" }, { status: 400 });
  }
  return body as Record<string, unknown>;
}

function validProject(body: Record<string, unknown>): body is Record<string, unknown> & {
  name: string;
  topic: string;
  curriculumLevel: number;
  questions: import("@/lib/learning-data").QuizQuestion[];
} {
  return typeof body.name === "string" && body.name.trim().length > 0 && body.name.length <= 180
    && typeof body.topic === "string" && body.topic.trim().length > 0 && body.topic.length <= 180
    && Number.isInteger(body.curriculumLevel) && Number(body.curriculumLevel) >= 1 && Number(body.curriculumLevel) <= 6
    && validQuestions(body.questions);
}

export async function GET(request: Request) {
  try {
    const auth = await getTeacher(request);
    if ("response" in auth) return auth.response;
    const projectId = new URL(request.url).searchParams.get("id");
    if (projectId !== null) {
      const id = Number(projectId);
      if (!Number.isSafeInteger(id) || id < 1) {
        return Response.json({ message: "Bộ dự án không hợp lệ" }, { status: 400 });
      }
      const [project] = await db.select().from(assignmentProjects)
        .where(and(eq(assignmentProjects.id, id), eq(assignmentProjects.teacherId, auth.user.id)))
        .limit(1);
      if (!project) return Response.json({ message: "Không tìm thấy bộ dự án" }, { status: 404 });
      return Response.json({ project: { ...project, id: String(project.id) } });
    }
    const projects = await db.select({
      id: assignmentProjects.id,
      name: assignmentProjects.name,
      topic: assignmentProjects.topic,
      curriculumLevel: assignmentProjects.curriculumLevel,
      updatedAt: assignmentProjects.updatedAt,
    })
      .from(assignmentProjects)
      .where(eq(assignmentProjects.teacherId, auth.user.id))
      .orderBy(asc(assignmentProjects.name));
    return Response.json({ projects: projects.map((project) => ({ ...project, id: String(project.id) })) });
  } catch (error) {
    console.error("Load assignment projects error", error);
    return Response.json({ message: "Không thể tải bộ dự án" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getTeacher(request);
    if ("response" in auth) return auth.response;
    const body = await readBody(request);
    if (body instanceof Response) return body;
    if (!validProject(body)) return Response.json({ message: "Thông tin bộ dự án không hợp lệ" }, { status: 400 });
    const [project] = await db.insert(assignmentProjects).values({
      teacherId: auth.user.id,
      name: body.name.trim(),
      topic: body.topic.trim(),
      curriculumLevel: body.curriculumLevel,
      questions: body.questions,
    }).returning({
      id: assignmentProjects.id,
      name: assignmentProjects.name,
      topic: assignmentProjects.topic,
      curriculumLevel: assignmentProjects.curriculumLevel,
      updatedAt: assignmentProjects.updatedAt,
    });
    return Response.json({ project: { ...project, id: String(project.id) } }, { status: 201 });
  } catch (error) {
    console.error("Create assignment project error", error);
    return Response.json({ message: "Không thể lưu bộ dự án" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await getTeacher(request);
    if ("response" in auth) return auth.response;
    const body = await readBody(request);
    if (body instanceof Response) return body;
    const projectId = Number(body.id);
    if (!Number.isSafeInteger(projectId) || projectId < 1 || !validProject(body)) {
      return Response.json({ message: "Thông tin bộ dự án không hợp lệ" }, { status: 400 });
    }
    const [project] = await db.update(assignmentProjects).set({
      name: body.name.trim(),
      topic: body.topic.trim(),
      curriculumLevel: body.curriculumLevel,
      questions: body.questions,
      updatedAt: new Date(),
    }).where(and(eq(assignmentProjects.id, projectId), eq(assignmentProjects.teacherId, auth.user.id))).returning({
      id: assignmentProjects.id,
      name: assignmentProjects.name,
      topic: assignmentProjects.topic,
      curriculumLevel: assignmentProjects.curriculumLevel,
      updatedAt: assignmentProjects.updatedAt,
    });
    if (!project) return Response.json({ message: "Không tìm thấy bộ dự án" }, { status: 404 });
    return Response.json({ project: { ...project, id: String(project.id) } });
  } catch (error) {
    console.error("Update assignment project error", error);
    return Response.json({ message: "Không thể cập nhật bộ dự án" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await getTeacher(request);
    if ("response" in auth) return auth.response;
    const projectId = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isSafeInteger(projectId) || projectId < 1) {
      return Response.json({ message: "Bộ dự án không hợp lệ" }, { status: 400 });
    }
    const [deleted] = await db.delete(assignmentProjects)
      .where(and(eq(assignmentProjects.id, projectId), eq(assignmentProjects.teacherId, auth.user.id)))
      .returning({ id: assignmentProjects.id });
    if (!deleted) return Response.json({ message: "Không tìm thấy bộ dự án" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Delete assignment project error", error);
    return Response.json({ message: "Không thể xóa bộ dự án" }, { status: 500 });
  }
}
