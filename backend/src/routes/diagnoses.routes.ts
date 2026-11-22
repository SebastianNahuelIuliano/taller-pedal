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

class DiagnosisError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

// Registrar un diagnóstico.
router.post(
  "/:id/diagnoses",
  authenticateToken,
  authorizeRoles("MECANICO", "ADMINISTRADOR"),
  async (req, res, next) => {
    const orderId = req.params.id;
    const description = req.body?.description;
    const recommendedTasks = req.body?.recommendedTasks;
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
      typeof description !== "string" ||
      !description.trim()
    ) {
      res.status(400).json({
        success: false,
        message: "La descripción del diagnóstico es obligatoria",
      });
      return;
    }

    if (
      description.trim().length > 5000 ||
      (recommendedTasks !== undefined &&
        recommendedTasks !== null &&
        (typeof recommendedTasks !== "string" ||
          recommendedTasks.length > 5000))
    ) {
      res.status(400).json({
        success: false,
        message: "Los datos del diagnóstico superan la longitud permitida",
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
        [orderId]
      );

      if (orderResult.rowCount === 0) {
        throw new DiagnosisError("La orden de reparación no existe", 404);
      }

      const order = orderResult.rows[0];

      if (
        user.role === "MECANICO" &&
        order.mechanic_id !== user.id
      ) {
        throw new DiagnosisError(
          "Solo el mecánico asignado puede registrar el diagnóstico",
          403
        );
      }

            if (
        order.status !== "RECEIVED" &&
        order.status !== "DIAGNOSIS"
      ) {
        throw new DiagnosisError(
          "Solo se pueden diagnosticar órdenes recibidas o en diagnóstico",
          409
        );
      }

      const diagnosisResult = await client.query(
        `INSERT INTO diagnoses (
           repair_order_id,
           mechanic_id,
           description,
           recommended_tasks
         )
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          orderId,
          user.id,
          description.trim(),
          recommendedTasks?.trim() || null,
        ]
      );

      const diagnosis = diagnosisResult.rows[0];

            // El primer diagnóstico inicia el estado DIAGNOSIS.
      if (order.status === "RECEIVED") {
        await client.query(
          `UPDATE repair_orders
           SET status = 'DIAGNOSIS',
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
           VALUES ($1, 'RECEIVED', 'DIAGNOSIS', $2, $3)`,
          [
            orderId,
            user.id,
            "Diagn\u00f3stico inicial registrado",
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
           'DIAGNOSIS_CREATED',
           'REPAIR_ORDER',
           $2,
           jsonb_build_object(
             'diagnosis_id', $3::text,
             'description', $4::text,
             'recommended_tasks', $5::text
           )
         )`,
        [
          user.id,
          orderId,
          diagnosis.id,
          description.trim(),
          recommendedTasks?.trim() || null,
        ]
      );

      await client.query("COMMIT");
      transactionStarted = false;

      res.status(201).json({
        success: true,
        message: "Diagnóstico registrado correctamente",
        data: diagnosis,
      });
    } catch (error) {
      if (transactionStarted && client) {
        await client.query("ROLLBACK").catch(() => undefined);
        transactionStarted = false;
      }

      if (error instanceof DiagnosisError) {
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

// Consultar los diagnósticos de una orden.
router.get(
  "/:id/diagnoses",
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
        (user.role === "CLIENTE" && order.client_id !== user.id) ||
        (user.role === "MECANICO" && order.mechanic_id !== user.id)
      ) {
        res.status(403).json({
          success: false,
          message: "No tenés permiso para consultar estos diagnósticos",
        });
        return;
      }

      const diagnosesResult = await pool.query(
        `SELECT
           d.id,
           d.repair_order_id,
           d.mechanic_id,
           u.full_name AS mechanic_name,
           d.description,
           d.recommended_tasks,
           d.created_at
         FROM diagnoses d
         INNER JOIN users u
           ON u.id = d.mechanic_id
         WHERE d.repair_order_id = $1
         ORDER BY d.created_at ASC`,
        [orderId]
      );

      res.status(200).json({
        success: true,
        data: diagnosesResult.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
