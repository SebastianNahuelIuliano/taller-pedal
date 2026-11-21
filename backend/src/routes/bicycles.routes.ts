
import { Router } from "express";
import { pool } from "../config/database.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";

const router = Router();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.use(authenticateToken);

// Listar únicamente las bicicletas del usuario autenticado.
router.get("/", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, brand, model, bicycle_type,
              serial_number, observations, created_at
       FROM bicycles
       WHERE owner_id = $1
       ORDER BY created_at DESC`,
      [req.user!.id]
    );

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
});

// Registrar una bicicleta.
router.post("/", async (req, res, next) => {
  try {
    const {
      brand,
      model,
      bicycleType,
      serialNumber,
      observations,
    } = req.body;

    if (
      typeof brand !== "string" ||
      !brand.trim() ||
      brand.trim().length > 100 ||
      typeof model !== "string" ||
      !model.trim() ||
      model.trim().length > 100 ||
      typeof bicycleType !== "string" ||
      !bicycleType.trim() ||
      bicycleType.trim().length > 60 ||
      (serialNumber !== undefined &&
        serialNumber !== null &&
        (typeof serialNumber !== "string" ||
          serialNumber.trim().length > 120)) ||
      (observations !== undefined &&
        observations !== null &&
        typeof observations !== "string")
    ) {
      res.status(400).json({
        success: false,
        message: "Los datos de la bicicleta son inválidos",
      });
      return;
    }

    const result = await pool.query(
      `INSERT INTO bicycles (
         owner_id, brand, model, bicycle_type,
         serial_number, observations
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, brand, model, bicycle_type,
                 serial_number, observations, created_at`,
      [
        req.user!.id,
        brand.trim(),
        model.trim(),
        bicycleType.trim(),
        serialNumber?.trim() || null,
        observations?.trim() || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Bicicleta registrada correctamente",
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// Modificar una bicicleta propia.
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!UUID_REGEX.test(id)) {
      res.status(400).json({
        success: false,
        message: "El identificador de la bicicleta es inválido",
      });
      return;
    }

    const {
      brand,
      model,
      bicycleType,
      serialNumber,
      observations,
    } = req.body;

    if (
      typeof brand !== "string" ||
      !brand.trim() ||
      brand.trim().length > 100 ||
      typeof model !== "string" ||
      !model.trim() ||
      model.trim().length > 100 ||
      typeof bicycleType !== "string" ||
      !bicycleType.trim() ||
      bicycleType.trim().length > 60 ||
      (serialNumber !== undefined &&
        serialNumber !== null &&
        (typeof serialNumber !== "string" ||
          serialNumber.trim().length > 120)) ||
      (observations !== undefined &&
        observations !== null &&
        typeof observations !== "string")
    ) {
      res.status(400).json({
        success: false,
        message: "Los datos de la bicicleta son inválidos",
      });
      return;
    }

    const result = await pool.query(
      `UPDATE bicycles
       SET brand = $1,
           model = $2,
           bicycle_type = $3,
           serial_number = $4,
           observations = $5
       WHERE id = $6 AND owner_id = $7
       RETURNING id, brand, model, bicycle_type,
                 serial_number, observations, created_at`,
      [
        brand.trim(),
        model.trim(),
        bicycleType.trim(),
        serialNumber?.trim() || null,
        observations?.trim() || null,
        id,
        req.user!.id,
      ]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        success: false,
        message: "Bicicleta no encontrada",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Bicicleta actualizada correctamente",
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// Eliminar una bicicleta propia si no tiene turnos asociados.
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!UUID_REGEX.test(id)) {
      res.status(400).json({
        success: false,
        message: "El identificador de la bicicleta es inválido",
      });
      return;
    }

    const result = await pool.query(
      `DELETE FROM bicycles AS b
       WHERE b.id = $1
         AND b.owner_id = $2
         AND NOT EXISTS (
           SELECT 1
           FROM appointments AS a
           WHERE a.bicycle_id = b.id
         )
       RETURNING b.id`,
      [id, req.user!.id]
    );

    if (result.rowCount === 0) {
      const existing = await pool.query(
        `SELECT id
         FROM bicycles
         WHERE id = $1 AND owner_id = $2`,
        [id, req.user!.id]
      );

      if (existing.rowCount === 0) {
        res.status(404).json({
          success: false,
          message: "Bicicleta no encontrada",
        });
        return;
      }

      res.status(409).json({
        success: false,
        message: "No se puede eliminar una bicicleta que tiene turnos asociados",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Bicicleta eliminada correctamente",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
