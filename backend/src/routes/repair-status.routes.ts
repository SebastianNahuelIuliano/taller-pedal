
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

const validStatuses = [
  "RECEIVED",
  "DIAGNOSIS",
  "WAITING_APPROVAL",
  "APPROVED",
  "IN_PROGRESS",
  "WAITING_PARTS",
  "READY",
  "DELIVERED",
  "CANCELLED",
];

const allowedTransitions: Record<string, string[]> = {
  RECEIVED: ["DIAGNOSIS", "CANCELLED"],
  DIAGNOSIS: ["WAITING_APPROVAL", "CANCELLED"],
  WAITING_APPROVAL: ["APPROVED", "CANCELLED"],
  APPROVED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["WAITING_PARTS", "READY"],
  WAITING_PARTS: ["IN_PROGRESS"],
  READY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

const mechanicTransitions: Record<string, string[]> = {
  APPROVED: ["IN_PROGRESS"],
  IN_PROGRESS: ["WAITING_PARTS", "READY"],
  WAITING_PARTS: ["IN_PROGRESS"],
  READY: ["DELIVERED"],
};

class RepairStatusError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

// Consultar el historial de estados de una orden.
router.get(
  "/:id/status-history",
  authenticateToken,
  async (req, res, next) => {
    const { id } = req.params;
    const user = req.user!;

    if (typeof id !== "string" || !uuidRegex.test(id)) {
      res.status(400).json({
        success: false,
        message: "El identificador de la orden es inválido",
      });
      return;
    }

    try {
      const orderResult = await pool.query(
        `SELECT
           ro.id,
           a.client_id,
           a.mechanic_id
         FROM repair_orders ro
         INNER JOIN appointments a
           ON a.id = ro.appointment_id
         WHERE ro.id = $1`,
        [id]
      );

      if (orderResult.rowCount === 0) {
        res.status(404).json({
          success: false,
          message: "La orden de reparación no existe",
        });
        return;
      }

      const order = orderResult.rows[0];

      if (
        user.role === "CLIENTE" &&
        order.client_id !== user.id
      ) {
        res.status(403).json({
          success: false,
          message: "No tenés permiso para consultar este historial",
        });
        return;
      }

      if (
        user.role === "MECANICO" &&
        order.mechanic_id !== user.id
      ) {
        res.status(403).json({
          success: false,
          message: "No tenés permiso para consultar este historial",
        });
        return;
      }

      const historyResult = await pool.query(
        `SELECT
           h.id,
           h.previous_status,
           h.new_status,
           h.notes,
           h.created_at,
           h.changed_by,
           u.full_name AS changed_by_name
         FROM repair_status_history h
         INNER JOIN users u
           ON u.id = h.changed_by
         WHERE h.repair_order_id = $1
         ORDER BY h.created_at ASC, h.id ASC`,
        [id]
      );

      res.status(200).json({
        success: true,
        data: historyResult.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Actualizar el estado de una orden de reparación.
router.patch(
  "/:id/status",
  authenticateToken,
  authorizeRoles("MECANICO", "ADMINISTRADOR"),
  async (req, res, next) => {
    const { id } = req.params;
    const { status, notes } = req.body ?? {};
    const user = req.user!;

    if (typeof id !== "string" || !uuidRegex.test(id)) {
      res.status(400).json({
        success: false,
        message: "El identificador de la orden es inválido",
      });
      return;
    }

    if (
      typeof status !== "string" ||
      !validStatuses.includes(status)
    ) {
      res.status(400).json({
        success: false,
        message: "El estado indicado no es válido",
      });
      return;
    }

    if (
      notes !== undefined &&
      (typeof notes !== "string" || notes.length > 2000)
    ) {
      res.status(400).json({
        success: false,
        message: "El comentario debe ser un texto de hasta 2000 caracteres",
      });
      return;
    }

    let client: PoolClient | undefined;
    let transactionStarted = false;

    try {
      client = await pool.connect();

      await client.query("BEGIN");
      transactionStarted = true;

      const orderResult = await client.query(
        `SELECT
           ro.id,
           ro.status,
           a.mechanic_id
         FROM repair_orders ro
         INNER JOIN appointments a
           ON a.id = ro.appointment_id
         WHERE ro.id = $1
         FOR UPDATE OF ro`,
        [id]
      );

      if (orderResult.rowCount === 0) {
        throw new RepairStatusError(
          "La orden de reparación no existe",
          404
        );
      }

      const order = orderResult.rows[0];
      const currentStatus = order.status;

      if (
        user.role === "MECANICO" &&
        order.mechanic_id !== user.id
      ) {
        throw new RepairStatusError(
          "Solo el mecánico asignado puede modificar esta orden",
          403
        );
      }

      if (
        !allowedTransitions[currentStatus]?.includes(status)
      ) {
        throw new RepairStatusError(
          `No se permite cambiar el estado de ${currentStatus} a ${status}`,
          409
        );
      }

      if (
        user.role === "MECANICO" &&
        !mechanicTransitions[currentStatus]?.includes(status)
      ) {
        throw new RepairStatusError(
          "No tenés permiso para realizar esta transición",
          403
        );
      }

      const updatedResult = await client.query(
        `UPDATE repair_orders
         SET
           status = $1,
           updated_at = NOW()
         WHERE id = $2
         RETURNING id, status, updated_at`,
        [status, id]
      );

      await client.query(
        `INSERT INTO repair_status_history (
           repair_order_id,
           previous_status,
           new_status,
           changed_by,
           notes
         )
         VALUES ($1, $2, $3, $4, $5)`,
        [
          id,
          currentStatus,
          status,
          user.id,
          typeof notes === "string" && notes.trim()
            ? notes.trim()
            : null,
        ]
      );

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
           'REPAIR_STATUS_CHANGED',
           'REPAIR_ORDER',
           $2,
           jsonb_build_object(
             'previous_status', $3,
             'new_status', $4,
             'notes', $5
           )
         )`,
        [
          user.id,
          id,
          currentStatus,
          status,
          typeof notes === "string" && notes.trim()
            ? notes.trim()
            : null,
        ]
      );

      await client.query("COMMIT");
      transactionStarted = false;

      res.status(200).json({
        success: true,
        message: "Estado de la orden actualizado correctamente",
        data: updatedResult.rows[0],
      });
    } catch (error) {
      if (transactionStarted && client) {
        await client.query("ROLLBACK").catch(() => undefined);
        transactionStarted = false;
      }

      if (error instanceof RepairStatusError) {
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
