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

const adminId = "47f1bba4-a421-4f84-91ca-70eacd7ae695";
const appointmentId = "67f1bba4-a421-4f84-91ca-70eacd7ae695";
const oldMechanicId = "77f1bba4-a421-4f84-91ca-70eacd7ae695";
const newMechanicId = "87f1bba4-a421-4f84-91ca-70eacd7ae695";

const adminToken = createAccessToken(adminId, "ADMINISTRADOR");
const clientToken = createAccessToken(adminId, "CLIENTE");
const mechanicToken = createAccessToken(adminId, "MECANICO");

function mockAuthentication(role = "ADMINISTRADOR") {
  queryMock.mockResolvedValueOnce({
    rows: [{ id: adminId, role }],
    rowCount: 1,
  });
}

function mockAssignmentTransaction(
  failure?: "missing" | "repair" | "inactive" | "appointmentConflict" | "block"
) {
  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const endsAt = new Date(Date.now() + 25 * 60 * 60 * 1000);

  transactionQueryMock
    .mockResolvedValueOnce({ rows: [], rowCount: null }) // BEGIN
    .mockResolvedValueOnce(
      failure === "missing"
        ? { rows: [], rowCount: 0 }
        : {
            rows: [{
              id: appointmentId,
              mechanic_id: oldMechanicId,
              starts_at: startsAt,
              ends_at: endsAt,
              status: "CONFIRMED",
            }],
            rowCount: 1,
          }
    );

  if (failure === "missing") {
    transactionQueryMock.mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // ROLLBACK
    return;
  }

  transactionQueryMock.mockResolvedValueOnce(
    failure === "repair"
      ? {
          rows: [{ id: "97f1bba4-a421-4f84-91ca-70eacd7ae695" }],
          rowCount: 1,
        }
      : { rows: [], rowCount: 0 }
  );

  if (failure === "repair") {
    transactionQueryMock.mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // ROLLBACK
    return;
  }

  transactionQueryMock.mockResolvedValueOnce(
    failure === "inactive"
      ? { rows: [], rowCount: 0 }
      : { rows: [{ id: newMechanicId }], rowCount: 1 }
  );

  if (failure === "inactive") {
    transactionQueryMock.mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // ROLLBACK
    return;
  }

  transactionQueryMock.mockResolvedValueOnce(
    failure === "appointmentConflict"
      ? { rows: [{ id: "a7f1bba4-a421-4f84-91ca-70eacd7ae695" }], rowCount: 1 }
      : { rows: [], rowCount: 0 }
  );

  if (failure === "appointmentConflict") {
    transactionQueryMock.mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // ROLLBACK
    return;
  }

  transactionQueryMock.mockResolvedValueOnce(
    failure === "block"
      ? { rows: [{ id: "b7f1bba4-a421-4f84-91ca-70eacd7ae695" }], rowCount: 1 }
      : { rows: [], rowCount: 0 }
  );

  if (failure === "block") {
    transactionQueryMock.mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // ROLLBACK
    return;
  }

  transactionQueryMock
    .mockResolvedValueOnce({
      rows: [{
        id: appointmentId,
        mechanic_id: newMechanicId,
        starts_at: startsAt,
        ends_at: endsAt,
        status: "CONFIRMED",
      }],
      rowCount: 1,
    }) // UPDATE
    .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // AUDIT
    .mockResolvedValueOnce({ rows: [], rowCount: null }); // COMMIT
}

describe("Reasignacion de turnos", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    connectMock.mockResolvedValue({
      query: transactionQueryMock,
      release: releaseMock,
    });
  });

  it("rechaza reasignaciones sin autenticacion", async () => {
    const response = await request(app)
      .patch(`/api/appointments/${appointmentId}/assign`)
      .send({ mechanicId: newMechanicId });

    expect(response.status).toBe(401);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza usuarios que no son administradores", async () => {
    mockAuthentication("MECANICO");

    const response = await request(app)
      .patch(`/api/appointments/${appointmentId}/assign`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({ mechanicId: newMechanicId });

    expect(response.status).toBe(403);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza identificadores invalidos", async () => {
    mockAuthentication();

    const response = await request(app)
      .patch("/api/appointments/id-invalido/assign")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mechanicId: newMechanicId });

    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("permite reasignar un turno e inserta el registro de auditoria", async () => {
    mockAuthentication();
    mockAssignmentTransaction();

    const response = await request(app)
      .patch(`/api/appointments/${appointmentId}/assign`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mechanicId: newMechanicId });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.mechanic_id).toBe(newMechanicId);

    expect(transactionQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO audit_logs"),
      [adminId, appointmentId, oldMechanicId, newMechanicId]
    );
    expect(transactionQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it("rechaza turnos inexistentes", async () => {
    mockAuthentication();
    mockAssignmentTransaction("missing");

    const response = await request(app)
      .patch(`/api/appointments/${appointmentId}/assign`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mechanicId: newMechanicId });

    expect(response.status).toBe(404);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rechaza mecanicos inactivos o inexistentes", async () => {
    mockAuthentication();
    mockAssignmentTransaction("inactive");

    const response = await request(app)
      .patch(`/api/appointments/${appointmentId}/assign`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mechanicId: newMechanicId });

    expect(response.status).toBe(400);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rechaza mecanicos con otro turno en el mismo horario", async () => {
    mockAuthentication();
    mockAssignmentTransaction("appointmentConflict");

    const response = await request(app)
      .patch(`/api/appointments/${appointmentId}/assign`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mechanicId: newMechanicId });

    expect(response.status).toBe(409);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rechaza mecanicos con un bloqueo en ese horario", async () => {
    mockAuthentication();
    mockAssignmentTransaction("block");

    const response = await request(app)
      .patch(`/api/appointments/${appointmentId}/assign`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mechanicId: newMechanicId });

    expect(response.status).toBe(409);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rechaza turnos que ya tienen una orden de reparacion activa", async () => {
    mockAuthentication();
    mockAssignmentTransaction("repair");

    const response = await request(app)
      .patch(`/api/appointments/${appointmentId}/assign`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mechanicId: newMechanicId });

    expect(response.status).toBe(409);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });
});
