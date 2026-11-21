
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

const mechanicId = "57f1bba4-a421-4f84-91ca-70eacd7ae695";
const otherMechanicId = "47f1bba4-a421-4f84-91ca-70eacd7ae695";
const adminId = "67f1bba4-a421-4f84-91ca-70eacd7ae695";
const clientId = "77f1bba4-a421-4f84-91ca-70eacd7ae695";
const orderId = "97f1bba4-a421-4f84-91ca-70eacd7ae695";

const mechanicToken = createAccessToken(mechanicId, "MECANICO");
const adminToken = createAccessToken(adminId, "ADMINISTRADOR");
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

function mockStatusTransaction(options?: {
  orderExists?: boolean;
  currentStatus?: string;
  mechanicId?: string;
  nextStatus?: string;
}) {
  const orderExists = options?.orderExists ?? true;
  const currentStatus = options?.currentStatus ?? "APPROVED";
  const assignedMechanic = options?.mechanicId ?? mechanicId;
  const nextStatus = options?.nextStatus ?? "IN_PROGRESS";

  transactionQueryMock
    .mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }) // BEGIN
    .mockResolvedValueOnce({
      rows: orderExists
        ? [{
            id: orderId,
            status: currentStatus,
            mechanic_id: assignedMechanic,
          }]
        : [],
      rowCount: orderExists ? 1 : 0,
    }); // ORDER

  if (!orderExists) {
    transactionQueryMock.mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // ROLLBACK
    return;
  }

  const validTransitions: Record<string, string[]> = {
    RECEIVED: ["DIAGNOSIS", "CANCELLED"],
    DIAGNOSIS: ["WAITING_APPROVAL", "CANCELLED"],
    WAITING_APPROVAL: ["APPROVED", "CANCELLED"],
    APPROVED: ["IN_PROGRESS", "CANCELLED"],
    IN_PROGRESS: ["WAITING_PARTS", "READY"],
    WAITING_PARTS: ["IN_PROGRESS"],
    READY: ["DELIVERED"],
    DELIVERED: [],
    CANCELLED: [],
  };

  if (!validTransitions[currentStatus]?.includes(nextStatus)) {
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
        status: nextStatus,
        updated_at: new Date().toISOString(),
      }],
      rowCount: 1,
    }) // UPDATE ORDER
    .mockResolvedValueOnce({
      rows: [],
      rowCount: 1,
    }) // STATUS HISTORY
    .mockResolvedValueOnce({
      rows: [],
      rowCount: 1,
    }) // AUDIT
    .mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // COMMIT
}

