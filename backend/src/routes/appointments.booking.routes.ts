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

const dateTimeRegex =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

const timeZone = "America/Argentina/Buenos_Aires";

class BookingError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

function getLocalDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));

  return [
    result.getUTCFullYear(),
    String(result.getUTCMonth() + 1).padStart(2, "0"),
    String(result.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getLocalTime(date: Date): {
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, Number(part.value)])
  );

  return {
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

// Crear una reserva confirmada.
router.post(
  "/",
  authenticateToken,
  authorizeRoles("CLIENTE"),
  async (req, res, next) => {
    const {
      bicycleId,
      serviceId,
      mechanicId,
      startsAt,
    } = req.body ?? {};

    if (
      typeof bicycleId !== "string" ||
      !uuidRegex.test(bicycleId) ||
      typeof serviceId !== "string" ||
      !uuidRegex.test(serviceId) ||
      typeof mechanicId !== "string" ||
      !uuidRegex.test(mechanicId) ||
      typeof startsAt !== "string" ||
      !dateTimeRegex.test(startsAt) ||
      Number.isNaN(Date.parse(startsAt))
    ) {
      res.status(400).json({
        success: false,
        message: "Los datos de la reserva son inválidos",
      });
      return;
    }

    let client: PoolClient | undefined;

    let transactionStarted = false;

    try {
      client = await pool.connect();

      await client!.query("BEGIN");
      transactionStarted = true;

      const clientId = req.user!.id;
      const startDate = new Date(startsAt);
      const now = new Date();

      if (startDate <= now) {
        throw new BookingError(
          "No se pueden reservar horarios pasados",
          400
        );
      }

      const localDate = getLocalDate(startDate);
      const today = getLocalDate(now);
      const lastAllowedDate = addCalendarDays(today, 30);

      if (
        localDate < today ||
        localDate > lastAllowedDate
      ) {
        throw new BookingError(
          "La fecha debe estar dentro de los próximos 30 días",
          400
        );
      }

      const localTime = getLocalTime(startDate);

      if (localTime.second !== 0 || startDate.getUTCMilliseconds() !== 0) {
        throw new BookingError(
          "El horario debe comenzar en un minuto exacto",
          400
        );
      }

      // Serializa las reservas simultáneas del mismo cliente.
      const customerResult = await client!.query(
        `SELECT id
         FROM users
         WHERE id = $1
           AND role = 'CLIENTE'
           AND is_active = TRUE
         FOR UPDATE`,
        [clientId]
      );

      if (customerResult.rowCount === 0) {
        throw new BookingError(
          "La cuenta de cliente no está disponible",
          401
        );
      }

      // Verifica que la bicicleta pertenezca al cliente.
      const bicycleResult = await client!.query(
        `SELECT id
 FROM bicycles
 WHERE id = $1
   AND owner_id = $2
 FOR SHARE`,
        [bicycleId, clientId]
      );

      if (bicycleResult.rowCount === 0) {
        throw new BookingError(
          "La bicicleta no existe o no pertenece a tu cuenta",
          404
        );
      }

      // Obtiene y bloquea el servicio activo.
      const serviceResult = await client!.query(
        `SELECT id, name, duration_minutes, reference_price
         FROM services
         WHERE id = $1
           AND is_active = TRUE
         FOR SHARE`,
        [serviceId]
      );

      if (serviceResult.rowCount === 0) {
        throw new BookingError(
          "El servicio no existe o no está activo",
          404
        );
      }

      const service = serviceResult.rows[0];
      const durationMinutes = Number(service.duration_minutes);
      const price = service.reference_price;

      // Bloquea la fila del mecánico para coordinar
      // reservas y bloqueos administrativos.
      const mechanicResult = await client!.query(
        `SELECT id
         FROM users
         WHERE id = $1
           AND role = 'MECANICO'
           AND is_active = TRUE
         FOR UPDATE`,
        [mechanicId]
      );

      if (mechanicResult.rowCount === 0) {
        throw new BookingError(
          "El mecánico no existe o no está activo",
          409
        );
      }

      const dayOfWeek = new Date(
        `${localDate}T12:00:00Z`
      ).getUTCDay();

      // Bloquea el horario del taller durante la reserva.
      const hoursResult = await client!.query(
        `SELECT opens_at, closes_at, is_closed
         FROM workshop_hours
         WHERE day_of_week = $1
         FOR SHARE`,
        [dayOfWeek]
      );

      if (
        hoursResult.rowCount === 0 ||
        hoursResult.rows[0].is_closed
      ) {
        throw new BookingError(
          "El taller está cerrado ese día",
          409
        );
      }

      const hours = hoursResult.rows[0];

      const [openHour, openMinute] = String(hours.opens_at)
        .slice(0, 5)
        .split(":")
        .map(Number);

      const [closeHour, closeMinute] = String(hours.closes_at)
        .slice(0, 5)
        .split(":")
        .map(Number);

      const openingMinutes = openHour * 60 + openMinute;
      const closingMinutes = closeHour * 60 + closeMinute;

      const startMinutes =
        localTime.hour * 60 + localTime.minute;

      const endMinutes = startMinutes + durationMinutes;

      if (
        startMinutes < openingMinutes ||
        endMinutes > closingMinutes ||
        (startMinutes - openingMinutes) % durationMinutes !== 0
      ) {
        throw new BookingError(
          "El horario solicitado no está disponible dentro del horario del taller",
          409
        );
      }

      const endsAt = new Date(
        startDate.getTime() + durationMinutes * 60_000
      );

      // Comprueba bloqueos administrativos.
      const blockResult = await client!.query(
        `SELECT id
         FROM mechanic_blocks
         WHERE mechanic_id = $1
           AND starts_at < $3
           AND ends_at > $2
         LIMIT 1`,
        [mechanicId, startDate, endsAt]
      );

      if (blockResult.rowCount && blockResult.rowCount > 0) {
        throw new BookingError(
          "El mecánico tiene un bloqueo en ese horario",
          409
        );
      }

      // Comprueba turnos confirmados superpuestos.
      const appointmentResult = await client!.query(
        `SELECT id
         FROM appointments
         WHERE mechanic_id = $1
           AND status = 'CONFIRMED'
           AND starts_at < $3
           AND ends_at > $2
         LIMIT 1`,
        [mechanicId, startDate, endsAt]
      );

      if (
        appointmentResult.rowCount &&
        appointmentResult.rowCount > 0
      ) {
        throw new BookingError(
          "El horario solicitado ya está ocupado",
          409
        );
      }

      // Máximo de tres turnos futuros confirmados por cliente.
      const countResult = await client!.query(
        `SELECT COUNT(*)::INTEGER AS total
         FROM appointments
         WHERE client_id = $1
           AND status = 'CONFIRMED'
           AND starts_at > NOW()`,
        [clientId]
      );

      if (Number(countResult.rows[0].total) >= 3) {
        throw new BookingError(
          "Ya tenés tres turnos futuros confirmados",
          409
        );
      }

      // Inserta la reserva conservando los datos vigentes
      // del servicio al momento de la confirmación.
      const insertResult = await client!.query(
        `INSERT INTO appointments (
           client_id,
           bicycle_id,
           service_id,
           mechanic_id,
           starts_at,
           ends_at,
           service_name_snapshot,
           duration_minutes_snapshot,
           price_snapshot,
           status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'CONFIRMED')
         RETURNING
           id,
           client_id,
           bicycle_id,
           service_id,
           mechanic_id,
           starts_at,
           ends_at,
           service_name_snapshot,
           duration_minutes_snapshot,
           price_snapshot,
           status,
           created_at`,
        [
          clientId,
          bicycleId,
          serviceId,
          mechanicId,
          startDate,
          endsAt,
          service.name,
          durationMinutes,
          price,
        ]
      );

      await client!.query("COMMIT");
      transactionStarted = false;

      res.status(201).json({
        success: true,
        message: "Turno reservado correctamente",
        data: insertResult.rows[0],
      });
    } catch (error) {
      if (transactionStarted && client) {
        await client!.query("ROLLBACK").catch(() => undefined);
        transactionStarted = false;
      }

      if (error instanceof BookingError) {
        res.status(error.status).json({
          success: false,
          message: error.message,
        });
        return;
      }

      const databaseError = error as {
        code?: string;
      };

      if (
        databaseError.code === "23P01" ||
        databaseError.code === "23505"
      ) {
        res.status(409).json({
          success: false,
          message: "El horario solicitado ya no está disponible",
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


