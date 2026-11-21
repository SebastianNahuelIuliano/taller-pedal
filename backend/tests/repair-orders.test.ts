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

const mechanicId = "77f1bba4-a421-4f84-91ca-70eacd7ae695";
const adminId = "47f1bba4-a421-4f84-91ca-70eacd7ae695";
const appointmentId = "67f1bba4-a421-4f84-91ca-70eacd7ae695";
const orderId = "97f1bba4-a421-4f84-91ca-70eacd7ae695";
const otherMechanicId = "87f1bba4-a421-4f84-91ca-70eacd7ae695";

const mechanicToken = createAccessToken(mechanicId, "MECANICO");
const adminToken = createAccessToken(adminId, "ADMINISTRADOR");
const clientToken = createAccessToken(adminId, "CLIENTE");

function mockAuthentication(
  role = "MECANICO",
  id = mechanicId
) {
  queryMock.mockResolvedValueOnce({
    rows: [{ id, role }],
    rowCount: 1,
  });
}

function mockReceptionTransaction(
  failure?: "missing" | "unconfirmed" | "notAssigned" | "duplicate"
) {
  transactionQueryMock
    .mockResolvedValueOnce({ rows: [], rowCount: null }) // BEGIN
    .mockResolvedValueOnce(
      failure === "missing"
        ? { rows: [], rowCount: 0 }
        : {
            rows: [{
              id: appointmentId,
              mechanic_id: mechanicId,
              status:
                failure === "unconfirmed"
                  ? "CANCELLED"
                  : "CONFIRMED",
            }],
            rowCount: 1,
          }
    );

  if (failure === "missing" || failure === "unconfirmed") {
    transactionQueryMock.mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // ROLLBACK
    return;
  }

  transactionQueryMock.mockResolvedValueOnce(
    failure === "duplicate"
      ? { rows: [{ id: orderId }], rowCount: 1 }
      : { rows: [], rowCount: 0 }
  );

  if (failure === "duplicate") {
    transactionQueryMock.mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // ROLLBACK
    return;
  }

  transactionQueryMock
    .mockResolvedValueOnce({
      rows: [{
        id: orderId,
        appointment_id: appointmentId,
        received_by: mechanicId,
        visible_condition: "Cuadro con rayones",
        accessories_received: "Casco",
        status: "RECEIVED",
      }],
      rowCount: 1,
    }) // INSERT ORDER
    .mockResolvedValueOnce({
      rows: [],
      rowCount: 1,
    }) // AUDIT
    .mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // COMMIT
}

describe("Recepcion de bicicletas y ordenes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    connectMock.mockResolvedValue({
      query: transactionQueryMock,
      release: releaseMock,
    });
  });

  it("rechaza recepciones sin autenticacion", async () => {
    const response = await request(app)
      .post(`/api/appointments/${appointmentId}/receive`)
      .send({ visibleCondition: "Buen estado" });

    expect(response.status).toBe(401);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza usuarios que no son mecanicos ni administradores", async () => {
    mockAuthentication("CLIENTE", adminId);

    const response = await request(app)
      .post(`/api/appointments/${appointmentId}/receive`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ visibleCondition: "Buen estado" });

    expect(response.status).toBe(403);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza identificadores de turno invalidos", async () => {
    mockAuthentication();

    const response = await request(app)
      .post("/api/appointments/id-invalido/receive")
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({ visibleCondition: "Buen estado" });

    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza recepciones sin estado visible", async () => {
    mockAuthentication();

    const response = await request(app)
      .post(`/api/appointments/${appointmentId}/receive`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({ accessoriesReceived: "Casco" });

    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("permite al mecanico asignado recibir la bicicleta y crear la orden", async () => {
    mockAuthentication();
    mockReceptionTransaction();

    const response = await request(app)
      .post(`/api/appointments/${appointmentId}/receive`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({
        visibleCondition: "Cuadro con rayones",
        accessoriesReceived: "Casco",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("RECEIVED");
    expect(response.body.data.appointment_id).toBe(appointmentId);

    expect(transactionQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO repair_orders"),
      [appointmentId, mechanicId, "Cuadro con rayones", "Casco"]
    );

    expect(transactionQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO audit_logs"),
      [
        mechanicId,
        orderId,
        appointmentId,
        "Cuadro con rayones",
        "Casco",
      ]
    );

    expect(transactionQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it("rechaza turnos inexistentes", async () => {
    mockAuthentication();
    mockReceptionTransaction("missing");

    const response = await request(app)
      .post(`/api/appointments/${appointmentId}/receive`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({ visibleCondition: "Buen estado" });

    expect(response.status).toBe(404);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rechaza turnos que no estan confirmados", async () => {
    mockAuthentication();
    mockReceptionTransaction("unconfirmed");

    const response = await request(app)
      .post(`/api/appointments/${appointmentId}/receive`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({ visibleCondition: "Buen estado" });

    expect(response.status).toBe(409);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rechaza recepciones realizadas por un mecanico no asignado", async () => {
    mockAuthentication();

    transactionQueryMock
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({
        rows: [{
          id: appointmentId,
          mechanic_id: otherMechanicId,
          status: "CONFIRMED",
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: null });

    const response = await request(app)
      .post(`/api/appointments/${appointmentId}/receive`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({ visibleCondition: "Buen estado" });

    expect(response.status).toBe(403);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rechaza una segunda recepcion del mismo turno", async () => {
    mockAuthentication();
    mockReceptionTransaction("duplicate");

    const response = await request(app)
      .post(`/api/appointments/${appointmentId}/receive`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({ visibleCondition: "Buen estado" });

    expect(response.status).toBe(409);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("permite al administrador registrar una recepcion", async () => {
    mockAuthentication("ADMINISTRADOR", adminId);
    mockReceptionTransaction();

    const response = await request(app)
      .post(`/api/appointments/${appointmentId}/receive`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ visibleCondition: "Buen estado" });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(transactionQueryMock).toHaveBeenCalledWith("COMMIT");
  });
});
