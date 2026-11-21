
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

class EstimateResponseError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

// Aprobar o rechazar un presupuesto pendiente.
router.patch(
  "/:orderId/estimates/:estimateId/respond",
  authenticateToken,
  authorizeRoles("CLIENTE"),
  async (req, res, next) => {
    const { orderId, estimateId } = req.params;
    const decision = req.body?.decision;
    const user = req.user!;

    if (
      typeof orderId !== "string" ||
      !uuidRegex.test(orderId) ||
      typeof estimateId !== "string" ||
      !uuidRegex.test(estimateId)
    ) {
      res.status(400).json({
        success: false,
        message: "El identificador de la orden o del presupuesto es inválido",
      });
      return;
    }

    if (
      decision !== "APPROVED" &&
      decision !== "REJECTED"
    ) {
      res.status(400).json({
        success: false,
        message: "La decisión debe ser APPROVED o REJECTED",
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
           a.client_id
         FROM repair_orders ro
         INNER JOIN appointments a
           ON a.id = ro.appointment_id
         WHERE ro.id = $1
         FOR UPDATE OF ro`,
        [orderId]
      );

      if (orderResult.rowCount === 0) {
        throw new EstimateResponseError(
          "La orden de reparación no existe",
          404
        );
      }

      const order = orderResult.rows[0];

      if (order.client_id !== user.id) {
        throw new EstimateResponseError(
          "Solo el cliente propietario puede responder este presupuesto",
          403
        );
      }

      const estimateResult = await client.query(
        `SELECT
           id,
           repair_order_id,
           status,
           version,
           total
         FROM estimates
         WHERE id = $1
           AND repair_order_id = $2
         FOR UPDATE`,
        [estimateId, orderId]
      );

      if (estimateResult.rowCount === 0) {
        throw new EstimateResponseError(
          "El presupuesto no existe en esta orden",
          404
        );
      }

      const estimate = estimateResult.rows[0];

      if (estimate.status !== "PENDING") {
        throw new EstimateResponseError(
          "Este presupuesto ya fue respondido",
          409
        );
      }

      const updatedEstimateResult = await client.query(
        `UPDATE estimates
         SET
           status = $1,
           responded_at = NOW(),
           responded_by = $2
         WHERE id = $3
           AND repair_order_id = $4
           AND status = 'PENDING'
         RETURNING *`,
        [decision, user.id, estimateId, orderId]
      );

      if (updatedEstimateResult.rowCount !== 1) {
        throw new EstimateResponseError(
          "El presupuesto ya fue respondido",
          409
        );
      }

        const newOrderStatus =
        decision === "APPROVED"
          ? "APPROVED"
          : order.status;

      if (decision === "APPROVED") {
        await client.query(
          `UPDATE repair_orders
           SET
             status = $1,
             updated_at = NOW()
           WHERE id = $2`,
          [newOrderStatus, orderId]
        );
      }

      if (decision === "APPROVED") {
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
            orderId,
            order.status,
            newOrderStatus,
            user.id,
            `Presupuesto versión ${estimate.version} aprobado`,
          ]
        );
      }

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
           $2,
           'REPAIR_ORDER',
           $3,
           jsonb_build_object(
             'estimate_id', $4::text,
             'version', $5,
             'decision', $6,
             'total', $7::text
           )
         )`,
        [
          user.id,
          decision === "APPROVED"
            ? "ESTIMATE_APPROVED"
            : "ESTIMATE_REJECTED",
          orderId,
          estimateId,
          estimate.version,
          decision,
          estimate.total,
        ]
      );

      await client.query("COMMIT");
      transactionStarted = false;

      res.status(200).json({
        success: true,
        message:
          decision === "APPROVED"
            ? "Presupuesto aprobado correctamente"
            : "Presupuesto rechazado correctamente",
        data: {
          ...updatedEstimateResult.rows[0],
          repair_order_status: newOrderStatus,
        },
      });
    } catch (error) {
      if (transactionStarted && client) {
        await client.query("ROLLBACK").catch(() => undefined);
        transactionStarted = false;
      }

      if (error instanceof EstimateResponseError) {
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
