import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Nap .env.local (Next.js convention), fallback .env
config({ path: ".env.local" });
config({ path: ".env" });

const databaseUrl = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("SUPABASE_DATABASE_URL or DATABASE_URL is required in .env.local");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: databaseUrl,
  },
});
