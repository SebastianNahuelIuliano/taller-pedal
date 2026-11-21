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

class EstimateError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

function validAmount(value: unknown, allowZero: boolean): boolean {
  if (
    typeof value !== "number" &&
    typeof value !== "string"
  ) {
    return false;
  }

  const amount = String(value);

  if (!/^\d{1,10}(\.\d{1,2})?$/.test(amount)) {
    return false;
  }

  const numericAmount = Number(amount);

  return (
    Number.isFinite(numericAmount) &&
    (allowZero ? numericAmount >= 0 : numericAmount > 0)
  );
}

// Crear una nueva versión de presupuesto.
router.post(
  "/:id/estimates",
  authenticateToken,
  authorizeRoles("MECANICO", "ADMINISTRADOR"),
  async (req, res, next) => {
    const orderId = req.params.id;
    const items = req.body?.items;
    const user = req.user!;

    if (
      typeof orderId !== "string" ||
      !uuidRegex.test(orderId)
    ) {
      res.status(400).json({
        success: false,
        message: "El identificador de la orden es inválido",
      });
      return;
    }

    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > 100
    ) {
      res.status(400).json({
        success: false,
        message: "El presupuesto debe contener entre 1 y 100 conceptos",
      });
      return;
    }

    for (const item of items) {
      if (
        typeof item?.description !== "string" ||
        !item.description.trim() ||
        item.description.trim().length > 255
      ) {
        res.status(400).json({
          success: false,
          message: "Cada concepto debe tener una descripción de hasta 255 caracteres",
        });
        return;
      }

      if (!validAmount(item.quantity, false)) {
        res.status(400).json({
          success: false,
          message: "Cada cantidad debe ser mayor que cero y tener hasta dos decimales",
        });
        return;
      }

      if (!validAmount(item.unitPrice, true)) {
        res.status(400).json({
          success: false,
          message: "Cada precio unitario debe ser no negativo y tener hasta dos decimales",
        });
        return;
      }
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
        [orderId]
      );

      if (orderResult.rowCount === 0) {
        throw new EstimateError(
          "La orden de reparación no existe",
          404
        );
      }

      const order = orderResult.rows[0];

      if (
        user.role === "MECANICO" &&
        order.mechanic_id !== user.id
      ) {
        throw new EstimateError(
          "Solo el mecánico asignado puede crear el presupuesto",
          403
        );
      }

            if (
        order.status !== "DIAGNOSIS" &&
        order.status !== "WAITING_APPROVAL"
      ) {
        throw new EstimateError(
          "La orden debe estar en diagnóstico o esperando aprobación para crear un presupuesto",
          409
        );
      }

      const diagnosisResult = await client.query(
        `SELECT id
         FROM diagnoses
         WHERE repair_order_id = $1
         LIMIT 1`,
        [orderId]
      );

      if (diagnosisResult.rowCount === 0) {
        throw new EstimateError(
          "La orden debe tener al menos un diagnóstico antes de crear un presupuesto",
          409
        );
      }

      const previousEstimateResult = await client.query(
        `SELECT version, status
         FROM estimates
         WHERE repair_order_id = $1
         ORDER BY version DESC
         LIMIT 1`,
        [orderId]
      );

      if (
        previousEstimateResult.rowCount &&
        previousEstimateResult.rowCount > 0
      ) {
        const previousStatus =
          previousEstimateResult.rows[0].status;

        if (previousStatus === "PENDING") {
          throw new EstimateError(
            "El presupuesto anterior todavía está pendiente de respuesta",
            409
          );
        }

        if (previousStatus !== "REJECTED") {
          throw new EstimateError(
            "Solo se puede crear una nueva versión si el presupuesto anterior fue rechazado",
            409
          );
        }

        if (order.status !== "WAITING_APPROVAL") {
          throw new EstimateError(
            "La orden debe estar esperando aprobación para crear una nueva versión",
            409
          );
        }
      } else if (order.status !== "DIAGNOSIS") {
        throw new EstimateError(
          "El primer presupuesto debe crearse durante el diagnóstico",
          409
        );
      }

      const version =
        previousEstimateResult.rowCount &&
        previousEstimateResult.rowCount > 0
          ? Number(previousEstimateResult.rows[0].version) + 1
          : 1;

      const estimateResult = await client.query(
        `INSERT INTO estimates (
           repair_order_id,
           version,
           status,
           total,
           sent_at,
           created_by
         )
         VALUES ($1, $2, 'PENDING', 0, NOW(), $3)
         RETURNING *`,
        [orderId, version, user.id]
      );

      const estimate = estimateResult.rows[0];

      const savedItems = [];

      for (const item of items) {
        const itemResult = await client.query(
          `INSERT INTO estimate_items (
             estimate_id,
             description,
             quantity,
             unit_price,
             subtotal
           )
           VALUES (
             $1,
             $2,
             $3::numeric,
             $4::numeric,
             ROUND($3::numeric * $4::numeric, 2)
           )
           RETURNING *`,
          [
            estimate.id,
            item.description.trim(),
            String(item.quantity),
            String(item.unitPrice),
          ]
        );

        savedItems.push(itemResult.rows[0]);
      }

      const totalResult = await client.query(
        `UPDATE estimates
         SET total = (
           SELECT COALESCE(SUM(subtotal), 0)
           FROM estimate_items
           WHERE estimate_id = $1
         )
         WHERE id = $1
         RETURNING total`,
        [estimate.id]
      );

      const total = totalResult.rows[0].total;

            // El primer presupuesto inicia la espera de aprobación.
      if (order.status === "DIAGNOSIS") {
        await client.query(
          `UPDATE repair_orders
           SET status = 'WAITING_APPROVAL',
               updated_at = NOW()
           WHERE id = $1`,
          [orderId]
        );

        await client.query(
          `INSERT INTO repair_status_history (
             repair_order_id,
             previous_status,
             new_status,
             changed_by,
             notes
           )
           VALUES ($1, 'DIAGNOSIS', 'WAITING_APPROVAL', $2, $3)`,
          [
            orderId,
            user.id,
            "Presupuesto enviado al cliente para su aprobación",
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
           'ESTIMATE_CREATED',
           'REPAIR_ORDER',
           $2,
           jsonb_build_object(
             'estimate_id', $3::text,
             'version', $4,
             'total', $5::text,
             'items_count', $6
           )
         )`,
        [
          user.id,
          orderId,
          estimate.id,
          version,
          total,
          savedItems.length,
        ]
      );

      await client.query("COMMIT");
      transactionStarted = false;

      res.status(201).json({
        success: true,
        message: "Presupuesto creado correctamente",
        data: {
          ...estimate,
          total,
          items: savedItems,
        },
      });
    } catch (error) {
      if (transactionStarted && client) {
        await client.query("ROLLBACK").catch(() => undefined);
        transactionStarted = false;
      }

      if (error instanceof EstimateError) {
        res.status(error.status).json({
          success: false,
          message: error.message,
        });
        return;
      }

      const databaseError = error as { code?: string };

      if (databaseError.code === "22003") {
        res.status(400).json({
          success: false,
          message: "El importe del presupuesto supera el límite permitido",
        });
        return;
      }

      next(error);
    } finally {
      client?.release();
    }
  }
);

// Consultar presupuestos de una orden.
router.get(
  "/:id/estimates",
  authenticateToken,
  authorizeRoles("CLIENTE", "MECANICO", "ADMINISTRADOR"),
  async (req, res, next) => {
    const orderId = req.params.id;
    const user = req.user!;

    if (
      typeof orderId !== "string" ||
      !uuidRegex.test(orderId)
    ) {
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
        [orderId]
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
        (user.role === "CLIENTE" &&
          order.client_id !== user.id) ||
        (user.role === "MECANICO" &&
          order.mechanic_id !== user.id)
      ) {
        res.status(403).json({
          success: false,
          message: "No tenés permiso para consultar estos presupuestos",
        });
        return;
      }

      const estimatesResult = await pool.query(
        `SELECT *
         FROM estimates
         WHERE repair_order_id = $1
         ORDER BY version ASC`,
        [orderId]
      );

      const estimates = [];

      for (const estimate of estimatesResult.rows) {
        const itemsResult = await pool.query(
          `SELECT
             id,
             estimate_id,
             description,
             quantity,
             unit_price,
             subtotal
           FROM estimate_items
           WHERE estimate_id = $1`,
          [estimate.id]
        );

        estimates.push({
          ...estimate,
          items: itemsResult.rows,
        });
      }

      res.status(200).json({
        success: true,
        data: estimates,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;