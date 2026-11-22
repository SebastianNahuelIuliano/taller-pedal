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

const mechanicId = "77f1bba4-a421-4f84-91ca-70eacd7ae695";
const clientId = "47f1bba4-a421-4f84-91ca-70eacd7ae695";

const mechanicToken = createAccessToken(mechanicId, "MECANICO");
const clientToken = createAccessToken(clientId, "CLIENTE");

describe("Agenda del mecanico", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza consultas sin autenticacion", async () => {
    const response = await request(app).get(
      "/api/appointments/mechanic/mine"
    );

    expect(response.status).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rechaza usuarios que no son mecanicos", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: clientId, role: "CLIENTE" }],
      rowCount: 1,
    });

    const response = await request(app)
      .get("/api/appointments/mechanic/mine")
      .set("Authorization", `Bearer ${clientToken}`);

    expect(response.status).toBe(403);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("devuelve solamente los turnos del mecanico autenticado", async () => {
    const appointment = {
      id: "67f1bba4-a421-4f84-91ca-70eacd7ae695",
      client_name: "Cliente de prueba",
      bicycle_brand: "Trek",
      bicycle_model: "Marlin 5",
      service_name: "Mantenimiento general",
      appointment_status: "CONFIRMED",
      repair_order_id: null,
      repair_status: "NOT_RECEIVED",
    };

    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: mechanicId, role: "MECANICO" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [appointment],
        rowCount: 1,
      });

    const response = await request(app)
      .get("/api/appointments/mechanic/mine")
      .set("Authorization", `Bearer ${mechanicToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual([appointment]);

    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("WHERE a.mechanic_id = $1"),
      [mechanicId]
    );
  });
});
