
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createAccessToken } from "../src/utils/security.js";

const { queryMock, connectMock, clientQueryMock, releaseMock } =
  vi.hoisted(() => ({
    queryMock: vi.fn(),
    connectMock: vi.fn(),
    clientQueryMock: vi.fn(),
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

const adminId = "47f1bba4-a421-4f84-91ca-70eacd7ae695";
const clientId = "d9f3b8d2-17a1-4c4e-9a31-6d8c7f2a5b10";
const mechanicId = "9b2be6d0-57ea-4f81-9889-d3c0911e2ce5";
const blockId = "d38ba016-f8c6-4ab7-98f1-bcdc0d61d9a0";

const adminToken = createAccessToken(adminId, "ADMINISTRADOR");
const clientToken = createAccessToken(clientId, "CLIENTE");

const hours = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  opensAt: "09:00",
  closesAt: "18:00",
  isClosed: dayOfWeek === 0,
}));

const block = {
  id: blockId,
  mechanic_id: mechanicId,
  starts_at: "2026-11-23T10:00:00.000Z",
  ends_at: "2026-11-23T11:00:00.000Z",
  reason: "Vacaciones",
  created_by: adminId,
};

describe("Gestión de horarios y bloqueos", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    connectMock.mockResolvedValue({
      query: clientQueryMock,
      release: releaseMock,
    });
  });

  it("consulta los horarios públicamente", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    });

    const response = await request(app).get("/api/workshop/hours");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("rechaza actualizar horarios sin token", async () => {
    const response = await request(app)
      .put("/api/workshop/hours")
      .send({ hours });

    expect(response.status).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("impide que un cliente modifique los horarios", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: clientId, role: "CLIENTE" }],
      rowCount: 1,
    });

    const response = await request(app)
      .put("/api/workshop/hours")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ hours });

    expect(response.status).toBe(403);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza una configuración semanal incompleta", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: adminId, role: "ADMINISTRADOR" }],
      rowCount: 1,
    });

    const response = await request(app)
      .put("/api/workshop/hours")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ hours: [] });

    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("actualiza los siete días dentro de una transacción", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: adminId, role: "ADMINISTRADOR" }],
      rowCount: 1,
    });

    clientQueryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    clientQueryMock.mockResolvedValueOnce({ rows: [], rowCount: null });
    clientQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const savedHours = hours.map((day) => ({
      day_of_week: day.dayOfWeek,
      opens_at: day.opensAt,
      closes_at: day.closesAt,
      is_closed: day.isClosed,
    }));

    clientQueryMock.mockResolvedValueOnce({
      rows: savedHours,
      rowCount: 7,
    });

    const response = await request(app)
      .put("/api/workshop/hours")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ hours });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(clientQueryMock).toHaveBeenCalledTimes(10);
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("rechaza consultar bloqueos sin token", async () => {
    const response = await request(app).get("/api/workshop/blocks");

    expect(response.status).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("permite al administrador consultar bloqueos", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: adminId, role: "ADMINISTRADOR" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [block],
        rowCount: 1,
      });

    const response = await request(app)
      .get("/api/workshop/blocks")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it("rechaza crear bloqueos con datos inválidos", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: adminId, role: "ADMINISTRADOR" }],
      rowCount: 1,
    });

    const response = await request(app)
      .post("/api/workshop/blocks")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(response.status).toBe(400);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza crear bloqueos para mecánicos inexistentes o inactivos", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: adminId, role: "ADMINISTRADOR" }],
      rowCount: 1,
    });

    clientQueryMock
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: null });

    const response = await request(app)
      .post("/api/workshop/blocks")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        mechanicId,
        startsAt: "2026-11-23T10:00:00-03:00",
        endsAt: "2026-11-23T11:00:00-03:00",
        reason: "Vacaciones",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("mecánico no existe");
    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("crea un bloqueo para un mecánico activo", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: adminId, role: "ADMINISTRADOR" }],
      rowCount: 1,
    });

    clientQueryMock
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({
        rows: [{ id: mechanicId }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      })
      .mockResolvedValueOnce({
        rows: [block],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: null });

    const response = await request(app)
      .post("/api/workshop/blocks")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        mechanicId,
        startsAt: "2026-11-23T10:00:00-03:00",
        endsAt: "2026-11-23T11:00:00-03:00",
        reason: "Vacaciones",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(clientQueryMock.mock.calls[3][1][4]).toBe(adminId);
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("rechaza eliminar un bloqueo con identificador inválido", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: adminId, role: "ADMINISTRADOR" }],
      rowCount: 1,
    });

    const response = await request(app)
      .delete("/api/workshop/blocks/identificador-invalido")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(400);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("responde 404 al eliminar un bloqueo inexistente", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: adminId, role: "ADMINISTRADOR" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

    const response = await request(app)
      .delete(`/api/workshop/blocks/${blockId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
  });
});
