import { pool } from "./database.js";

async function checkDatabase() {
  try {
    const result = await pool.query(
      "SELECT NOW() AS fecha, current_database() AS base"
    );

    console.log("Conexión con Neon exitosa");
    console.log(result.rows[0]);
  } catch (error) {
    console.error("Error conectando con Neon:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

checkDatabase();