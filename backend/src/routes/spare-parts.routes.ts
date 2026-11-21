import { Router } from "express";
import { pool } from "../config/database.js";
import {
  authenticateToken,
  authorizeRoles,
} from "../middlewares/auth.middleware.js";

const router = Router();

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidPartData(data: any): boolean {
  return (
    typeof data.code === "string" &&
    data.code.trim().length > 0 &&
    data.code.trim().length <= 80 &&
    typeof data.name === "string" &&
    data.name.trim().length > 0 &&
    data.name.trim().length <= 150 &&
    (data.description === undefined ||
      data.description === null ||
      typeof data.description === "string") &&
    typeof data.referencePrice === "number" &&
    Number.isFinite(data.referencePrice) &&
    data.referencePrice >= 0 &&
    typeof data.quantityAvailable === "number" &&
    Number.isInteger(data.quantityAvailable) &&
    data.quantityAvailable >= 0 &&
    typeof data.minimumStock === "number" &&
    Number.isInteger(data.minimumStock) &&
    data.minimumStock >= 0
  );
}

// Catálogo público: solamente repuestos activos.
router.get("/", async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, code, name, description, reference_price,
              quantity_available, minimum_stock, is_active,
              created_at, updated_at
       FROM spare_parts
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

// Listado administrativo: incluye repuestos activos e inactivos.
router.get(
  "/admin",
  authenticateToken,
  authorizeRoles("ADMINISTRADOR"),
  async (_req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT id, code, name, description, reference_price,
                quantity_available, minimum_stock, is_active,
                created_at, updated_at
         FROM spare_parts
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

// Crear repuesto.
router.post(
  "/",
  authenticateToken,
  authorizeRoles("ADMINISTRADOR"),
  async (req, res, next) => {
    try {
      const data = req.body ?? {};

      if (!isValidPartData(data)) {
        res.status(400).json({
          success: false,
          message: "Los datos del repuesto son inválidos",
        });
        return;
      }

      const result = await pool.query(
        `INSERT INTO spare_parts
          (code, name, description, reference_price,
           quantity_available, minimum_stock)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          data.code.trim().toUpperCase(),
          data.name.trim(),
          data.description?.trim() || null,
          data.referencePrice,
          data.quantityAvailable,
          data.minimumStock,
        ]
      );

      res.status(201).json({
        success: true,
        message: "Repuesto creado correctamente",
        data: result.rows[0],
      });
    } catch (error: any) {
      if (error.code === "23505") {
        res.status(409).json({
          success: false,
          message: "Ya existe un repuesto con ese código",
        });
        return;
      }

      next(error);
    }
  }
);

// Modificar los datos de un repuesto.
router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("ADMINISTRADOR"),
  async (req, res, next) => {
    try {
      const id = req.params.id;

      if (typeof id !== "string" || !uuidRegex.test(id)) {
        res.status(400).json({
          success: false,
          message: "Identificador de repuesto inválido",
        });
        return;
      }

      const data = req.body ?? {};

      if (!isValidPartData(data)) {
        res.status(400).json({
          success: false,
          message: "Los datos del repuesto son inválidos",
        });
        return;
      }

      const result = await pool.query(
        `UPDATE spare_parts
         SET code = $1,
             name = $2,
             description = $3,
             reference_price = $4,
             quantity_available = $5,
             minimum_stock = $6,
             updated_at = NOW()
         WHERE id = $7
         RETURNING *`,
        [
          data.code.trim().toUpperCase(),
          data.name.trim(),
          data.description?.trim() || null,
          data.referencePrice,
          data.quantityAvailable,
          data.minimumStock,
          id,
        ]
      );

      if (result.rowCount === 0) {
        res.status(404).json({
          success: false,
          message: "Repuesto no encontrado",
        });
        return;
      }

      res.json({
        success: true,
        message: "Repuesto actualizado correctamente",
        data: result.rows[0],
      });
    } catch (error: any) {
      if (error.code === "23505") {
        res.status(409).json({
          success: false,
          message: "Ya existe un repuesto con ese código",
        });
        return;
      }

      next(error);
    }
  }
);

// Activar o desactivar un repuesto sin eliminarlo.
router.patch(
  "/:id/status",
  authenticateToken,
  authorizeRoles("ADMINISTRADOR"),
  async (req, res, next) => {
    try {
      const id = req.params.id;

      if (typeof id !== "string" || !uuidRegex.test(id)) {
        res.status(400).json({
          success: false,
          message: "Identificador de repuesto inválido",
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
        `UPDATE spare_parts
         SET is_active = $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [isActive, id]
      );

      if (result.rowCount === 0) {
        res.status(404).json({
          success: false,
          message: "Repuesto no encontrado",
        });
        return;
      }

      res.json({
        success: true,
        message: isActive
          ? "Repuesto activado correctamente"
          : "Repuesto desactivado correctamente",
        data: result.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;