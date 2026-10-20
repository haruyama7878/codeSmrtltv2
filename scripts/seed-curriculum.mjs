import dotenv from "dotenv";
import pg from "pg";
import { curriculum } from "../src/lib/learning-data.ts";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const databaseUrl = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("SUPABASE_DATABASE_URL or DATABASE_URL is required to seed curriculum lessons");
}

const pool = new pg.Pool({ connectionString: databaseUrl });

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

try {
  const client = await pool.connect();
  let upserted = 0;
  let linkedAttempts = 0;
  try {
    await client.query("begin");
    for (const level of curriculum) {
      for (const title of level.lessons) {
        await client.query(
          `insert into lessons (slug, curriculum_level, title, topic, competency, question_count, published)
           values ($1, $2, $3, $3, $4, 10, true)
           on conflict (slug) do update set
             curriculum_level = excluded.curriculum_level,
             title = excluded.title,
             topic = excluded.topic,
             competency = excluded.competency,
             question_count = excluded.question_count`,
          [`level-${level.id}-${slugify(title)}`, level.id, title, level.competency],
        );
        upserted += 1;
      }
    }

    const exactMatches = await client.query(
      `update quiz_attempts as attempts
       set lesson_id = lessons.id
       from lessons
       where attempts.lesson_id is null
         and attempts.lesson_slug = lessons.slug
         and lessons.published = true`,
    );
    const legacyMatches = await client.query(
      `update quiz_attempts as attempts
       set lesson_id = lessons.id
       from lessons
       where attempts.lesson_id is null
         and attempts.lesson_slug = regexp_replace(lessons.slug, '^level-[0-9]+-', '')
         and lessons.published = true
         and (
           select count(*)
           from lessons as candidates
           where attempts.lesson_slug = regexp_replace(candidates.slug, '^level-[0-9]+-', '')
             and candidates.published = true
         ) = 1`,
    );
    linkedAttempts = (exactMatches.rowCount ?? 0) + (legacyMatches.rowCount ?? 0);

    const [lessonCount, unlinkedCount] = await Promise.all([
      client.query("select count(*)::int as count from lessons where published = true"),
      client.query("select count(*)::int as count from quiz_attempts where lesson_id is null"),
    ]);
    await client.query("commit");
    console.log(
      `Synchronized ${upserted} lessons; published lessons ${lessonCount.rows[0].count}; linked ${linkedAttempts} existing attempts; ${unlinkedCount.rows[0].count} attempts could not be matched to a published lesson.`,
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
