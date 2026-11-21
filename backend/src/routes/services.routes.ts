
import { Router } from "express";
import { pool } from "../config/database.js";
import {
  authenticateToken,
  authorizeRoles,
} from "../middlewares/auth.middleware.js";

const router = Router();

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Catálogo público: solamente servicios activos.
router.get("/", async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, reference_price,
              duration_minutes, is_active, created_at, updated_at
       FROM services
       WHERE is_active = TRUE
       ORDER BY name ASC`
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
});

// Listado administrativo: incluye servicios activos e inactivos.
router.get(
  "/admin",
  authenticateToken,
  authorizeRoles("ADMINISTRADOR"),
  async (_req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT id, name, description, reference_price,
                duration_minutes, is_active, created_at, updated_at
         FROM services
         ORDER BY name ASC`
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

// Crear servicio.
router.post(
  "/",
  authenticateToken,
  authorizeRoles("ADMINISTRADOR"),
  async (req, res, next) => {
    try {
      const {
        name,
        description,
        referencePrice,
        durationMinutes,
      } = req.body ?? {};

      if (
        typeof name !== "string" ||
        !name.trim() ||
        name.trim().length > 150 ||
        (description !== undefined &&
          description !== null &&
          typeof description !== "string") ||
        typeof referencePrice !== "number" ||
        !Number.isFinite(referencePrice) ||
        referencePrice < 0 ||
        typeof durationMinutes !== "number" ||
        !Number.isInteger(durationMinutes) ||
        durationMinutes <= 0
      ) {
        res.status(400).json({
          success: false,
          message: "Los datos del servicio son invalidos",
        });
        return;
      }

      const result = await pool.query(
        `INSERT INTO services
          (name, description, reference_price, duration_minutes)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          name.trim(),
          description?.trim() || null,
          referencePrice,
          durationMinutes,
        ]
      );

      res.status(201).json({
        success: true,
        message: "Servicio creado correctamente",
        data: result.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

// Modificar los datos de un servicio.
router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("ADMINISTRADOR"),
  async (req, res, next) => {
    try {
      const id = req.params.id;

      if (typeof id !== "string") {
        res.status(400).json({
          success: false,
          message: "Identificador de servicio invalido",
        });
        return;
      }

      if (!uuidRegex.test(id)) {
        res.status(400).json({
          success: false,
          message: "Identificador de servicio invalido",
        });
        return;
      }

      const {
        name,
        description,
        referencePrice,
        durationMinutes,
      } = req.body ?? {};

      if (
        typeof name !== "string" ||
        !name.trim() ||
        name.trim().length > 150 ||
        (description !== undefined &&
          description !== null &&
          typeof description !== "string") ||
        typeof referencePrice !== "number" ||
        !Number.isFinite(referencePrice) ||
        referencePrice < 0 ||
        typeof durationMinutes !== "number" ||
        !Number.isInteger(durationMinutes) ||
        durationMinutes <= 0
      ) {
        res.status(400).json({
          success: false,
          message: "Los datos del servicio son invalidos",
        });
        return;
      }

      const result = await pool.query(
        `UPDATE services
         SET name = $1,
             description = $2,
             reference_price = $3,
             duration_minutes = $4,
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [
          name.trim(),
          description?.trim() || null,
          referencePrice,
          durationMinutes,
          id,
        ]
      );

      if (result.rowCount === 0) {
        res.status(404).json({
          success: false,
          message: "Servicio no encontrado",
        });
        return;
      }

      res.json({
        success: true,
        message: "Servicio actualizado correctamente",
        data: result.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

// Activar o desactivar un servicio sin eliminarlo.
router.patch(
  "/:id/status",
  authenticateToken,
  authorizeRoles("ADMINISTRADOR"),
  async (req, res, next) => {
    try {
      const id = req.params.id;

      if (typeof id !== "string") {
        res.status(400).json({
          success: false,
          message: "Identificador de servicio invalido",
        });
        return;
      }

      if (!uuidRegex.test(id)) {
        res.status(400).json({
          success: false,
          message: "Identificador de servicio invalido",
        });
        return;
      }

      const { isActive } = req.body ?? {};

      if (typeof isActive !== "boolean") {
        res.status(400).json({
          success: false,
          message: "El estado debe ser verdadero o falso",
        });
        return;
      }

      const result = await pool.query(
        `UPDATE services
         SET is_active = $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [isActive, id]
      );

      if (result.rowCount === 0) {
        res.status(404).json({
          success: false,
          message: "Servicio no encontrado",
        });
        return;
      }

      res.json({
        success: true,
        message: isActive
          ? "Servicio activado correctamente"
          : "Servicio desactivado correctamente",
        data: result.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
