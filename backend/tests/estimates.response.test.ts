
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

const clientId = "57f1bba4-a421-4f84-91ca-70eacd7ae695";
const otherClientId = "47f1bba4-a421-4f84-91ca-70eacd7ae695";
const orderId = "97f1bba4-a421-4f84-91ca-70eacd7ae695";
const estimateId = "a7f1bba4-a421-4f84-91ca-70eacd7ae695";

const clientToken = createAccessToken(clientId, "CLIENTE");

function mockAuthentication(
  role = "CLIENTE",
  id = clientId
) {
  queryMock.mockResolvedValueOnce({
    rows: [{ id, role }],
    rowCount: 1,
  });
}

function mockOrderTransaction(options?: {
  orderExists?: boolean;
  ownerId?: string;
  estimateExists?: boolean;
  estimateStatus?: string;
  orderStatus?: string;
  decision?: "APPROVED" | "REJECTED";
}) {
  const orderExists = options?.orderExists ?? true;
  const ownerId = options?.ownerId ?? clientId;
  const estimateExists = options?.estimateExists ?? true;
  const estimateStatus = options?.estimateStatus ?? "PENDING";
  const orderStatus =
    options?.orderStatus ?? "WAITING_APPROVAL";
  const decision = options?.decision ?? "APPROVED";

  transactionQueryMock
    .mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }) // BEGIN
    .mockResolvedValueOnce({
      rows: orderExists
        ? [{
            id: orderId,
            status: orderStatus,
            client_id: ownerId,
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

  if (ownerId !== clientId) {
    transactionQueryMock.mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // ROLLBACK

    return;
  }

  if (orderStatus !== "WAITING_APPROVAL") {
    transactionQueryMock.mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // ROLLBACK

    return;
  }

  transactionQueryMock.mockResolvedValueOnce({
    rows: estimateExists
      ? [{
          id: estimateId,
          repair_order_id: orderId,
          status: estimateStatus,
          version: 1,
          total: "25000.00",
        }]
      : [],
    rowCount: estimateExists ? 1 : 0,
  }); // ESTIMATE

  if (!estimateExists || estimateStatus !== "PENDING") {
    transactionQueryMock.mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // ROLLBACK

    return;
  }

  transactionQueryMock.mockResolvedValueOnce({
    rows: [{
      id: estimateId,
      repair_order_id: orderId,
      status: decision,
      version: 1,
      total: "25000.00",
      responded_by: clientId,
    }],
    rowCount: 1,
  }); // UPDATE ESTIMATE

  if (decision === "APPROVED") {
    transactionQueryMock
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      }) // UPDATE ORDER
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      }); // STATUS HISTORY
  }

  transactionQueryMock
    .mockResolvedValueOnce({
      rows: [],
      rowCount: 1,
    }) // AUDIT
    .mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // COMMIT
}

describe("Respuesta de presupuestos", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    connectMock.mockResolvedValue({
      query: transactionQueryMock,
      release: releaseMock,
    });
  });

  it("rechaza respuestas sin autenticacion", async () => {
    const response = await request(app)
      .patch(
        `/api/repair-orders/${orderId}/estimates/${estimateId}/respond`
      )
      .send({ decision: "APPROVED" });

    expect(response.status).toBe(401);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza respuestas de usuarios que no son clientes", async () => {
    mockAuthentication("MECANICO");

    const response = await request(app)
      .patch(
        `/api/repair-orders/${orderId}/estimates/${estimateId}/respond`
      )
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ decision: "APPROVED" });

    expect(response.status).toBe(403);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza identificadores invalidos", async () => {
    mockAuthentication();

    const response = await request(app)
      .patch(
        "/api/repair-orders/id-invalido/estimates/id-invalido/respond"
      )
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ decision: "APPROVED" });

    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza decisiones invalidas", async () => {
    mockAuthentication();

    const response = await request(app)
      .patch(
        `/api/repair-orders/${orderId}/estimates/${estimateId}/respond`
      )
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ decision: "CANCELLED" });

    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza ordenes inexistentes", async () => {
    mockAuthentication();
    mockOrderTransaction({ orderExists: false });

    const response = await request(app)
      .patch(
        `/api/repair-orders/${orderId}/estimates/${estimateId}/respond`
      )
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ decision: "APPROVED" });

    expect(response.status).toBe(404);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it("impide responder presupuestos de otro cliente", async () => {
    mockAuthentication();
    mockOrderTransaction({ ownerId: otherClientId });

    const response = await request(app)
      .patch(
        `/api/repair-orders/${orderId}/estimates/${estimateId}/respond`
      )
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ decision: "APPROVED" });

    expect(response.status).toBe(403);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rechaza responder presupuestos si la orden no espera aprobacion", async () => {
    mockAuthentication();
    mockOrderTransaction({
      orderStatus: "APPROVED",
    });

    const response = await request(app)
      .patch(
        `/api/repair-orders/${orderId}/estimates/${estimateId}/respond`
      )
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ decision: "APPROVED" });

    expect(response.status).toBe(409);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rechaza presupuestos que no pertenecen a la orden", async () => {
    mockAuthentication();
    mockOrderTransaction({ estimateExists: false });

    const response = await request(app)
      .patch(
        `/api/repair-orders/${orderId}/estimates/${estimateId}/respond`
      )
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ decision: "APPROVED" });

    expect(response.status).toBe(404);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("impide responder un presupuesto que ya fue respondido", async () => {
    mockAuthentication();
    mockOrderTransaction({ estimateStatus: "REJECTED" });

    const response = await request(app)
      .patch(
        `/api/repair-orders/${orderId}/estimates/${estimateId}/respond`
      )
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ decision: "APPROVED" });

    expect(response.status).toBe(409);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("permite aprobar un presupuesto y actualiza la orden", async () => {
    mockAuthentication();
    mockOrderTransaction({ decision: "APPROVED" });

    const response = await request(app)
      .patch(
        `/api/repair-orders/${orderId}/estimates/${estimateId}/respond`
      )
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ decision: "APPROVED" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("APPROVED");
    expect(response.body.data.repair_order_status).toBe("APPROVED");

    expect(transactionQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("FOR UPDATE OF ro"),
      [orderId]
    );

    expect(transactionQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("status = 'PENDING'"),
      ["APPROVED", clientId, estimateId, orderId]
    );

    expect(transactionQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO repair_status_history"),
      expect.arrayContaining([
        orderId,
        "WAITING_APPROVAL",
        "APPROVED",
        clientId,
      ])
    );

    expect(transactionQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO audit_logs"),
      expect.arrayContaining([
        clientId,
        "ESTIMATE_APPROVED",
        orderId,
        estimateId,
      ])
    );

    expect(transactionQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it("permite rechazar un presupuesto sin iniciar el trabajo", async () => {
    mockAuthentication();
    mockOrderTransaction({ decision: "REJECTED" });

    const response = await request(app)
      .patch(
        `/api/repair-orders/${orderId}/estimates/${estimateId}/respond`
      )
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ decision: "REJECTED" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("REJECTED");
    expect(response.body.data.repair_order_status).toBe("WAITING_APPROVAL");

    expect(transactionQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO audit_logs"),
      expect.arrayContaining([
        clientId,
        "ESTIMATE_REJECTED",
        orderId,
        estimateId,
      ])
    );

    expect(transactionQueryMock).not.toHaveBeenCalledWith(
      expect.stringContaining("UPDATE repair_orders"),
      expect.anything()
    );

    expect(transactionQueryMock).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO repair_status_history"),
      expect.anything()
    );

    expect(transactionQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(releaseMock).toHaveBeenCalledOnce();
  });
});
