import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { assignmentSubmissions, classroomAssignments, classroomMemberships } from "@/db/schema";
import type { AnswerMode, QuizQuestion } from "@/lib/learning-data";
import { getAuthenticatedSupabaseUser, getOrCreateAppUser } from "@/lib/server-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ assignmentId: string }> };

function validAnswerForQuestion(question: QuizQuestion, answer: string): boolean {
  const mode: AnswerMode = question.answerMode ?? "choice";
  if (mode === "choice") return question.options.includes(answer);
  if (mode === "image-choice") return question.options.includes(answer);
  if (mode === "image-select") {
    const selected = new Set(answer.split("|"));
    return selected.size > 0
      && selected.size === answer.split("|").length
      && [...selected].every((option) => question.options.includes(option))
      && question.options.filter((option) => selected.has(option)).join("|") === answer;
  }
  if (answer === question.correctAnswer) return true;
  if (mode === "type") return /^(?:-|\d{1,6}|-\d{1,6})$/.test(answer);
  if (mode === "line") return /^\d{1,2}$/.test(answer) && Number(answer) <= 20;
  if (mode === "complete") return /^(?:\d+|[+\-×÷−])(?: (?:\d+|[+\-×÷−]))*$/.test(answer);
  if (mode === "match") return answer === "Ghép cặp";
  return /^\d+\s*[+−\-×÷]\s*\d+(?:\s*\|\s*\d+\s*[+−\-×÷]\s*\d+)*$/.test(answer);
}

export async function POST(request: Request, { params }: RouteContext) {
  const authUser = await getAuthenticatedSupabaseUser(request);
  if (!authUser) return Response.json({ message: "Vui lòng đăng nhập" }, { status: 401 });

  try {
    const student = await getOrCreateAppUser(authUser);
    if (student.role !== "student") return Response.json({ message: "Chỉ học sinh mới có thể nộp bài" }, { status: 403 });
    const assignmentId = Number((await params).assignmentId);
    if (!Number.isSafeInteger(assignmentId) || assignmentId < 1) {
      return Response.json({ message: "Bài tập không hợp lệ" }, { status: 400 });
    }
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return Response.json({ message: "Kết quả bài làm không hợp lệ" }, { status: 400 });
    const value = body as Record<string, unknown>;
    const answersValid = Array.isArray(value.answers) && value.answers.length >= 1 && value.answers.length <= 20
      && value.answers.every((answer: unknown) => answer && typeof answer === "object"
        && Number.isInteger((answer as { questionId?: unknown }).questionId)
        && typeof (answer as { answer?: unknown }).answer === "string");
    if (!Number.isInteger(value.durationSeconds) || Number(value.durationSeconds) < 1 || Number(value.durationSeconds) > 3600
      || !Number.isInteger(value.challengeDurationSeconds) || Number(value.challengeDurationSeconds) < 0 || Number(value.challengeDurationSeconds) > 3600
      || !answersValid) {
      return Response.json({ message: "Kết quả bài làm không hợp lệ" }, { status: 400 });
    }

    const [assignment] = await db
      .select({ assignment: classroomAssignments })
      .from(classroomAssignments)
      .innerJoin(classroomMemberships, eq(classroomMemberships.classroomId, classroomAssignments.classroomId))
      .where(and(eq(classroomAssignments.id, assignmentId), eq(classroomMemberships.studentId, student.id)))
      .limit(1);
    if (!assignment) return Response.json({ message: "Bài tập này chưa được giao cho lớp của bạn" }, { status: 403 });
    const answerByQuestion = new Map<number, string>();
    for (const answer of value.answers as Array<{ questionId: number; answer: string }>) {
      if (answerByQuestion.has(answer.questionId)) {
        return Response.json({ message: "Câu trả lời bị trùng lặp" }, { status: 400 });
      }
      answerByQuestion.set(answer.questionId, answer.answer);
    }
    const questions = assignment.assignment.questions;
    if (answerByQuestion.size !== questions.length
      || questions.some((question) => !answerByQuestion.has(question.id))) {
      return Response.json({ message: "Bài làm chưa trả lời đủ câu hỏi" }, { status: 400 });
    }
    if (questions.some((question) => !validAnswerForQuestion(question, answerByQuestion.get(question.id)!))) {
      return Response.json({ message: "Câu trả lời không hợp lệ với kiểu trả lời của câu hỏi" }, { status: 400 });
    }
    const answers = questions.map((question) => {
      const answer = answerByQuestion.get(question.id)!;
      return {
        questionId: question.id,
        answer,
        correct: answer.trim().toLocaleLowerCase() === question.correctAnswer.trim().toLocaleLowerCase(),
      };
    });
    const normalCorrect = answers.filter((answer) => answer.correct
      && questions.find((question) => question.id === answer.questionId)?.phase === "normal").length;
    const challengeCorrect = answers.filter((answer) => answer.correct
      && questions.find((question) => question.id === answer.questionId)?.phase === "challenge").length;
    const challengeSeconds = Math.min(180, Math.max(0, Number(value.challengeDurationSeconds)));
    const score = Math.min(1750,
      normalCorrect * 120
      + challengeCorrect * 80
      + (challengeCorrect ? Math.round(100 * (1 - challengeSeconds / 180)) : 0));

    const [submission] = await db
      .insert(assignmentSubmissions)
      .values({
        assignmentId,
        studentId: student.id,
        score,
        correctAnswers: normalCorrect + challengeCorrect,
        totalQuestions: questions.length,
        durationSeconds: Number(value.durationSeconds),
        answers,
      })
      .onConflictDoUpdate({
        target: [assignmentSubmissions.assignmentId, assignmentSubmissions.studentId],
        set: {
          score,
          correctAnswers: normalCorrect + challengeCorrect,
          totalQuestions: questions.length,
          durationSeconds: Number(value.durationSeconds),
          answers,
          submittedAt: new Date(),
        },
      })
      .returning({
        score: assignmentSubmissions.score,
        correctAnswers: assignmentSubmissions.correctAnswers,
        totalQuestions: assignmentSubmissions.totalQuestions,
        submittedAt: assignmentSubmissions.submittedAt,
      });
    return Response.json({
      submission: { ...submission, submittedAt: submission.submittedAt.toISOString() },
    });
  } catch (error) {
    console.error("Submit assignment error", error);
    return Response.json({ message: "Không thể nộp bài tập" }, { status: 500 });
  }
}
