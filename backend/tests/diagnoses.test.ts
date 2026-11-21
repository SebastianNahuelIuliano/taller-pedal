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
const clientId = "47f1bba4-a421-4f84-91ca-70eacd7ae695";
const orderId = "97f1bba4-a421-4f84-91ca-70eacd7ae695";
const otherMechanicId = "87f1bba4-a421-4f84-91ca-70eacd7ae695";

const mechanicToken = createAccessToken(mechanicId, "MECANICO");
const clientToken = createAccessToken(clientId, "CLIENTE");

function mockAuthentication(
  role = "MECANICO",
  id = mechanicId
) {
  queryMock.mockResolvedValueOnce({
    rows: [{ id, role }],
    rowCount: 1,
  });
}

describe("Diagnosticos de ordenes de reparacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    connectMock.mockResolvedValue({
      query: transactionQueryMock,
      release: releaseMock,
    });
  });

  it("rechaza el registro de diagnosticos sin autenticacion", async () => {
    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/diagnoses`)
      .send({ description: "Desgaste de cadena" });

    expect(response.status).toBe(401);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza descripciones vacias", async () => {
    mockAuthentication();

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/diagnoses`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({ description: "   " });

    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("permite al mecanico asignado registrar un diagnostico", async () => {
    mockAuthentication();

    const diagnosis = {
      id: "a7f1bba4-a421-4f84-91ca-70eacd7ae695",
      repair_order_id: orderId,
      mechanic_id: mechanicId,
      description: "Desgaste de cadena",
      recommended_tasks: "Reemplazar cadena",
    };

    transactionQueryMock
      .mockResolvedValueOnce({ rows: [], rowCount: null }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: orderId,
          status: "RECEIVED",
          mechanic_id: mechanicId,
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [diagnosis],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: null }) // AUDIT
      .mockResolvedValueOnce({ rows: [], rowCount: null }); // COMMIT

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/diagnoses`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({
        description: "Desgaste de cadena",
        recommendedTasks: "Reemplazar cadena",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.description).toBe("Desgaste de cadena");

    expect(transactionQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO diagnoses"),
      [orderId, mechanicId, "Desgaste de cadena", "Reemplazar cadena"]
    );

    expect(transactionQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it("rechaza diagnosticos de mecanicos no asignados", async () => {
    mockAuthentication();

    transactionQueryMock
      .mockResolvedValueOnce({ rows: [], rowCount: null }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: orderId,
          status: "RECEIVED",
          mechanic_id: otherMechanicId,
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: null }); // ROLLBACK

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/diagnoses`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({ description: "Desgaste de cadena" });

    expect(response.status).toBe(403);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it("rechaza ordenes que todavia no fueron recibidas", async () => {
    mockAuthentication();

    transactionQueryMock
      .mockResolvedValueOnce({ rows: [], rowCount: null }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: orderId,
          status: "CANCELLED",
          mechanic_id: mechanicId,
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: null }); // ROLLBACK

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/diagnoses`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({ description: "Desgaste de cadena" });

    expect(response.status).toBe(409);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("permite al cliente consultar los diagnosticos de su propia orden", async () => {
    mockAuthentication("CLIENTE", clientId);

    queryMock
      .mockResolvedValueOnce({
        rows: [{
          id: orderId,
          client_id: clientId,
          mechanic_id: mechanicId,
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "a7f1bba4-a421-4f84-91ca-70eacd7ae695",
          repair_order_id: orderId,
          mechanic_id: mechanicId,
          mechanic_name: "Mecanico de prueba",
          description: "Desgaste de cadena",
          recommended_tasks: "Reemplazar cadena",
        }],
        rowCount: 1,
      });

    const response = await request(app)
      .get(`/api/repair-orders/${orderId}/diagnoses`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].description).toBe("Desgaste de cadena");
  });

  it("impide que un cliente consulte diagnosticos de otra persona", async () => {
    mockAuthentication("CLIENTE", clientId);

    queryMock.mockResolvedValueOnce({
      rows: [{
        id: orderId,
        client_id: otherMechanicId,
        mechanic_id: mechanicId,
      }],
      rowCount: 1,
    });

    const response = await request(app)
      .get(`/api/repair-orders/${orderId}/diagnoses`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(response.status).toBe(403);
    expect(queryMock).toHaveBeenCalledTimes(2);
  });
});
