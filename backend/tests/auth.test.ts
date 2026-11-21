
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { hashPassword } from "../src/utils/security.js";

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

const testUser = {
  id: "47f1bba4-a421-4f84-91ca-70eacd7ae695",
  fullName: "Usuario de Prueba",
  email: "prueba@example.com",
  phone: "1122334455",
  role: "CLIENTE",
  isActive: true,
  createdAt: "2026-11-20T12:00:00.000Z",
};

describe("Autenticación", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("debe rechazar el acceso al perfil sin token", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("debe rechazar un registro con datos inválidos", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        fullName: "A",
        email: "correo-invalido",
        password: "123",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("debe permitir iniciar sesión y consultar el perfil", async () => {
    const passwordHash = await hashPassword("TallerPedal2026!");

    queryMock.mockResolvedValueOnce({
      rows: [
        {
          ...testUser,
          password_hash: passwordHash,
        },
      ],
      rowCount: 1,
    });

    const loginResponse = await request(app)
      .post("/api/auth/login")
      .send({
        email: testUser.email,
        password: "TallerPedal2026!",
      });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.success).toBe(true);
    expect(loginResponse.body.data.token).toEqual(
      expect.any(String)
    );

    const token = loginResponse.body.data.token;

    queryMock.mockResolvedValueOnce({
      rows: [{ id: testUser.id, role: "CLIENTE" }],
      rowCount: 1,
    });

    queryMock.mockResolvedValueOnce({
      rows: [testUser],
      rowCount: 1,
    });

    const profileResponse = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(profileResponse.status).toBe(200);
    expect(profileResponse.body.success).toBe(true);
    expect(profileResponse.body.data.user.email).toBe(
      testUser.email
    );
  });
});
