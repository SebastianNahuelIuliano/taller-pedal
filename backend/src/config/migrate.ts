
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pool } from "./database.js";

const MIGRATION_NAME = "001_initial_schema.sql";

async function migrate(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const existing = await client.query(
      "SELECT name FROM schema_migrations WHERE name = $1",
      [MIGRATION_NAME]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      console.log(`La migración ${MIGRATION_NAME} ya fue aplicada.`);
      return;
    }

    const migrationPath = resolve(
      process.cwd(),
      "migrations",
      MIGRATION_NAME
    );

    const sql = await readFile(migrationPath, "utf8");

    await client.query("BEGIN");

    try {
      await client.query(sql);

      await client.query(
        "INSERT INTO schema_migrations (name) VALUES ($1)",
        [MIGRATION_NAME]
      );

      await client.query("COMMIT");
      console.log(`Migración aplicada correctamente: ${MIGRATION_NAME}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((error: unknown) => {
  console.error("Error al ejecutar la migración:", error);
  process.exitCode = 1;
});
