
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createAccessToken } from "../src/utils/security.js";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("../src/config/database.js", () => ({
  pool: {
    query: queryMock,
  },
}));

import app from "../src/app.js";

process.env.JWT_SECRET =
  "clave-de-prueba-segura-de-al-menos-32-caracteres";

const clientId = "47f1bba4-a421-4f84-91ca-70eacd7ae695";
const otherClientId = "d9f3b8d2-17a1-4c4e-9a31-6d8c7f2a5b10";
const bicycleId = "9b2be6d0-57ea-4f81-9889-d3c0911e2ce5";

const token = createAccessToken(clientId, "CLIENTE");
const otherToken = createAccessToken(otherClientId, "CLIENTE");

const bicycle = {
  id: bicycleId,
  brand: "Venzo",
  model: "Raptor",
  bicycle_type: "MTB",
  serial_number: "ABC123",
  observations: "Bicicleta de prueba",
  created_at: "2026-11-20T12:00:00.000Z",
};

describe("Gestión de bicicletas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza consultar bicicletas sin token", async () => {
    const response = await request(app).get("/api/bicycles");

    expect(response.status).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("lista únicamente las bicicletas del usuario autenticado", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: clientId, role: "CLIENTE" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [bicycle],
        rowCount: 1,
      });

    const response = await request(app)
      .get("/api/bicycles")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);

    expect(queryMock.mock.calls[1][0]).toContain(
      "WHERE owner_id = $1"
    );
    expect(queryMock.mock.calls[1][1]).toEqual([clientId]);
  });

  it("registra una bicicleta a nombre del usuario autenticado", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: clientId, role: "CLIENTE" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [bicycle],
        rowCount: 1,
      });

    const response = await request(app)
      .post("/api/bicycles")
      .set("Authorization", `Bearer ${token}`)
      .send({
        brand: "Venzo",
        model: "Raptor",
        bicycleType: "MTB",
        serialNumber: "ABC123",
        observations: "Bicicleta de prueba",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(queryMock.mock.calls[1][1][0]).toBe(clientId);
  });

  it("rechaza registrar una bicicleta con datos inválidos", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: clientId, role: "CLIENTE" }],
      rowCount: 1,
    });

    const response = await request(app)
      .post("/api/bicycles")
      .set("Authorization", `Bearer ${token}`)
      .send({
        brand: "",
        model: "Raptor",
        bicycleType: "MTB",
      });

    expect(response.status).toBe(400);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("actualiza una bicicleta propia", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: clientId, role: "CLIENTE" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [bicycle],
        rowCount: 1,
      });

    const response = await request(app)
      .put(`/api/bicycles/${bicycleId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        brand: "Venzo",
        model: "Raptor actualizado",
        bicycleType: "MTB",
      });

    expect(response.status).toBe(200);
    expect(queryMock.mock.calls[1][1][5]).toBe(bicycleId);
    expect(queryMock.mock.calls[1][1][6]).toBe(clientId);
  });

  it("no permite modificar bicicletas de otro cliente", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: otherClientId, role: "CLIENTE" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

    const response = await request(app)
      .put(`/api/bicycles/${bicycleId}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({
        brand: "Venzo",
        model: "Raptor",
        bicycleType: "MTB",
      });

    expect(response.status).toBe(404);
  });

  it("no permite eliminar una bicicleta con turnos asociados", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: clientId, role: "CLIENTE" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      })
      .mockResolvedValueOnce({
        rows: [{ id: bicycleId }],
        rowCount: 1,
      });

    const response = await request(app)
      .delete(`/api/bicycles/${bicycleId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
  });
});
