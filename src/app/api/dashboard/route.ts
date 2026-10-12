import { db } from "@/db";
import { dailyActivity, lessons, quizAttempts, users } from "@/db/schema";
import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import { getAuthenticatedSupabaseUser, getOrCreateAppUser } from "@/lib/server-user";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authUser = await getAuthenticatedSupabaseUser(request);
  if (!authUser) return Response.json({ message: "Vui lòng đăng nhập" }, { status: 401 });

  try {
    const user = await getOrCreateAppUser(authUser);

    const attempts = await db
      .select()
      .from(quizAttempts)
      .where(eq(quizAttempts.userId, user.id))
      .orderBy(desc(quizAttempts.completedAt))
      .limit(20);

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const [todayActivity] = await db
      .select()
      .from(dailyActivity)
      .where(and(eq(dailyActivity.userId, user.id), eq(dailyActivity.activityDate, new Date().toISOString().slice(0, 10))))
      .limit(1);

    const [todayStats] = await db
      .select({
        correct: sql<number>`coalesce(sum(${quizAttempts.correctAnswers}), 0)::int`,
        attempts: count(),
        accuracySum: sql<number>`coalesce(sum(round(${quizAttempts.correctAnswers} * 100.0 / nullif(${quizAttempts.totalQuestions}, 0))), 0)::int`,
      })
      .from(quizAttempts)
      .where(and(eq(quizAttempts.userId, user.id), gte(quizAttempts.completedAt, todayStart)));
    const lowScoreAttempts = await db
      .select({ value: count() })
      .from(quizAttempts)
      .where(and(eq(quizAttempts.userId, user.id), lt(quizAttempts.score, 50)));

    const weekStart = new Date();
    weekStart.setUTCHours(0, 0, 0, 0);
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    const weeklyRows = await db
      .select({ userId: dailyActivity.userId, name: users.displayName, avatar: users.avatar, points: sql<number>`sum(${dailyActivity.pointsEarned})::int` })
      .from(dailyActivity)
      .innerJoin(users, eq(dailyActivity.userId, users.id))
      .where(gte(dailyActivity.activityDate, weekStart.toISOString().slice(0, 10)))
      .groupBy(dailyActivity.userId, users.displayName, users.avatar);
    const weeklyLeaderboard = weeklyRows
      .map((row) => ({ name: row.name, avatar: row.avatar, points: row.points, isCurrentUser: row.userId === user.id }))
      .sort((left, right) => right.points - left.points)
      .slice(0, 10);

    const [lessonStats] = await db.select({ total: count(), completed: sql<number>`count(distinct ${quizAttempts.lessonSlug})::int` })
      .from(lessons)
      .leftJoin(quizAttempts, and(eq(quizAttempts.lessonSlug, lessons.slug), eq(quizAttempts.userId, user.id)))
      .where(eq(lessons.published, true));
    const [scoreStats] = await db.select({ average: sql<number>`coalesce(round(avg(${quizAttempts.correctAnswers} * 100.0 / nullif(${quizAttempts.totalQuestions}, 0))), 0)::int` })
      .from(quizAttempts)
      .where(eq(quizAttempts.userId, user.id));
    const [minutesStats] = await db.select({ minutes: sql<number>`coalesce(sum(${dailyActivity.minutesLearned}), 0)::int` })
      .from(dailyActivity)
      .where(eq(dailyActivity.userId, user.id));

    return Response.json({
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        avatarUrl: user.avatarUrl ?? undefined,
        lotusPoints: user.lotusPoints,
        currentStreak: user.currentStreak,
      },
      stats: {
        completedLessons: lessonStats.completed,
        totalLessons: lessonStats.total,
        averageScore: scoreStats.average,
        learningMinutes: minutesStats.minutes,
      },
      todayActivity: {
        minutesLearned: todayActivity?.minutesLearned ?? 0,
        lessonsCompleted: todayActivity?.lessonsCompleted ?? 0,
        pointsEarned: todayActivity?.pointsEarned ?? 0,
        correctAnswers: todayStats.correct,
        attempts: todayStats.attempts,
        accuracySum: todayStats.accuracySum,
      },
      weeklyLeaderboard,
      lowScoreAttempts: lowScoreAttempts[0]?.value ?? 0,
      placement: user.placement ?? null,
      attemptHistory: attempts.map((attempt) => ({
        lessonSlug: attempt.lessonSlug,
        correctAnswers: attempt.correctAnswers,
        totalQuestions: attempt.totalQuestions,
        score: attempt.score,
        durationSeconds: attempt.durationSeconds,
        completedAt: attempt.completedAt.toISOString(),
      })),
      recentAttempts: attempts.slice(0, 8).map((attempt) => ({
        id: attempt.id,
        lessonSlug: attempt.lessonSlug,
        score: attempt.score,
        correctAnswers: attempt.correctAnswers,
        totalQuestions: attempt.totalQuestions,
        durationSeconds: attempt.durationSeconds,
        completedAt: attempt.completedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Dashboard API error", error);
    return Response.json({ message: "Không thể tải dữ liệu học tập" }, { status: 500 });
  }
}
