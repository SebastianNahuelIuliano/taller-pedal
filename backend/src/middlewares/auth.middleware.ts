
import type { RequestHandler } from "express";
import { pool } from "../config/database.js";
import { verifyAccessToken } from "../utils/security.js";
import { isUserRole } from "../types/auth.js";

export const authenticateToken: RequestHandler = async (
  req,
  res,
  next
) => {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      message: "Debés iniciar sesión para acceder a este recurso",
    });
    return;
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    res.status(401).json({
      success: false,
      message: "Token no proporcionado",
    });
    return;
  }

  try {
    const payload = verifyAccessToken(token);

    if (!payload.sub || !isUserRole(payload.role)) {
      res.status(401).json({
        success: false,
        message: "Token inválido",
      });
      return;
    }

    // Consultamos la base para verificar que la cuenta
    // siga activa y que el rol no haya cambiado.
    const result = await pool.query(
      `SELECT id, role
       FROM users
       WHERE id = $1 AND is_active = TRUE`,
      [payload.sub]
    );

    if (result.rowCount === 0) {
      res.status(401).json({
        success: false,
        message: "La cuenta no existe o está desactivada",
      });
      return;
    }

    const user = result.rows[0];

    if (!isUserRole(user.role)) {
      res.status(403).json({
        success: false,
        message: "Rol de usuario inválido",
      });
      return;
    }

    req.user = {
      id: user.id,
      role: user.role,
    };

    next();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "JsonWebTokenError" ||
        error.name === "TokenExpiredError")
    ) {
      res.status(401).json({
        success: false,
        message: "El token es inválido o expiró",
      });
      return;
    }

    next(error);
  }
};

export function authorizeRoles(
  ...allowedRoles: Array<"CLIENTE" | "MECANICO" | "ADMINISTRADOR">
): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "No estás autenticado",
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: "No tenés permisos para realizar esta acción",
      });
      return;
    }

    next();
  };
}
