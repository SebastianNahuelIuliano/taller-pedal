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

class ReceptionError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

router.post(
  "/:id/receive",
  authenticateToken,
  authorizeRoles("MECANICO", "ADMINISTRADOR"),
  async (req, res, next) => {
    const appointmentId = req.params.id;
    const visibleCondition = req.body?.visibleCondition;
    const accessoriesReceived = req.body?.accessoriesReceived;
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
      typeof visibleCondition !== "string" ||
      !visibleCondition.trim()
    ) {
      res.status(400).json({
        success: false,
        message: "Debés describir el estado visible de la bicicleta",
      });
      return;
    }

    if (
      visibleCondition.trim().length > 5000 ||
      (accessoriesReceived !== undefined &&
        (typeof accessoriesReceived !== "string" ||
          accessoriesReceived.length > 2000))
    ) {
      res.status(400).json({
        success: false,
        message: "Los datos de recepción superan la longitud permitida",
      });
      return;
    }

    let client: PoolClient | undefined;
    let transactionStarted = false;

    try {
      client = await pool.connect();

      await client.query("BEGIN");
      transactionStarted = true;

      // Bloquea el turno para evitar recepciones simultáneas.
      const appointmentResult = await client.query(
        `SELECT id, mechanic_id, status
         FROM appointments
         WHERE id = $1
         FOR UPDATE`,
        [appointmentId]
      );

      if (appointmentResult.rowCount === 0) {
        throw new ReceptionError("El turno no existe", 404);
      }

      const appointment = appointmentResult.rows[0];

      if (appointment.status !== "CONFIRMED") {
        throw new ReceptionError(
          "Solo se pueden recibir bicicletas de turnos confirmados",
          409
        );
      }

      // Un mecánico solo puede recibir turnos que tenga asignados.
      if (
        user.role === "MECANICO" &&
        appointment.mechanic_id !== user.id
      ) {
        throw new ReceptionError(
          "No tenés permiso para recibir este turno",
          403
        );
      }

      // Comprueba que no exista una orden para este turno.
      const existingOrderResult = await client.query(
        `SELECT id
         FROM repair_orders
         WHERE appointment_id = $1
         LIMIT 1`,
        [appointmentId]
      );

      if (
        existingOrderResult.rowCount &&
        existingOrderResult.rowCount > 0
      ) {
        throw new ReceptionError(
          "Este turno ya tiene una orden de reparación",
          409
        );
      }

      const orderResult = await client.query(
        `INSERT INTO repair_orders (
           appointment_id,
           received_at,
           received_by,
           visible_condition,
           accessories_received,
           status
         )
         VALUES ($1, NOW(), $2, $3, $4, 'RECEIVED')
         RETURNING
           id,
           appointment_id,
           received_at,
           received_by,
           visible_condition,
           accessories_received,
           status,
           created_at`,
        [
          appointmentId,
          user.id,
          visibleCondition.trim(),
          accessoriesReceived?.trim() || null,
        ]
      );

      const order = orderResult.rows[0];

      // Registra el estado inicial en el historial.
      await client.query(
        `INSERT INTO repair_status_history (
           repair_order_id,
           previous_status,
           new_status,
           changed_by,
           notes
         )
         VALUES ($1, NULL, 'RECEIVED', $2, $3)`,
        [
          order.id,
          user.id,
          "Recepción inicial de la bicicleta",
        ]
      );

      // Registra la recepción para mantener trazabilidad.
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
           'REPAIR_ORDER_RECEIVED',
           'REPAIR_ORDER',
           $2,
           jsonb_build_object(
             'appointment_id', $3::text,
             'visible_condition', $4::text,
             'accessories_received', $5::text
           )
         )`,
        [
          user.id,
          order.id,
          appointmentId,
          visibleCondition.trim(),
          accessoriesReceived?.trim() || null,
        ]
      );

      await client.query("COMMIT");
      transactionStarted = false;

      res.status(201).json({
        success: true,
        message: "Bicicleta recibida y orden de reparación creada correctamente",
        data: order,
      });
    } catch (error) {
      if (transactionStarted && client) {
        await client.query("ROLLBACK").catch(() => undefined);
        transactionStarted = false;
      }

      if (error instanceof ReceptionError) {
        res.status(error.status).json({
          success: false,
          message: error.message,
        });
        return;
      }

      const databaseError = error as { code?: string };

      if (databaseError.code === "23505") {
        res.status(409).json({
          success: false,
          message: "Este turno ya tiene una orden de reparación",
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