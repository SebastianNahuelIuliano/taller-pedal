import { Router } from "express";
import type { PoolClient } from "pg";
import { pool } from "../config/database.js";
import {
  authenticateToken,
  authorizeRoles,
} from "../middlewares/auth.middleware.js";

const router = Router();

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class AssignmentError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

router.patch(
  "/:id/assign",
  authenticateToken,
  authorizeRoles("ADMINISTRADOR"),
  async (req, res, next) => {
    const appointmentId = req.params.id;
    const mechanicId = req.body?.mechanicId;
    const user = req.user!;

    if (
      typeof appointmentId !== "string" ||
      !uuidRegex.test(appointmentId)
    ) {
      res.status(400).json({
        success: false,
        message: "El identificador del turno es inválido",
      });
      return;
    }

    if (
      typeof mechanicId !== "string" ||
      !uuidRegex.test(mechanicId)
    ) {
      res.status(400).json({
        success: false,
        message: "El identificador del mecánico es inválido",
      });
      return;
    }

    let client: PoolClient | undefined;
    let transactionStarted = false;

    try {
      client = await pool.connect();

      await client.query("BEGIN");
      transactionStarted = true;

      // Bloquea el turno para evitar reasignaciones simultáneas.
      const appointmentResult = await client.query(
        `SELECT
           id,
           mechanic_id,
           starts_at,
           ends_at,
           status
         FROM appointments
         WHERE id = $1
         FOR UPDATE`,
        [appointmentId]
      );

      if (appointmentResult.rowCount === 0) {
        throw new AssignmentError("El turno no existe", 404);
      }

      const appointment = appointmentResult.rows[0];

      if (appointment.status !== "CONFIRMED") {
        throw new AssignmentError(
          "Solo se pueden reasignar turnos confirmados",
          409
        );
      }

      if (appointment.mechanic_id === mechanicId) {
        throw new AssignmentError(
          "El turno ya está asignado a ese mecánico",
          409
        );
      }

      // No permite cambiar el mecánico cuando la reparación ya comenzó.
      const repairOrderResult = await client.query(
        `SELECT id
         FROM repair_orders
         WHERE appointment_id = $1
           AND status NOT IN ('CANCELLED')
         LIMIT 1
         FOR UPDATE`,
        [appointmentId]
      );

      if (repairOrderResult.rowCount && repairOrderResult.rowCount > 0) {
        throw new AssignmentError(
          "No se puede reasignar un turno cuya orden de reparación ya comenzó",
          409
        );
      }

      // Bloquea al nuevo mecánico y verifica que esté activo.
      const mechanicResult = await client.query(
        `SELECT id
         FROM users
         WHERE id = $1
           AND role = 'MECANICO'
           AND is_active = TRUE
         FOR UPDATE`,
        [mechanicId]
      );

      if (mechanicResult.rowCount === 0) {
        throw new AssignmentError(
          "El mecánico no existe, no está activo o no tiene el rol de mecánico",
          400
        );
      }

      // Comprueba que no tenga otro turno confirmado en ese horario.
      const conflictResult = await client.query(
        `SELECT id
         FROM appointments
         WHERE mechanic_id = $1
           AND status = 'CONFIRMED'
           AND id <> $4
           AND starts_at < $3
           AND ends_at > $2
         LIMIT 1`,
        [
          mechanicId,
          appointment.starts_at,
          appointment.ends_at,
          appointmentId,
        ]
      );

      if (conflictResult.rowCount && conflictResult.rowCount > 0) {
        throw new AssignmentError(
          "El mecánico ya tiene un turno confirmado en ese horario",
          409
        );
      }

      // Comprueba que no tenga un bloqueo en ese intervalo.
      const blockResult = await client.query(
        `SELECT id
         FROM mechanic_blocks
         WHERE mechanic_id = $1
           AND starts_at < $3
           AND ends_at > $2
         LIMIT 1`,
        [
          mechanicId,
          appointment.starts_at,
          appointment.ends_at,
        ]
      );

      if (blockResult.rowCount && blockResult.rowCount > 0) {
        throw new AssignmentError(
          "El mecánico tiene un bloqueo en ese horario",
          409
        );
      }

      const previousMechanicId = appointment.mechanic_id;

      const updateResult = await client.query(
        `UPDATE appointments
         SET mechanic_id = $2,
             updated_at = NOW()
         WHERE id = $1
         RETURNING
           id,
           mechanic_id,
           starts_at,
           ends_at,
           status,
           updated_at`,
        [appointmentId, mechanicId]
      );

      // Registra la reasignación dentro de la misma transacción.
      await client.query(
        `INSERT INTO audit_logs (
           user_id,
           action,
           entity_type,
           entity_id,
           details
         )
         VALUES (
           $1,
           'APPOINTMENT_MECHANIC_REASSIGNED',
           'APPOINTMENT',
           $2,
           jsonb_build_object(
             'previous_mechanic_id', $3::text,
             'new_mechanic_id', $4::text
           )
         )`,
        [
          user.id,
          appointmentId,
          previousMechanicId,
          mechanicId,
        ]
      );

      await client.query("COMMIT");
      transactionStarted = false;

      res.status(200).json({
        success: true,
        message: "Mecánico reasignado correctamente",
        data: updateResult.rows[0],
      });
    } catch (error) {
      if (transactionStarted && client) {
        await client.query("ROLLBACK").catch(() => undefined);
        transactionStarted = false;
      }

      if (error instanceof AssignmentError) {
        res.status(error.status).json({
          success: false,
          message: error.message,
        });
        return;
      }

      const databaseError = error as { code?: string };

      if (
        databaseError.code === "23P01" ||
        databaseError.code === "23505"
      ) {
        res.status(409).json({
          success: false,
          message: "El mecánico tiene un conflicto de horario",
        });
        return;
      }

      next(error);
    } finally {
      client?.release();
    }
  }
);

export default router;

