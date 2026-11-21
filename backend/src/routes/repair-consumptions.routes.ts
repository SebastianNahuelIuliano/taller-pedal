import { Router } from "express";
import type { PoolClient } from "pg";
import { pool } from "../config/database.js";
import {
  authenticateToken,
  authorizeRoles,
} from "../middlewares/auth.middleware.js";

const router = Router();

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

router.post(
  "/:id/consumptions",
  authenticateToken,
  authorizeRoles("MECANICO", "ADMINISTRADOR"),
  async (req, res) => {
    const orderId = String(req.params.id ?? "");
    const user = req.user;

    if (!uuidRegex.test(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Identificador de orden inválido",
      });
    }

    const { sparePartId, quantity, notes } = req.body;

    if (
      typeof sparePartId !== "string" ||
      !uuidRegex.test(sparePartId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Identificador de repuesto inválido",
      });
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "La cantidad debe ser un entero mayor que cero",
      });
    }

    if (
      notes !== undefined &&
      notes !== null &&
      (typeof notes !== "string" || notes.length > 1000)
    ) {
      return res.status(400).json({
        success: false,
        message: "Las observaciones no pueden superar los 1000 caracteres",
      });
    }

    let client: PoolClient | undefined;

    try {
      client = await pool.connect();

      await client.query("BEGIN");

      const orderResult = await client.query(
        `
          SELECT
            ro.id,
            ro.status,
            a.mechanic_id
          FROM repair_orders ro
          INNER JOIN appointments a
            ON a.id = ro.appointment_id
          WHERE ro.id = $1
          FOR UPDATE OF ro
        `,
        [orderId]
      );

      if (orderResult.rowCount === 0) {
        throw new HttpError(404, "Orden de reparación inexistente");
      }

      const order = orderResult.rows[0];

      if (
        user?.role === "MECANICO" &&
        order.mechanic_id !== user.id
      ) {
        throw new HttpError(
          403,
          "No tenés permiso para registrar consumos en esta orden"
        );
      }

      const allowedStatuses = [
        "APPROVED",
        "IN_PROGRESS",
        "WAITING_PARTS",
      ];

      if (!allowedStatuses.includes(order.status)) {
        throw new HttpError(
          409,
          "La orden no permite registrar consumo de repuestos en su estado actual"
        );
      }

      const stockResult = await client.query(
        `
          UPDATE spare_parts
          SET
            quantity_available = quantity_available - $1,
            updated_at = NOW()
          WHERE id = $2
            AND is_active = TRUE
            AND quantity_available >= $1
          RETURNING
            id,
            code,
            name,
            quantity_available
        `,
        [quantity, sparePartId]
      );

      if (stockResult.rowCount === 0) {
        const partResult = await client.query(
          `
            SELECT
              id,
              is_active,
              quantity_available
            FROM spare_parts
            WHERE id = $1
            FOR UPDATE
          `,
          [sparePartId]
        );

        if (partResult.rowCount === 0) {
          throw new HttpError(404, "Repuesto inexistente");
        }

        const part = partResult.rows[0];

        if (!part.is_active) {
          throw new HttpError(409, "El repuesto está inactivo");
        }

        throw new HttpError(
          409,
          `Stock insuficiente. Disponibles: ${part.quantity_available}`
        );
      }

      const updatedPart = stockResult.rows[0];

      const movementResult = await client.query(
        `
          INSERT INTO stock_movements (
            spare_part_id,
            repair_order_id,
            movement_type,
            quantity,
            notes,
            created_by
          )
          VALUES ($1, $2, 'OUT', $3, $4, $5)
          RETURNING
            id,
            spare_part_id,
            repair_order_id,
            movement_type,
            quantity,
            notes,
            created_by,
            created_at
        `,
        [
          sparePartId,
          orderId,
          quantity,
          notes?.trim() || null,
          user!.id,
        ]
      );

      const movement = movementResult.rows[0];

      await client.query(
        `
          INSERT INTO audit_logs (
            user_id,
            action,
            entity_type,
            entity_id,
            details
          )
          VALUES (
            $1,
            'SPARE_PART_CONSUMED',
            'REPAIR_ORDER',
            $2,
            jsonb_build_object(
              'spare_part_id', $3::text,
              'quantity', $4,
              'notes', $5
            )
          )
        `,
        [
          user!.id,
          orderId,
          sparePartId,
          quantity,
          notes?.trim() || null,
        ]
      );

      await client.query("COMMIT");

      return res.status(201).json({
        success: true,
        message: "Consumo de repuesto registrado correctamente",
        data: {
          movement,
          sparePart: updatedPart,
        },
      });
    } catch (error) {
      if (client) {
        await client.query("ROLLBACK").catch(() => undefined);
      }

      if (error instanceof HttpError) {
        return res.status(error.status).json({
          success: false,
          message: error.message,
        });
      }

      console.error("Error al registrar consumo de repuesto:", error);

      return res.status(500).json({
        success: false,
        message: "Error interno al registrar el consumo",
      });
    } finally {
      client?.release();
    }
  }
);

export default router;