import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { lessons } from "@/db/schema";
import { getAuthenticatedSupabaseUser } from "@/lib/server-user";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authUser = await getAuthenticatedSupabaseUser(request);
  if (!authUser) return Response.json({ message: "Vui lòng đăng nhập" }, { status: 401 });

  try {
    const publishedLessons = await db
      .select({
        id: lessons.id,
        slug: lessons.slug,
        curriculumLevel: lessons.curriculumLevel,
        title: lessons.title,
        topic: lessons.topic,
        competency: lessons.competency,
        questionCount: lessons.questionCount,
      })
      .from(lessons)
      .where(eq(lessons.published, true))
      .orderBy(asc(lessons.curriculumLevel), asc(lessons.id));

    return Response.json({ lessons: publishedLessons });
  } catch (error) {
    console.error("Lessons API error", error);
    return Response.json({ message: "Không thể tải danh sách bài học" }, { status: 500 });
  }
}
