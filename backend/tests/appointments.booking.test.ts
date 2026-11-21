
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createAccessToken } from "../src/utils/security.js";

const {
  queryMock,
  connectMock,
  transactionQueryMock,
  releaseMock,
} = vi.hoisted(() => ({
  queryMock: vi.fn(),
  connectMock: vi.fn(),
  transactionQueryMock: vi.fn(),
  releaseMock: vi.fn(),
}));

vi.mock("../src/config/database.js", () => ({
  pool: {
    query: queryMock,
    connect: connectMock,
  },
}));

import app from "../src/app.js";

process.env.JWT_SECRET =
  "clave-de-prueba-segura-de-al-menos-32-caracteres";

const clientId = "47f1bba4-a421-4f84-91ca-70eacd7ae695";
const bicycleId = "d38ba016-f8c6-4ab7-98f1-bcdc0d61d9a0";
const serviceId = "9b2be6d0-57ea-4f81-9889-d3c0911e2ce5";
const mechanicId = "57f1bba4-a421-4f84-91ca-70eacd7ae695";

const token = createAccessToken(clientId, "CLIENTE");

const headers = {
  Authorization: `Bearer ${token}`,
};

function getFutureWeekday(): string {
  const date = new Date();

  date.setDate(date.getDate() + 1);

  while (date.getDay() === 0) {
    date.setDate(date.getDate() + 1);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

const booking = {
  bicycleId,
  serviceId,
  mechanicId,
  startsAt: `${getFutureWeekday()}T09:00:00-03:00`,
};

function mockAuthentication(role = "CLIENTE") {
  queryMock.mockResolvedValueOnce({
    rows: [{ id: clientId, role }],
    rowCount: 1,
  });
}

function mockSuccessfulTransaction() {
  transactionQueryMock
    .mockResolvedValueOnce({ rows: [], rowCount: null }) // BEGIN
    .mockResolvedValueOnce({ rows: [{ id: clientId }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ id: bicycleId }], rowCount: 1 })
    .mockResolvedValueOnce({
      rows: [{
        id: serviceId,
        name: "Mantenimiento general",
        duration_minutes: 60,
        reference_price: "15000.00",
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [{ id: mechanicId }], rowCount: 1 })
    .mockResolvedValueOnce({
      rows: [{
        opens_at: "09:00:00",
        closes_at: "18:00:00",
        is_closed: false,
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Bloqueos
    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Turnos existentes
    .mockResolvedValueOnce({
      rows: [{ total: 0 }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({
      rows: [{
        id: "67f1bba4-a421-4f84-91ca-70eacd7ae695",
        client_id: clientId,
        bicycle_id: bicycleId,
        service_id: serviceId,
        mechanic_id: mechanicId,
        status: "CONFIRMED",
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [], rowCount: null }); // COMMIT
}

describe("Reservas transaccionales", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    connectMock.mockResolvedValue({
      query: transactionQueryMock,
      release: releaseMock,
    });
  });

  it("rechaza reservas sin autenticación", async () => {
    const response = await request(app)
      .post("/api/appointments")
      .send({});

    expect(response.status).toBe(401);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza usuarios que no son clientes", async () => {
    mockAuthentication("ADMINISTRADOR");

    const response = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${createAccessToken(clientId, "ADMINISTRADOR")}`)
      .send(booking);

    expect(response.status).toBe(403);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza datos de reserva inválidos", async () => {
    mockAuthentication();

    const response = await request(app)
      .post("/api/appointments")
      .set("Authorization", headers.Authorization)
      .send({});

    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("crea una reserva y confirma la transacción", async () => {
    mockAuthentication();
    mockSuccessfulTransaction();

    const response = await request(app)
      .post("/api/appointments")
      .set("Authorization", headers.Authorization)
      .send(booking);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("CONFIRMED");

    expect(transactionQueryMock).toHaveBeenCalledWith(
      "BEGIN"
    );

    expect(transactionQueryMock).toHaveBeenCalledWith(
      "COMMIT"
    );

    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it("rechaza una bicicleta que no pertenece al cliente", async () => {
    mockAuthentication();

    transactionQueryMock
      .mockResolvedValueOnce({ rows: [], rowCount: null }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: clientId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Bicicleta
      .mockResolvedValueOnce({ rows: [], rowCount: null }); // ROLLBACK

    const response = await request(app)
      .post("/api/appointments")
      .set("Authorization", headers.Authorization)
      .send(booking);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(transactionQueryMock).toHaveBeenCalledWith(
      "ROLLBACK"
    );
    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it("rechaza el turno cuando el horario ya está ocupado", async () => {
    mockAuthentication();

    transactionQueryMock
      .mockResolvedValueOnce({ rows: [], rowCount: null }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: clientId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: bicycleId }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{
          id: serviceId,
          name: "Mantenimiento general",
          duration_minutes: 60,
          reference_price: "15000.00",
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ id: mechanicId }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{
          opens_at: "09:00:00",
          closes_at: "18:00:00",
          is_closed: false,
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Bloqueos
      .mockResolvedValueOnce({ rows: [{ id: "turno-existente" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: null }); // ROLLBACK

    const response = await request(app)
      .post("/api/appointments")
      .set("Authorization", headers.Authorization)
      .send(booking);

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(transactionQueryMock).toHaveBeenCalledWith(
      "ROLLBACK"
    );
  });

  it("rechaza una reserva si se alcanza el límite de tres turnos", async () => {
    mockAuthentication();

    transactionQueryMock
      .mockResolvedValueOnce({ rows: [], rowCount: null }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: clientId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: bicycleId }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{
          id: serviceId,
          name: "Mantenimiento general",
          duration_minutes: 60,
          reference_price: "15000.00",
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ id: mechanicId }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{
          opens_at: "09:00:00",
          closes_at: "18:00:00",
          is_closed: false,
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ total: 3 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: null }); // ROLLBACK

    const response = await request(app)
      .post("/api/appointments")
      .set("Authorization", headers.Authorization)
      .send(booking);

    expect(response.status).toBe(409);
    expect(response.body.message).toContain("tres turnos");
    expect(transactionQueryMock).toHaveBeenCalledWith(
      "ROLLBACK"
    );
  });

  it("maneja el conflicto de concurrencia de PostgreSQL", async () => {
    mockAuthentication();

    transactionQueryMock
      .mockResolvedValueOnce({ rows: [], rowCount: null }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: clientId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: bicycleId }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{
          id: serviceId,
          name: "Mantenimiento general",
          duration_minutes: 60,
          reference_price: "15000.00",
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ id: mechanicId }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{
          opens_at: "09:00:00",
          closes_at: "18:00:00",
          is_closed: false,
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ total: 0 }], rowCount: 1 })
      .mockRejectedValueOnce({ code: "23P01" }) // Exclusión PostgreSQL
      .mockResolvedValueOnce({ rows: [], rowCount: null }); // ROLLBACK

    const response = await request(app)
      .post("/api/appointments")
      .set("Authorization", headers.Authorization)
      .send(booking);

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(transactionQueryMock).toHaveBeenCalledWith(
      "ROLLBACK"
    );
    expect(releaseMock).toHaveBeenCalledOnce();
  });
});
