import { db } from "@/db";
import { dailyActivity, quizAttempts, users } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getAuthenticatedSupabaseUser, getOrCreateAppUser } from "@/lib/server-user";

export const dynamic = "force-dynamic";

function isValidDifficulty(value: unknown): value is "A" | "B" | "C" | "D" | "E" {
  return typeof value === "string" && ["A", "B", "C", "D", "E"].includes(value);
}

function learnedMinutes(durationSeconds: number, totalQuestions: number) {
  const baseline = totalQuestions * 30;
  const speedBonus = durationSeconds < baseline
    ? Math.max(1, Math.round((baseline - durationSeconds) / 60))
    : 0;
  return Math.max(1, Math.round(durationSeconds / 60 + speedBonus));
}

export async function POST(request: Request) {
  const authUser = await getAuthenticatedSupabaseUser(request);
  if (!authUser) return Response.json({ message: "Vui lòng đăng nhập" }, { status: 401 });

  try {
    const body = await request.json();
    if (
      typeof body.lessonSlug !== "string" || body.lessonSlug.length < 1 || body.lessonSlug.length > 120 ||
      typeof body.correctAnswers !== "number" ||
      typeof body.totalQuestions !== "number" ||
      typeof body.score !== "number" ||
      typeof body.durationSeconds !== "number" ||
      !isValidDifficulty(body.highestDifficulty) ||
      !Array.isArray(body.answers) || body.answers.length > 20 ||
      !body.answers.every((answer: unknown) => answer && typeof answer === "object"
        && Number.isInteger((answer as { questionId?: unknown }).questionId)
        && typeof (answer as { answer?: unknown }).answer === "string"
        && typeof (answer as { correct?: unknown }).correct === "boolean")
    ) {
      return Response.json({ message: "Dữ liệu bài làm không hợp lệ" }, { status: 400 });
    }

    const student = await getOrCreateAppUser(authUser);
    const safeScore = Math.max(0, Math.min(1750, Math.round(body.score)));
    const safeDuration = Math.max(1, Math.min(3600, Math.round(body.durationSeconds)));
    const totalQuestions = Math.max(1, Math.min(20, Math.round(body.totalQuestions)));
    const safeCorrect = Math.max(0, Math.min(totalQuestions, Math.round(body.correctAnswers)));
    const minutesLearned = learnedMinutes(safeDuration, totalQuestions);
    const today = new Date().toISOString().slice(0, 10);
    const activity = await db.transaction(async (transaction) => {
      const [attempt] = await transaction
        .insert(quizAttempts)
        .values({
          userId: student.id,
          lessonSlug: body.lessonSlug,
          correctAnswers: safeCorrect,
          totalQuestions,
          score: safeScore,
          durationSeconds: safeDuration,
          highestDifficulty: body.highestDifficulty,
          answers: body.answers,
        })
        .returning({ id: quizAttempts.id });

      const [todayActivity] = await transaction
        .select({ id: dailyActivity.id })
        .from(dailyActivity)
        .where(and(eq(dailyActivity.userId, student.id), eq(dailyActivity.activityDate, today)))
        .limit(1);
      const yesterday = new Date(`${today}T00:00:00.000Z`);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const lastActiveDate = student.lastActiveAt.toISOString().slice(0, 10);
      const currentStreak = todayActivity
        ? student.currentStreak
        : lastActiveDate === yesterday.toISOString().slice(0, 10) ? student.currentStreak + 1 : 1;

      await transaction.update(users).set({
        lotusPoints: sql`${users.lotusPoints} + ${safeScore}`,
        currentStreak,
        longestStreak: Math.max(student.longestStreak, currentStreak),
        lastActiveAt: new Date(),
      }).where(eq(users.id, student.id));

      await transaction
        .insert(dailyActivity)
        .values({
          userId: student.id,
          activityDate: today,
          minutesLearned,
          lessonsCompleted: 1,
          pointsEarned: safeScore,
        })
        .onConflictDoUpdate({
          target: [dailyActivity.userId, dailyActivity.activityDate],
          set: {
            minutesLearned: sql`${dailyActivity.minutesLearned} + ${minutesLearned}`,
            lessonsCompleted: sql`${dailyActivity.lessonsCompleted} + 1`,
            pointsEarned: sql`${dailyActivity.pointsEarned} + ${safeScore}`,
          },
        });

      const [updated] = await transaction.select({ lotusPoints: users.lotusPoints }).from(users).where(eq(users.id, student.id));
      return { attemptId: attempt.id, totalPoints: updated.lotusPoints };
    });

    return Response.json({ ok: true, ...activity });
  } catch (error) {
    console.error("Attempt API error", error);
    return Response.json({ message: "Chưa thể lưu kết quả bài làm" }, { status: 500 });
  }
}
