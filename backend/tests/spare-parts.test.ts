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

const adminId = "47f1bba4-a421-4f84-91ca-70eacd7ae695";
const clientId = "d9f3b8d2-17a1-4c4e-9a31-6d8c7f2a5b10";
const partId = "9b2be6d0-57ea-4f81-9889-d3c0911e2ce5";

const adminToken = createAccessToken(adminId, "ADMINISTRADOR");
const clientToken = createAccessToken(clientId, "CLIENTE");

const part = {
  id: partId,
  code: "REP-001",
  name: "Cadena MTB",
  description: "Cadena de 11 velocidades",
  reference_price: "15000.00",
  quantity_available: 10,
  minimum_stock: 3,
  is_active: true,
};

const validPart = {
  code: "REP-001",
  name: "Cadena MTB",
  description: "Cadena de 11 velocidades",
  referencePrice: 15000,
  quantityAvailable: 10,
  minimumStock: 3,
};

describe("Catálogo de repuestos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista solamente los repuestos activos", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [part],
      rowCount: 1,
    });

    const response = await request(app).get("/api/spare-parts");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(queryMock.mock.calls[0][0]).toContain(
      "WHERE is_active = TRUE"
    );
  });

  it("rechaza el listado administrativo sin token", async () => {
    const response = await request(app).get(
      "/api/spare-parts/admin"
    );

    expect(response.status).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("impide que un cliente acceda al listado administrativo", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: clientId, role: "CLIENTE" }],
      rowCount: 1,
    });

    const response = await request(app)
      .get("/api/spare-parts/admin")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(response.status).toBe(403);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("permite al administrador listar todos los repuestos", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: adminId, role: "ADMINISTRADOR" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [part],
        rowCount: 1,
      });

    const response = await request(app)
      .get("/api/spare-parts/admin")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it("permite al administrador crear un repuesto", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: adminId, role: "ADMINISTRADOR" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [part],
        rowCount: 1,
      });

    const response = await request(app)
      .post("/api/spare-parts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validPart);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(queryMock.mock.calls[1][1]).toEqual([
      "REP-001",
      "Cadena MTB",
      "Cadena de 11 velocidades",
      15000,
      10,
      3,
    ]);
  });

  it("rechaza crear un repuesto con cantidades negativas", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: adminId, role: "ADMINISTRADOR" }],
      rowCount: 1,
    });

    const response = await request(app)
      .post("/api/spare-parts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        ...validPart,
        quantityAvailable: -1,
      });

    expect(response.status).toBe(400);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("rechaza crear un repuesto con código vacío", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: adminId, role: "ADMINISTRADOR" }],
      rowCount: 1,
    });

    const response = await request(app)
      .post("/api/spare-parts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        ...validPart,
        code: " ",
      });

    expect(response.status).toBe(400);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("rechaza códigos duplicados", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: adminId, role: "ADMINISTRADOR" }],
        rowCount: 1,
      })
      .mockRejectedValueOnce({ code: "23505" });

    const response = await request(app)
      .post("/api/spare-parts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validPart);

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
  });

  it("permite modificar un repuesto existente", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: adminId, role: "ADMINISTRADOR" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [part],
        rowCount: 1,
      });

    const response = await request(app)
      .put(`/api/spare-parts/${partId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validPart);

    expect(response.status).toBe(200);
    expect(queryMock.mock.calls[1][1][6]).toBe(partId);
  });

  it("rechaza identificadores inválidos al modificar", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: adminId, role: "ADMINISTRADOR" }],
      rowCount: 1,
    });

    const response = await request(app)
      .put("/api/spare-parts/id-invalido")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validPart);

    expect(response.status).toBe(400);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("permite desactivar un repuesto", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: adminId, role: "ADMINISTRADOR" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ ...part, is_active: false }],
        rowCount: 1,
      });

    const response = await request(app)
      .patch(`/api/spare-parts/${partId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(response.status).toBe(200);
    expect(response.body.data.is_active).toBe(false);
  });

  it("rechaza estados de activación inválidos", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: adminId, role: "ADMINISTRADOR" }],
      rowCount: 1,
    });

    const response = await request(app)
      .patch(`/api/spare-parts/${partId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: "false" });

    expect(response.status).toBe(400);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});