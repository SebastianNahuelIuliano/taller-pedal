
import { Router } from "express";
import { pool } from "../config/database.js";
import {
  createAccessToken,
  hashPassword,
  verifyPassword,
} from "../utils/security.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import type { UserRole } from "../types/auth.js";

const router = Router();

// REGISTRO DE CLIENTES
router.post("/register", async (req, res, next) => {
  try {
    const { fullName, email, password, phone } = req.body ?? {};

    if (
      typeof fullName !== "string" ||
      fullName.trim().length < 2 ||
      fullName.trim().length > 150
    ) {
      res.status(400).json({
        success: false,
        message: "Ingresá un nombre válido",
      });
      return;
    }

    if (
      typeof email !== "string" ||
      email.trim().length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      res.status(400).json({
        success: false,
        message: "Ingresá un correo electrónico válido",
      });
      return;
    }

    if (
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128
    ) {
      res.status(400).json({
        success: false,
        message: "La contraseña debe tener entre 8 y 128 caracteres",
      });
      return;
    }

    if (
      phone !== undefined &&
      phone !== null &&
      (typeof phone !== "string" || phone.trim().length > 40)
    ) {
      res.status(400).json({
        success: false,
        message: "El teléfono no es válido",
      });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await hashPassword(password);

    const result = await pool.query(
      `INSERT INTO users (
        full_name,
        email,
        phone,
        password_hash,
        role
      )
      VALUES ($1, $2, $3, $4, 'CLIENTE')
      RETURNING
        id,
        full_name AS "fullName",
        email,
        phone,
        role,
        is_active AS "isActive",
        created_at AS "createdAt"`,
      [
        fullName.trim(),
        normalizedEmail,
        typeof phone === "string" && phone.trim()
          ? phone.trim()
          : null,
        passwordHash,
      ]
    );

    const user = result.rows[0];
    const token = createAccessToken(
      user.id,
      user.role as UserRole
    );

    res.status(201).json({
      success: true,
      message: "Cuenta creada correctamente",
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      res.status(409).json({
        success: false,
        message: "Ya existe una cuenta con ese correo electrónico",
      });
      return;
    }

    next(error);
  }
});

// INICIO DE SESIÓN
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      res.status(400).json({
        success: false,
        message: "Ingresá tu correo y contraseña",
      });
      return;
    }

    const result = await pool.query(
      `SELECT
        id,
        full_name AS "fullName",
        email,
        phone,
        password_hash,
        role,
        is_active AS "isActive"
      FROM users
      WHERE email = $1`,
      [email.trim().toLowerCase()]
    );

    if (result.rowCount === 0) {
      res.status(401).json({
        success: false,
        message: "Correo o contraseña incorrectos",
      });
      return;
    }

    const user = result.rows[0];

    if (!user.isActive) {
      res.status(403).json({
        success: false,
        message: "La cuenta está desactivada",
      });
      return;
    }

    const passwordIsValid = await verifyPassword(
      password,
      user.password_hash
    );

    if (!passwordIsValid) {
      res.status(401).json({
        success: false,
        message: "Correo o contraseña incorrectos",
      });
      return;
    }

    const token = createAccessToken(
      user.id,
      user.role as UserRole
    );

    res.status(200).json({
      success: true,
      message: "Inicio de sesión correcto",
      data: {
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isActive: user.isActive,
        },
        token,
      },
    });
  } catch (error) {
    console.error("[ERROR DETALLADO LOGIN]:", error);
    next(error);
  }	
});

// PERFIL DEL USUARIO AUTENTICADO
router.get("/me", authenticateToken, async (req, res, next) => {
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
      WHERE id = $1`,
      [req.user!.id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        user: result.rows[0],
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