describe("Estados de órdenes de reparación", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    connectMock.mockResolvedValue({
      query: transactionQueryMock,
      release: releaseMock,
    });
  });

  it("rechaza cambios de estado sin autenticación", async () => {
    const response = await request(app)
      .patch(`/api/repair-orders/${orderId}/status`)
      .send({ status: "IN_PROGRESS" });

    expect(response.status).toBe(401);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("impide que un cliente modifique estados", async () => {
    mockAuthentication("CLIENTE", clientId);

    const response = await request(app)
      .patch(`/api/repair-orders/${orderId}/status`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ status: "IN_PROGRESS" });

    expect(response.status).toBe(403);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza identificadores inválidos", async () => {
    mockAuthentication();

    const response = await request(app)
      .patch("/api/repair-orders/id-invalido/status")
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({ status: "IN_PROGRESS" });

    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza estados inválidos", async () => {
    mockAuthentication();

    const response = await request(app)
      .patch(`/api/repair-orders/${orderId}/status`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({ status: "ESTADO_INEXISTENTE" });

    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza comentarios demasiado largos", async () => {
    mockAuthentication();

    const response = await request(app)
      .patch(`/api/repair-orders/${orderId}/status`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({
        status: "IN_PROGRESS",
        notes: "a".repeat(2001),
      });

    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("permite al mecánico asignado iniciar un trabajo aprobado", async () => {
    mockAuthentication();
    mockStatusTransaction({
      currentStatus: "APPROVED",
      nextStatus: "IN_PROGRESS",
    });

    const response = await request(app)
      .patch(`/api/repair-orders/${orderId}/status`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({
        status: "IN_PROGRESS",
        notes: "Inicio de reparación",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("IN_PROGRESS");

    expect(transactionQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("FOR UPDATE OF ro"),
      [orderId]
    );

    expect(transactionQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO repair_status_history"),
      [
        orderId,
        "APPROVED",
        "IN_PROGRESS",
        mechanicId,
        "Inicio de reparación",
      ]
    );

    expect(transactionQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO audit_logs"),
      [
        mechanicId,
        orderId,
        "APPROVED",
        "IN_PROGRESS",
        "Inicio de reparación",
      ]
    );

    expect(transactionQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it("rechaza cambios realizados por un mecánico no asignado", async () => {
    mockAuthentication();
    mockStatusTransaction({
      mechanicId: otherMechanicId,
    });

    const response = await request(app)
      .patch(`/api/repair-orders/${orderId}/status`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({ status: "IN_PROGRESS" });

    expect(response.status).toBe(403);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it("rechaza transiciones que no están permitidas", async () => {
    mockAuthentication();
    mockStatusTransaction({
      currentStatus: "APPROVED",
      nextStatus: "READY",
    });

    const response = await request(app)
      .patch(`/api/repair-orders/${orderId}/status`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({ status: "READY" });

    expect(response.status).toBe(409);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");

    expect(transactionQueryMock).not.toHaveBeenCalledWith(
      expect.stringContaining("UPDATE repair_orders"),
      expect.anything()
    );
  });

  it("impide que un mecánico cancele una orden", async () => {
    mockAuthentication();
    mockStatusTransaction({
      currentStatus: "APPROVED",
      nextStatus: "CANCELLED",
    });

    const response = await request(app)
      .patch(`/api/repair-orders/${orderId}/status`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({ status: "CANCELLED" });

    expect(response.status).toBe(403);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("permite al administrador cancelar una orden", async () => {
    mockAuthentication("ADMINISTRADOR", adminId);
    mockStatusTransaction({
      currentStatus: "RECEIVED",
      nextStatus: "CANCELLED",
    });

    const response = await request(app)
      .patch(`/api/repair-orders/${orderId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "CANCELLED" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("CANCELLED");

    expect(transactionQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO repair_status_history"),
      [
        orderId,
        "RECEIVED",
        "CANCELLED",
        adminId,
        null,
      ]
    );

    expect(transactionQueryMock).toHaveBeenCalledWith("COMMIT");
  });

  it("impide modificar una orden inexistente", async () => {
    mockAuthentication();
    mockStatusTransaction({ orderExists: false });

    const response = await request(app)
      .patch(`/api/repair-orders/${orderId}/status`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({ status: "IN_PROGRESS" });

    expect(response.status).toBe(404);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("impide avanzar desde un estado terminal", async () => {
    mockAuthentication();
    mockStatusTransaction({
      currentStatus: "DELIVERED",
      nextStatus: "IN_PROGRESS",
    });

    const response = await request(app)
      .patch(`/api/repair-orders/${orderId}/status`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({ status: "IN_PROGRESS" });

    expect(response.status).toBe(409);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("permite consultar el historial al cliente propietario", async () => {
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
          previous_status: "APPROVED",
          new_status: "IN_PROGRESS",
          notes: "Inicio de reparación",
        }],
        rowCount: 1,
      });

    const response = await request(app)
      .get(`/api/repair-orders/${orderId}/status-history`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].new_status).toBe("IN_PROGRESS");
  });

  it("impide consultar el historial de otro cliente", async () => {
    mockAuthentication("CLIENTE", clientId);

    queryMock.mockResolvedValueOnce({
      rows: [{
        id: orderId,
        client_id: "87f1bba4-a421-4f84-91ca-70eacd7ae695",
        mechanic_id: mechanicId,
      }],
      rowCount: 1,
    });

    const response = await request(app)
      .get(`/api/repair-orders/${orderId}/status-history`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(response.status).toBe(403);
    expect(queryMock).toHaveBeenCalledTimes(2);
  });
});
