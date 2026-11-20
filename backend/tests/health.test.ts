
import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/app.js";

describe("API Taller Pedal", () => {
  it("debe responder correctamente al consultar el estado", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe(
      "Taller Pedal API funcionando correctamente"
    );
  });

  it("debe responder 404 cuando la ruta no existe", async () => {
    const response = await request(app).get("/ruta-inexistente");

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});
