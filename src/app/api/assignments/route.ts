import { and, asc, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  assignmentSubmissions,
  classroomAssignments,
  classroomMemberships,
  classrooms,
} from "@/db/schema";
import { validQuestions } from "@/lib/assignment-validation";
import { isAnswerModeCompatible } from "@/lib/learning-data";
import { getAuthenticatedSupabaseUser, getOrCreateAppUser } from "@/lib/server-user";

export const dynamic = "force-dynamic";

const MAX_ASSIGNMENT_JSON_LENGTH = 20_000_000;

export async function GET(request: Request) {
  const authUser = await getAuthenticatedSupabaseUser(request);
  if (!authUser) return Response.json({ message: "Vui lòng đăng nhập" }, { status: 401 });

  try {
    const user = await getOrCreateAppUser(authUser);
    if (user.role === "teacher" || user.role === "admin") {
      const rows = await db
        .select({
          assignment: classroomAssignments,
          classroom: {
            id: classrooms.id,
            name: classrooms.name,
            label: classrooms.label,
          },
          submissionCount: count(assignmentSubmissions.id),
        })
        .from(classroomAssignments)
        .innerJoin(classrooms, eq(classroomAssignments.classroomId, classrooms.id))
        .leftJoin(assignmentSubmissions, eq(assignmentSubmissions.assignmentId, classroomAssignments.id))
        .where(eq(classrooms.teacherId, user.id))
        .groupBy(classroomAssignments.id, classrooms.id)
        .orderBy(asc(classroomAssignments.dueAt));
      const classIds = [...new Set(rows.map((row) => row.classroom.id))];
      const members = classIds.length
        ? await db.select({ classroomId: classroomMemberships.classroomId, memberCount: count() })
          .from(classroomMemberships)
          .where(inArray(classroomMemberships.classroomId, classIds))
          .groupBy(classroomMemberships.classroomId)
        : [];
      const counts = new Map(members.map((row) => [row.classroomId, row.memberCount]));
      return Response.json({
        assignments: rows.map((row) => ({
          id: String(row.assignment.id),
          title: row.assignment.title,
          topic: row.assignment.topic,
          curriculumLevel: row.assignment.curriculumLevel,
          dueDate: row.assignment.dueAt.toISOString(),
          durationMinutes: row.assignment.durationMinutes,
          questions: row.assignment.questions,
          createdAt: row.assignment.createdAt.toISOString(),
          classroomId: String(row.assignment.classroomId),
          classroom: { ...row.classroom, id: String(row.classroom.id) },
          totalStudents: counts.get(row.classroom.id) ?? 0,
          submittedCount: row.submissionCount,
          gradedCount: 0,
          className: row.classroom.label,
        })),
      });
    }

    const rows = await db
      .select({
        assignment: classroomAssignments,
        classroom: {
          id: classrooms.id,
          name: classrooms.name,
          label: classrooms.label,
          subject: classrooms.subject,
          teacherId: classrooms.teacherId,
        },
        submission: assignmentSubmissions,
      })
      .from(classroomMemberships)
      .innerJoin(classroomAssignments, eq(classroomAssignments.classroomId, classroomMemberships.classroomId))
      .innerJoin(classrooms, eq(classrooms.id, classroomMemberships.classroomId))
      .leftJoin(
        assignmentSubmissions,
        and(
          eq(assignmentSubmissions.assignmentId, classroomAssignments.id),
          eq(assignmentSubmissions.studentId, user.id),
        ),
      )
      .where(eq(classroomMemberships.studentId, user.id))
      .orderBy(asc(classroomAssignments.dueAt));
    return Response.json({
      assignments: rows.map((row) => ({
        id: String(row.assignment.id),
        title: row.assignment.title,
        topic: row.assignment.topic,
        curriculumLevel: row.assignment.curriculumLevel,
        dueDate: row.assignment.dueAt.toISOString(),
        durationMinutes: row.assignment.durationMinutes,
        questions: row.assignment.questions,
        createdAt: row.assignment.createdAt.toISOString(),
        classroomId: String(row.assignment.classroomId),
        classroom: { ...row.classroom, id: String(row.classroom.id) },
        submission: row.submission ? {
          score: row.submission.score,
          correctAnswers: row.submission.correctAnswers,
          totalQuestions: row.submission.totalQuestions,
          submittedAt: row.submission.submittedAt,
        } : null,
      })),
    });
  } catch (error) {
    console.error("Load assignments error", error);
    return Response.json({ message: "Không thể tải danh sách bài tập" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authUser = await getAuthenticatedSupabaseUser(request);
  if (!authUser) return Response.json({ message: "Vui lòng đăng nhập" }, { status: 401 });

  try {
    const teacher = await getOrCreateAppUser(authUser);
    if (teacher.role !== "teacher" && teacher.role !== "admin") {
      return Response.json({ message: "Chỉ giáo viên mới được giao bài tập" }, { status: 403 });
    }
    const bodyText = await request.text();
    if (bodyText.length > MAX_ASSIGNMENT_JSON_LENGTH) {
      return Response.json({ message: "Ảnh đính kèm quá lớn; hãy giảm kích thước ảnh." }, { status: 413 });
    }
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return Response.json({ message: "Thông tin bài tập không hợp lệ" }, { status: 400 });
    }
    if (!body || typeof body !== "object") return Response.json({ message: "Thông tin bài tập không hợp lệ" }, { status: 400 });
    const value = body as Record<string, unknown>;
    const classroomId = Number(value.classroomId);
    const dueAt = typeof value.dueAt === "string" ? new Date(value.dueAt) : new Date(Number.NaN);
    if (!Number.isSafeInteger(classroomId) || classroomId < 1
      || typeof value.title !== "string" || !value.title.trim() || value.title.length > 180
      || typeof value.topic !== "string" || !value.topic.trim() || value.topic.length > 180
      || !Number.isInteger(value.curriculumLevel) || Number(value.curriculumLevel) < 1 || Number(value.curriculumLevel) > 6
      || Number.isNaN(dueAt.getTime())
      || !Number.isInteger(value.durationMinutes) || Number(value.durationMinutes) < 1 || Number(value.durationMinutes) > 240
      || !validQuestions(value.questions)) {
      return Response.json({ message: "Thông tin bài tập không hợp lệ" }, { status: 400 });
    }
    const [classroom] = await db
      .select({
        id: classrooms.id,
        name: classrooms.name,
        label: classrooms.label,
        studentCount: count(classroomMemberships.id),
      })
      .from(classrooms)
      .leftJoin(classroomMemberships, eq(classroomMemberships.classroomId, classrooms.id))
      .where(and(eq(classrooms.id, classroomId), eq(classrooms.teacherId, teacher.id)))
      .groupBy(classrooms.id)
      .limit(1);
    if (!classroom) return Response.json({ message: "Không tìm thấy lớp học của bạn" }, { status: 404 });

    const [created] = await db
      .insert(classroomAssignments)
      .values({
        classroomId,
        title: value.title.trim(),
        topic: value.topic.trim(),
        curriculumLevel: Number(value.curriculumLevel),
        dueAt,
        durationMinutes: Number(value.durationMinutes),
        questions: value.questions,
      })
      .returning();
    return Response.json({
      assignment: {
        id: String(created.id),
        title: created.title,
        topic: created.topic,
        curriculumLevel: created.curriculumLevel,
        dueDate: created.dueAt.toISOString(),
        durationMinutes: created.durationMinutes,
        questions: created.questions,
        classroomId: String(created.classroomId),
        classroom: { id: String(classroom.id), name: classroom.name, label: classroom.label },
        totalStudents: classroom.studentCount,
        submittedCount: 0,
        gradedCount: 0,
        className: classroom.label,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Create assignment error", error);
    return Response.json({ message: "Không thể giao bài tập" }, { status: 500 });
  }
}
