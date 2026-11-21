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

class CancellationError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

router.patch(
  "/:id/cancel",
  authenticateToken,
  authorizeRoles("CLIENTE", "ADMINISTRADOR"),
  async (req, res, next) => {
    const appointmentId = req.params.id;
    const reason = req.body?.reason;
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
      reason !== undefined &&
      (typeof reason !== "string" || reason.trim().length > 500)
    ) {
      res.status(400).json({
        success: false,
        message: "El motivo debe ser un texto de hasta 500 caracteres",
      });
      return;
    }

    const cancellationReason =
      typeof reason === "string" ? reason.trim() : null;

    if (
      user.role === "ADMINISTRADOR" &&
      !cancellationReason
    ) {
      res.status(400).json({
        success: false,
        message: "El administrador debe indicar el motivo de la cancelación",
      });
      return;
    }

    let client: PoolClient | undefined;
    let transactionStarted = false;

    try {
      client = await pool.connect();

      await client.query("BEGIN");
      transactionStarted = true;

      // Bloquea el turno para evitar cancelaciones simultáneas.
      const appointmentResult = await client.query(
        `SELECT
           id,
           client_id,
           starts_at,
           status
         FROM appointments
         WHERE id = $1
         FOR UPDATE`,
        [appointmentId]
      );

      if (appointmentResult.rowCount === 0) {
        throw new CancellationError(
          "El turno no existe",
          404
        );
      }

      const appointment = appointmentResult.rows[0];

      // El cliente solo puede cancelar sus propios turnos.
      if (
        user.role === "CLIENTE" &&
        appointment.client_id !== user.id
      ) {
        throw new CancellationError(
          "El turno no existe",
          404
        );
      }

      if (appointment.status !== "CONFIRMED") {
        throw new CancellationError(
          "Solo se pueden cancelar turnos confirmados",
          409
        );
      }

      // No permite cancelar turnos con una orden de reparación activa.
      const repairOrderResult = await client.query(
        `SELECT id
         FROM repair_orders
         WHERE appointment_id = $1
           AND status <> 'CANCELLED'
         LIMIT 1
         FOR UPDATE`,
        [appointmentId]
      );

      if (repairOrderResult.rowCount && repairOrderResult.rowCount > 0) {
        throw new CancellationError(
          "No se puede cancelar un turno que ya tiene una orden de reparación activa",
          409
        );
      }

      // La regla de las 12 horas se aplica únicamente al cliente.
      if (user.role === "CLIENTE") {
        const startsAt = new Date(appointment.starts_at).getTime();
        const now = Date.now();
        const twelveHours = 12 * 60 * 60 * 1000;

        if (startsAt - now < twelveHours) {
          throw new CancellationError(
            "Los turnos solo pueden cancelarse con al menos 12 horas de anticipación",
            403
          );
        }
      }

      const updateResult = await client.query(
        `UPDATE appointments
         SET status = 'CANCELLED',
             cancellation_reason = $2,
             cancelled_at = NOW(),
             cancelled_by = $3,
             updated_at = NOW()
         WHERE id = $1
         RETURNING
           id,
           client_id,
           starts_at,
           status,
           cancellation_reason,
           cancelled_at,
           cancelled_by`,
        [
          appointmentId,
          cancellationReason,
          user.id,
        ]
      );

      await client.query("COMMIT");
      transactionStarted = false;

      res.status(200).json({
        success: true,
        message: "Turno cancelado correctamente",
        data: updateResult.rows[0],
      });
    } catch (error) {
      if (transactionStarted && client) {
        await client.query("ROLLBACK").catch(() => undefined);
        transactionStarted = false;
      }

      if (error instanceof CancellationError) {
        res.status(error.status).json({
          success: false,
          message: error.message,
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
