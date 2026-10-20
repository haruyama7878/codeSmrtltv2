import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

const sourceUrl = process.env.DATABASE_URL;
const targetUrl = process.env.SUPABASE_DATABASE_URL;
const execute = process.argv.includes("--execute");
const tables = [
  "users",
  "lessons",
  "quiz_attempts",
  "classrooms",
  "classroom_memberships",
  "classroom_invitations",
  "classroom_assignments",
  "assignment_projects",
  "assignment_submissions",
  "daily_activity",
];

if (!sourceUrl || !targetUrl) {
  throw new Error("Configure DATABASE_URL (legacy source) and SUPABASE_DATABASE_URL (Supabase Cloud target).");
}

if (sourceUrl === targetUrl) {
  throw new Error("DATABASE_URL and SUPABASE_DATABASE_URL must point to different databases.");
}

const source = new Pool({ connectionString: sourceUrl });
const target = new Pool({ connectionString: targetUrl });

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function main() {
  const sourceTables = await source.query(
    "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
  );
  const availableTables = new Set(sourceTables.rows.map(({ table_name }) => table_name));
  const counts = new Map();

  for (const table of tables) {
    if (!availableTables.has(table)) continue;
    const { rows } = await source.query(`select count(*)::int as count from public.${quoteIdentifier(table)}`);
    counts.set(table, rows[0].count);
  }

  console.log(`Legacy rows found: ${JSON.stringify(Object.fromEntries(counts))}`);
  if (!execute) {
    console.log("Dry run only. After creating the target schema, rerun with --execute to copy these tables.");
    return;
  }

  const targetTables = await target.query(
    "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
  );
  const availableTargetTables = new Set(targetTables.rows.map(({ table_name }) => table_name));
  const jsonColumnsResult = await target.query(
    "select table_name, column_name from information_schema.columns where table_schema = 'public' and data_type in ('json', 'jsonb')",
  );
  const jsonColumns = new Map();
  for (const { table_name: table, column_name: column } of jsonColumnsResult.rows) {
    const columns = jsonColumns.get(table) ?? new Set();
    columns.add(column);
    jsonColumns.set(table, columns);
  }
  const missingTables = [...counts.keys()].filter((table) => !availableTargetTables.has(table));
  if (missingTables.length) {
    throw new Error(`Target schema is missing tables: ${missingTables.join(", ")}. Run npm run db:push first.`);
  }

  const nonEmptyTables = [];
  for (const table of tables) {
    if (!availableTargetTables.has(table)) continue;
    const { rows } = await target.query(`select count(*)::int as count from public.${quoteIdentifier(table)}`);
    if (rows[0].count > 0) nonEmptyTables.push(`${table}=${rows[0].count}`);
  }
  if (nonEmptyTables.length) {
    throw new Error(`Target app tables must be empty before migration: ${nonEmptyTables.join(", ")}`);
  }

  const client = await target.connect();
  const copied = {};
  try {
    await client.query("begin");
    for (const [table, count] of counts) {
      if (!count) {
        copied[table] = 0;
        continue;
      }

      const { rows } = await source.query(`select * from public.${quoteIdentifier(table)}`);
      const columns = Object.keys(rows[0]);
      const columnList = columns.map(quoteIdentifier).join(", ");
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
      const insert = `insert into public.${quoteIdentifier(table)} (${columnList}) values (${placeholders})`;
      let inserted = 0;

      for (const [rowIndex, row] of rows.entries()) {
        try {
          const values = columns.map((column) =>
            jsonColumns.get(table)?.has(column) && row[column] !== null
              ? JSON.stringify(row[column])
              : row[column],
          );
          const result = await client.query(insert, values);
          inserted += result.rowCount ?? 0;
        } catch (error) {
          throw new Error(`Failed copying ${table} row ${rowIndex + 1}: ${error.message}`, { cause: error });
        }
      }
      copied[table] = inserted;

      if (columns.includes("id")) {
        await client.query(
          `select setval(pg_get_serial_sequence($1, 'id'), greatest(coalesce((select max(id) from public.${quoteIdentifier(table)}), 1), 1), exists(select 1 from public.${quoteIdentifier(table)}))`,
          [`public.${table}`],
        );
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  console.log(`Copied rows: ${JSON.stringify(copied)}`);
}

main()
  .catch((error) => {
    console.error(`Legacy data migration failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([source.end(), target.end()]);
  });
