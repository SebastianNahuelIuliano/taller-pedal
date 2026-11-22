import { Router } from "express";
import { pool } from "../config/database.js";
import {
  authenticateToken,
  authorizeRoles,
} from "../middlewares/auth.middleware.js";

const router = Router();

// Listar mecánicos para la administración.
router.get(
  "/mechanics",
  authenticateToken,
  authorizeRoles("ADMINISTRADOR"),
  async (_req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT
           id,
           full_name AS "fullName",
           email,
           phone,
           role,
           is_active AS "isActive",
           created_at AS "createdAt"
         FROM users
         WHERE role = 'MECANICO'
         ORDER BY full_name ASC`
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

// Listar turnos para la administración.
router.get(
  "/appointments",
  authenticateToken,
  authorizeRoles("ADMINISTRADOR"),
  async (_req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT
           a.id,
           a.client_id,
           c.full_name AS client_name,
           c.email AS client_email,
           a.bicycle_id,
           b.brand AS bicycle_brand,
           b.model AS bicycle_model,
           b.bicycle_type,
           a.service_id,
           a.service_name_snapshot AS service_name,
           a.duration_minutes_snapshot,
           a.price_snapshot,
           a.mechanic_id,
           m.full_name AS mechanic_name,
           a.starts_at,
           a.ends_at,
           a.status AS appointment_status,
           ro.id AS repair_order_id,
           COALESCE(ro.status, 'NOT_RECEIVED') AS repair_status
         FROM appointments a
         INNER JOIN users c ON c.id = a.client_id
         INNER JOIN bicycles b ON b.id = a.bicycle_id
         LEFT JOIN users m ON m.id = a.mechanic_id
         LEFT JOIN repair_orders ro ON ro.appointment_id = a.id
         ORDER BY a.starts_at DESC`
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

export default router;