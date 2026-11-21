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
const appointmentId = "67f1bba4-a421-4f84-91ca-70eacd7ae695";

const clientToken = createAccessToken(clientId, "CLIENTE");
const adminToken = createAccessToken(clientId, "ADMINISTRADOR");
const mechanicToken = createAccessToken(clientId, "MECANICO");

function mockAuthentication(role = "CLIENTE") {
  queryMock.mockResolvedValueOnce({
    rows: [{ id: clientId, role }],
    rowCount: 1,
  });
}

function mockCancellationTransaction(options?: {
  startsAt?: Date;
  appointmentClientId?: string;
  status?: string;
  repairOrders?: Array<{ id: string }>;
  includeUpdate?: boolean;
}) {
  const startsAt =
    options?.startsAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000);

  const repairOrders = options?.repairOrders ?? [];

  transactionQueryMock
    .mockResolvedValueOnce({ rows: [], rowCount: null }) // BEGIN
    .mockResolvedValueOnce({
      rows: [{
        id: appointmentId,
        client_id: options?.appointmentClientId ?? clientId,
        starts_at: startsAt,
        status: options?.status ?? "CONFIRMED",
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({
      rows: repairOrders,
      rowCount: repairOrders.length,
    });

  if (options?.includeUpdate !== false && options?.status !== "CANCELLED" && repairOrders.length === 0) {
    transactionQueryMock
      .mockResolvedValueOnce({
        rows: [{
          id: appointmentId,
          client_id: options?.appointmentClientId ?? clientId,
          starts_at: startsAt,
          status: "CANCELLED",
          cancellation_reason: null,
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: null }); // COMMIT
  }
}

describe("Cancelacion de turnos", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    connectMock.mockResolvedValue({
      query: transactionQueryMock,
      release: releaseMock,
    });
  });

  it("rechaza cancelaciones sin autenticacion", async () => {
    const response = await request(app)
      .patch(`/api/appointments/${appointmentId}/cancel`)
      .send({});

    expect(response.status).toBe(401);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza usuarios que no son clientes ni administradores", async () => {
    mockAuthentication("MECANICO");

    const response = await request(app)
      .patch(`/api/appointments/${appointmentId}/cancel`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({});

    expect(response.status).toBe(403);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza identificadores invalidos", async () => {
    mockAuthentication();

    const response = await request(app)
      .patch("/api/appointments/id-invalido/cancel")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({});

    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("exige un motivo cuando cancela un administrador", async () => {
    mockAuthentication("ADMINISTRADOR");

    const response = await request(app)
      .patch(`/api/appointments/${appointmentId}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("motivo");
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("permite al cliente cancelar su turno con mas de 12 horas", async () => {
    mockAuthentication();
    mockCancellationTransaction();

    const response = await request(app)
      .patch(`/api/appointments/${appointmentId}/cancel`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ reason: "No puedo asistir" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("CANCELLED");

    expect(transactionQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it("rechaza la cancelacion del cliente con menos de 12 horas", async () => {
    mockAuthentication();

    mockCancellationTransaction({
      startsAt: new Date(Date.now() + 11 * 60 * 60 * 1000 + 59 * 60 * 1000),
      includeUpdate: false,
    });

    transactionQueryMock.mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // ROLLBACK

    const response = await request(app)
      .patch(`/api/appointments/${appointmentId}/cancel`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it("rechaza turnos que ya tienen una orden de reparacion activa", async () => {
    mockAuthentication();

    mockCancellationTransaction({
      repairOrders: [{ id: "77f1bba4-a421-4f84-91ca-70eacd7ae695" }],
    });

    transactionQueryMock.mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // ROLLBACK

    const response = await request(app)
      .patch(`/api/appointments/${appointmentId}/cancel`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("permite al administrador cancelar un turno con poca anticipacion", async () => {
    mockAuthentication("ADMINISTRADOR");

    mockCancellationTransaction({
      startsAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const response = await request(app)
      .patch(`/api/appointments/${appointmentId}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "Cierre excepcional del taller" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("CANCELLED");
    expect(transactionQueryMock).toHaveBeenCalledWith("COMMIT");
  });
});


