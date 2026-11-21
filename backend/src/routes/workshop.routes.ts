import { Router } from "express";
import { pool } from "../config/database.js";
import {
  authenticateToken,
  authorizeRoles,
} from "../middlewares/auth.middleware.js";

const router = Router();

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const dateTimeRegex =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

// Consultar los horarios del taller.
router.get("/hours", async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT day_of_week, opens_at, closes_at, is_closed
       FROM workshop_hours
       ORDER BY day_of_week ASC`
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
});

// Modificar la configuración semanal completa.
router.put(
  "/hours",
  authenticateToken,
  authorizeRoles("ADMINISTRADOR"),
  async (req, res, next) => {
    const hours = req.body?.hours;

    if (!Array.isArray(hours) || hours.length !== 7) {
      res.status(400).json({
        success: false,
        message: "Se deben enviar los horarios de los siete días",
      });
      return;
    }

    const days = new Set<number>();

    for (const day of hours) {
      if (
        !day ||
        !Number.isInteger(day.dayOfWeek) ||
        day.dayOfWeek < 0 ||
        day.dayOfWeek > 6 ||
        days.has(day.dayOfWeek) ||
        typeof day.opensAt !== "string" ||
        !timeRegex.test(day.opensAt) ||
        typeof day.closesAt !== "string" ||
        !timeRegex.test(day.closesAt) ||
        typeof day.isClosed !== "boolean" ||
        (!day.isClosed && day.closesAt <= day.opensAt)
      ) {
        res.status(400).json({
          success: false,
          message: "La configuración de horarios contiene datos inválidos",
        });
        return;
      }

      days.add(day.dayOfWeek);
    }

    if (days.size !== 7) {
      res.status(400).json({
        success: false,
        message: "Cada día de la semana debe aparecer una sola vez",
      });
      return;
    }

    let client;

    try {
      client = await pool.connect();
      await client.query("BEGIN");

      for (const day of hours) {
        await client.query(
          `INSERT INTO workshop_hours
            (day_of_week, opens_at, closes_at, is_closed)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (day_of_week)
           DO UPDATE SET
             opens_at = EXCLUDED.opens_at,
             closes_at = EXCLUDED.closes_at,
             is_closed = EXCLUDED.is_closed`,
          [
            day.dayOfWeek,
            day.opensAt,
            day.closesAt,
            day.isClosed,
          ]
        );
      }

      await client.query("COMMIT");

      const result = await client.query(
        `SELECT day_of_week, opens_at, closes_at, is_closed
         FROM workshop_hours
         ORDER BY day_of_week ASC`
      );

      res.json({
        success: true,
        message: "Horarios actualizados correctamente",
        data: result.rows,
      });
    } catch (error) {
      if (client) {
        await client.query("ROLLBACK");
      }
      next(error);
    } finally {
      client?.release();
    }
  }
);

// Consultar bloqueos de agenda.
router.get(
  "/blocks",
  authenticateToken,
  authorizeRoles("ADMINISTRADOR"),
  async (_req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT
           b.id,
           b.mechanic_id,
           u.full_name AS mechanic_name,
           b.starts_at,
           b.ends_at,
           b.reason,
           b.created_by,
           b.created_at
         FROM mechanic_blocks b
         INNER JOIN users u ON u.id = b.mechanic_id
         ORDER BY b.starts_at ASC`
      );

      res.json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Crear un bloqueo para un mecánico activo.
router.post(
  "/blocks",
  authenticateToken,
  authorizeRoles("ADMINISTRADOR"),
  async (req, res, next) => {
    try {
      const {
        mechanicId,
        startsAt,
        endsAt,
        reason,
      } = req.body ?? {};

      if (
        typeof mechanicId !== "string" ||
        !uuidRegex.test(mechanicId) ||
        typeof startsAt !== "string" ||
        !dateTimeRegex.test(startsAt) ||
        Number.isNaN(Date.parse(startsAt)) ||
        typeof endsAt !== "string" ||
        !dateTimeRegex.test(endsAt) ||
        Number.isNaN(Date.parse(endsAt)) ||
        Date.parse(endsAt) <= Date.parse(startsAt) ||
        (reason !== undefined &&
          reason !== null &&
          (typeof reason !== "string" || reason.trim().length > 500))
      ) {
        res.status(400).json({
          success: false,
          message: "Los datos del bloqueo son inválidos",
        });
        return;
      }

      const mechanic = await pool.query(
        `SELECT id
         FROM users
         WHERE id = $1
           AND role = 'MECANICO'
           AND is_active = TRUE`,
        [mechanicId]
      );

      if (mechanic.rowCount === 0) {
        res.status(400).json({
          success: false,
          message: "El mecánico no existe o no está activo",
        });
        return;
      }

      const result = await pool.query(
        `INSERT INTO mechanic_blocks
          (mechanic_id, starts_at, ends_at, reason, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          mechanicId,
          startsAt,
          endsAt,
          reason?.trim() || null,
          req.user!.id,
        ]
      );

      res.status(201).json({
        success: true,
        message: "Bloqueo creado correctamente",
        data: result.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

// Eliminar un bloqueo.
router.delete(
  "/blocks/:id",
  authenticateToken,
  authorizeRoles("ADMINISTRADOR"),
  async (req, res, next) => {
    try {
      const id = req.params.id;

      if (typeof id !== "string" || !uuidRegex.test(id)) {
        res.status(400).json({
          success: false,
          message: "Identificador de bloqueo inválido",
        });
        return;
      }

      const result = await pool.query(
        `DELETE FROM mechanic_blocks
         WHERE id = $1
         RETURNING id`,
        [id]
      );

      if (result.rowCount === 0) {
        res.status(404).json({
          success: false,
          message: "Bloqueo no encontrado",
        });
        return;
      }

      res.json({
        success: true,
        message: "Bloqueo eliminado correctamente",
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
