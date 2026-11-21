
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("../src/config/database.js", () => ({
  pool: {
    query: queryMock,
  },
}));

import app from "../src/app.js";

const serviceId = "9b2be6d0-57ea-4f81-9889-d3c0911e2ce5";

function getDateOffset(days: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  const today = `${values.year}-${values.month}-${values.day}`;
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

describe("Consulta de disponibilidad de turnos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza una fecha con formato inválido", async () => {
    const response = await request(app).get(
      `/api/appointments/availability?date=20-11-2026&serviceId=${serviceId}`
    );

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rechaza una fecha inexistente", async () => {
    const response = await request(app).get(
      `/api/appointments/availability?date=2026-02-30&serviceId=${serviceId}`
    );

    expect(response.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rechaza un identificador de servicio inválido", async () => {
    const response = await request(app).get(
      `/api/appointments/availability?date=${getDateOffset(1)}&serviceId=incorrecto`
    );

    expect(response.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rechaza fechas anteriores al día actual", async () => {
    const response = await request(app).get(
      `/api/appointments/availability?date=${getDateOffset(-1)}&serviceId=${serviceId}`
    );

    expect(response.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rechaza fechas posteriores al horizonte de 30 días", async () => {
    const response = await request(app).get(
      `/api/appointments/availability?date=${getDateOffset(31)}&serviceId=${serviceId}`
    );

    expect(response.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("responde 404 cuando el servicio no existe o está inactivo", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    });

    const response = await request(app).get(
      `/api/appointments/availability?date=${getDateOffset(1)}&serviceId=${serviceId}`
    );

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("no ofrece horarios cuando el taller está cerrado", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{
          id: serviceId,
          name: "Mantenimiento general",
          duration_minutes: 60,
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{
          opens_at: "09:00:00",
          closes_at: "18:00:00",
          is_closed: true,
        }],
        rowCount: 1,
      });

    const response = await request(app).get(
      `/api/appointments/availability?date=${getDateOffset(1)}&serviceId=${serviceId}`
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.availableSlots).toEqual([]);
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("no ofrece horarios si no hay mecánicos activos", async () => {
    const date = getDateOffset(1);
    const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();

    queryMock
      .mockResolvedValueOnce({
        rows: [{
          id: serviceId,
          name: "Mantenimiento general",
          duration_minutes: 60,
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{
          opens_at: "09:00:00",
          closes_at: "11:00:00",
          is_closed: false,
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

    const response = await request(app).get(
      `/api/appointments/availability?date=${date}&serviceId=${serviceId}`
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.availableSlots).toEqual([]);
    expect(queryMock).toHaveBeenCalledTimes(3);
    expect(dayOfWeek).toBeGreaterThanOrEqual(0);
  });

  it("genera horarios cuando hay un mecánico activo disponible", async () => {
    const date = getDateOffset(1);

    queryMock
      .mockResolvedValueOnce({
        rows: [{
          id: serviceId,
          name: "Mantenimiento general",
          duration_minutes: 60,
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{
          opens_at: "09:00:00",
          closes_at: "11:00:00",
          is_closed: false,
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{
          mechanic_id: "11111111-1111-4111-8111-111111111111",
          mechanic_name: "Mecánico de prueba",
          appointment_start: null,
          appointment_end: null,
          block_start: null,
          block_end: null,
        }],
        rowCount: 1,
      });

    const response = await request(app).get(
      `/api/appointments/availability?date=${date}&serviceId=${serviceId}`
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.availableSlots).toHaveLength(2);

    expect(response.body.data.availableSlots[0].availableMechanics).toEqual([
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Mecánico de prueba",
      },
    ]);
  });

  it("descarta los horarios ocupados por turnos o bloqueos", async () => {
    const date = getDateOffset(1);

    queryMock
      .mockResolvedValueOnce({
        rows: [{
          id: serviceId,
          name: "Mantenimiento general",
          duration_minutes: 60,
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{
          opens_at: "09:00:00",
          closes_at: "11:00:00",
          is_closed: false,
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{
          mechanic_id: "11111111-1111-4111-8111-111111111111",
          mechanic_name: "Mecánico ocupado",
          appointment_start: `${date}T09:00:00-03:00`,
          appointment_end: `${date}T10:00:00-03:00`,
          block_start: `${date}T10:00:00-03:00`,
          block_end: `${date}T11:00:00-03:00`,
        }],
        rowCount: 1,
      });

    const response = await request(app).get(
      `/api/appointments/availability?date=${date}&serviceId=${serviceId}`
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.availableSlots).toHaveLength(0);
  });
});
