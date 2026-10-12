import dotenv from "dotenv";
import pg from "pg";
import { curriculum } from "../src/lib/learning-data.ts";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to seed curriculum lessons");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

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
  let inserted = 0;
  for (const level of curriculum) {
    for (const title of level.lessons) {
      const result = await pool.query(
        "insert into lessons (slug, curriculum_level, title, topic, competency, question_count, published) values ($1, $2, $3, $3, $4, 10, true) on conflict (slug) do nothing",
        [`level-${level.id}-${slugify(title)}`, level.id, title, level.competency],
      );
      inserted += result.rowCount ?? 0;
    }
  }

  const result = await pool.query("select count(*)::int as count from lessons where published = true");
  console.log(`Inserted ${inserted}; published lessons ${result.rows[0].count}`);
} finally {
  await pool.end();
}
