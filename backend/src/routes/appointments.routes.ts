
import { Router } from "express";
import { pool } from "../config/database.js";
import { authenticateToken, authorizeRoles } from "../middlewares/auth.middleware.js";

const router = Router();

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const timeZone = "America/Argentina/Buenos_Aires";

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

function localDateTimeToDate(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.slice(0, 5).split(":").map(Number);

  const target = Date.UTC(year, month - 1, day, hour, minute);
  let result = new Date(target);

  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(result);

    const values = Object.fromEntries(
      parts.map((part) => [part.type, Number(part.value)])
    );

    const represented = Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second
    );

    result = new Date(result.getTime() + target - represented);
  }

  return result;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}


// Consultar la agenda del mecanico autenticado.
router.get(
  "/mechanic/mine",
  authenticateToken,
  authorizeRoles("MECANICO"),
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT
          a.id,
          a.client_id,
          c.full_name AS client_name,
          a.bicycle_id,
          b.brand AS bicycle_brand,
          b.model AS bicycle_model,
          b.bicycle_type,
          a.service_id,
          a.service_name_snapshot AS service_name,
          a.duration_minutes_snapshot,
          a.price_snapshot,
          a.starts_at,
          a.ends_at,
          a.status AS appointment_status,
          ro.id AS repair_order_id,
          COALESCE(ro.status, 'NOT_RECEIVED') AS repair_status
        FROM appointments a
        INNER JOIN users c ON c.id = a.client_id
        INNER JOIN bicycles b ON b.id = a.bicycle_id
        LEFT JOIN repair_orders ro ON ro.appointment_id = a.id
        WHERE a.mechanic_id = $1
        ORDER BY a.starts_at ASC`,
        [req.user!.id]
      );

      res.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);
// Consultar los turnos del cliente autenticado.
router.get(
  "/mine",
  authenticateToken,
  authorizeRoles("CLIENTE"),
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT
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
          created_at
        FROM appointments
        WHERE client_id = $1
        ORDER BY starts_at DESC`,
        [req.user!.id]
      );

      res.status(200).json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);
// Consultar disponibilidad para un servicio y una fecha.
router.get("/availability", async (req, res, next) => {
  try {
    const date =
      typeof req.query.date === "string" ? req.query.date : "";

    const serviceId =
      typeof req.query.serviceId === "string"
        ? req.query.serviceId
        : "";

    if (!isValidDate(date) || !uuidRegex.test(serviceId)) {
      res.status(400).json({
        success: false,
        message: "La fecha o el identificador del servicio son inválidos",
      });
      return;
    }

    const today = getLocalDate(new Date());
    const lastAllowedDate = addCalendarDays(today, 30);

    if (date < today || date > lastAllowedDate) {
      res.status(400).json({
        success: false,
        message: "La fecha debe estar dentro de los próximos 30 días",
      });
      return;
    }

    const serviceResult = await pool.query(
      `SELECT id, name, duration_minutes
       FROM services
       WHERE id = $1 AND is_active = TRUE`,
      [serviceId]
    );

    if (serviceResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: "El servicio no existe o no está activo",
      });
      return;
    }

    const service = serviceResult.rows[0];
    const durationMinutes = Number(service.duration_minutes);

    const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();

    const hoursResult = await pool.query(
      `SELECT opens_at, closes_at, is_closed
       FROM workshop_hours
       WHERE day_of_week = $1`,
      [dayOfWeek]
    );

    if (
      hoursResult.rows.length === 0 ||
      hoursResult.rows[0].is_closed
    ) {
      res.json({
        success: true,
        data: {
          date,
          service,
          availableSlots: [],
        },
      });
      return;
    }

    const hours = hoursResult.rows[0];

    const scheduleResult = await pool.query(
      `SELECT
         u.id AS mechanic_id,
         u.full_name AS mechanic_name,
         a.starts_at AS appointment_start,
         a.ends_at AS appointment_end,
         b.starts_at AS block_start,
         b.ends_at AS block_end
       FROM users u
       LEFT JOIN appointments a
         ON a.mechanic_id = u.id
         AND a.status = 'CONFIRMED'
         AND a.starts_at < (
           ($1::date + $3::time) AT TIME ZONE $4
         )
         AND a.ends_at > (
           ($1::date + $2::time) AT TIME ZONE $4
         )
       LEFT JOIN mechanic_blocks b
         ON b.mechanic_id = u.id
         AND b.starts_at < (
           ($1::date + $3::time) AT TIME ZONE $4
         )
         AND b.ends_at > (
           ($1::date + $2::time) AT TIME ZONE $4
         )
       WHERE u.role = 'MECANICO'
         AND u.is_active = TRUE
       ORDER BY u.full_name ASC`,
      [
        date,
        hours.opens_at,
        hours.closes_at,
        timeZone,
      ]
    );

    const mechanics = new Map<
      string,
      {
        id: string;
        name: string;
        appointments: Array<{ start: Date; end: Date }>;
        blocks: Array<{ start: Date; end: Date }>;
      }
    >();

    for (const row of scheduleResult.rows) {
      let mechanic = mechanics.get(row.mechanic_id);

      if (!mechanic) {
        mechanic = {
          id: row.mechanic_id,
          name: row.mechanic_name,
          appointments: [],
          blocks: [],
        };

        mechanics.set(row.mechanic_id, mechanic);
      }

      if (row.appointment_start && row.appointment_end) {
        mechanic.appointments.push({
          start: new Date(row.appointment_start),
          end: new Date(row.appointment_end),
        });
      }

      if (row.block_start && row.block_end) {
        mechanic.blocks.push({
          start: new Date(row.block_start),
          end: new Date(row.block_end),
        });
      }
    }

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

    const now = Date.now();
    const availableSlots = [];

    for (
      let startMinutes = openingMinutes;
      startMinutes + durationMinutes <= closingMinutes;
      startMinutes += durationMinutes
    ) {
      const endMinutes = startMinutes + durationMinutes;

      const startTime = `${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}`;
      const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

      const startsAt = localDateTimeToDate(date, startTime);
const endsAt = localDateTimeToDate(date, endTime);

      if (startsAt.getTime() <= now) {
        continue;
      }

      const availableMechanics = Array.from(mechanics.values())
        .filter((mechanic) => {
          const hasAppointment = mechanic.appointments.some(
            (appointment) =>
              appointment.start < endsAt &&
              appointment.end > startsAt
          );

          const hasBlock = mechanic.blocks.some(
            (block) =>
              block.start < endsAt && block.end > startsAt
          );

          return !hasAppointment && !hasBlock;
        })
        .map((mechanic) => ({
          id: mechanic.id,
          name: mechanic.name,
        }));

      if (availableMechanics.length > 0) {
        availableSlots.push({
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          availableMechanics,
        });
      }
    }

    res.json({
      success: true,
      data: {
        date,
        service: {
          id: service.id,
          name: service.name,
          durationMinutes,
        },
        availableSlots,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
