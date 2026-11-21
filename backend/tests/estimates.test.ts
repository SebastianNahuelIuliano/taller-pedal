
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
const adminId = "47f1bba4-a421-4f84-91ca-70eacd7ae695";
const clientId = "57f1bba4-a421-4f84-91ca-70eacd7ae695";
const orderId = "97f1bba4-a421-4f84-91ca-70eacd7ae695";
const estimateId = "a7f1bba4-a421-4f84-91ca-70eacd7ae695";
const otherMechanicId = "87f1bba4-a421-4f84-91ca-70eacd7ae695";

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

const validItems = [
  {
    description: "Reemplazo de cadena",
    quantity: 1,
    unitPrice: 15000,
  },
  {
    description: "Mano de obra",
    quantity: 2,
    unitPrice: 5000,
  },
];

function mockEstimateTransaction(options?: {
  mechanicId?: string;
  diagnosis?: boolean;
  previousStatus?: string;
}) {
  const mechanic = options?.mechanicId ?? mechanicId;
  const hasDiagnosis = options?.diagnosis ?? true;
  const previousStatus = options?.previousStatus;

  transactionQueryMock
    .mockResolvedValueOnce({ rows: [], rowCount: null }) // BEGIN
    .mockResolvedValueOnce({
      rows: [{
        id: orderId,
        mechanic_id: mechanic,
      }],
      rowCount: 1,
    }) // ORDER
    .mockResolvedValueOnce({
      rows: hasDiagnosis ? [{ id: "diagnosis-id" }] : [],
      rowCount: hasDiagnosis ? 1 : 0,
    }); // DIAGNOSIS

  if (!hasDiagnosis) {
    transactionQueryMock.mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // ROLLBACK
    return;
  }

  transactionQueryMock.mockResolvedValueOnce({
    rows: previousStatus
      ? [{ version: 1, status: previousStatus }]
      : [],
    rowCount: previousStatus ? 1 : 0,
  }); // PREVIOUS ESTIMATE

  if (previousStatus === "PENDING") {
    transactionQueryMock.mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // ROLLBACK
    return;
  }

  transactionQueryMock
    .mockResolvedValueOnce({
      rows: [{
        id: estimateId,
        repair_order_id: orderId,
        version: previousStatus ? 2 : 1,
        status: "PENDING",
        total: "0.00",
        created_by: mechanic,
      }],
      rowCount: 1,
    }) // INSERT ESTIMATE
    .mockResolvedValueOnce({
      rows: [{
        id: "item-1",
        estimate_id: estimateId,
        description: "Reemplazo de cadena",
        quantity: "1.00",
        unit_price: "15000.00",
        subtotal: "15000.00",
      }],
      rowCount: 1,
    }) // INSERT ITEM 1
    .mockResolvedValueOnce({
      rows: [{
        id: "item-2",
        estimate_id: estimateId,
        description: "Mano de obra",
        quantity: "2.00",
        unit_price: "5000.00",
        subtotal: "10000.00",
      }],
      rowCount: 1,
    }) // INSERT ITEM 2
    .mockResolvedValueOnce({
      rows: [{ total: "25000.00" }],
      rowCount: 1,
    }) // UPDATE TOTAL
    .mockResolvedValueOnce({
      rows: [],
      rowCount: 1,
    }) // AUDIT
    .mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // COMMIT
}

describe("Presupuestos de ordenes de reparacion", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    connectMock.mockResolvedValue({
      query: transactionQueryMock,
      release: releaseMock,
    });
  });

  it("rechaza la creacion sin autenticacion", async () => {
    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/estimates`)
      .send({ items: validItems });

    expect(response.status).toBe(401);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza la creacion por clientes", async () => {
    mockAuthentication("CLIENTE", clientId);

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/estimates`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ items: validItems });

    expect(response.status).toBe(403);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza presupuestos sin conceptos", async () => {
    mockAuthentication();

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/estimates`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({ items: [] });

    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza cantidades negativas o iguales a cero", async () => {
    mockAuthentication();

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/estimates`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({
        items: [{
          description: "Repuesto",
          quantity: 0,
          unitPrice: 1000,
        }],
      });

    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza precios negativos", async () => {
    mockAuthentication();

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/estimates`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({
        items: [{
          description: "Repuesto",
          quantity: 1,
          unitPrice: -1000,
        }],
      });

    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("permite al mecanico asignado crear un presupuesto", async () => {
    mockAuthentication();
    mockEstimateTransaction();

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/estimates`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({
        items: validItems,
        total: 1,
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.version).toBe(1);
    expect(response.body.data.total).toBe("25000.00");
    expect(response.body.data.items).toHaveLength(2);

    expect(transactionQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("ROUND($3::numeric * $4::numeric, 2)"),
      [
        estimateId,
        "Reemplazo de cadena",
        "1",
        "15000",
      ]
    );

    expect(transactionQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("SELECT COALESCE(SUM(subtotal), 0)"),
      [estimateId]
    );

    expect(transactionQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it("rechaza presupuestos sin diagnosticos previos", async () => {
    mockAuthentication();
    mockEstimateTransaction({ diagnosis: false });

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/estimates`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({ items: validItems });

    expect(response.status).toBe(409);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rechaza presupuestos de mecanicos no asignados", async () => {
    mockAuthentication();
    mockEstimateTransaction({
      mechanicId: otherMechanicId,
    });

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/estimates`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({ items: validItems });

    expect(response.status).toBe(403);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("permite crear una nueva version cuando el presupuesto anterior ya fue respondido", async () => {
    mockAuthentication();
    mockEstimateTransaction({
      previousStatus: "REJECTED",
    });

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/estimates`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({ items: validItems });

    expect(response.status).toBe(201);
    expect(response.body.data.version).toBe(2);
    expect(transactionQueryMock).toHaveBeenCalledWith("COMMIT");
  });

  it("rechaza crear otra version si existe un presupuesto pendiente", async () => {
    mockAuthentication();
    mockEstimateTransaction({
      previousStatus: "PENDING",
    });

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/estimates`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({ items: validItems });

    expect(response.status).toBe(409);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("permite al administrador crear presupuestos", async () => {
    mockAuthentication("ADMINISTRADOR", adminId);
    mockEstimateTransaction();

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/estimates`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ items: validItems });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(transactionQueryMock).toHaveBeenCalledWith("COMMIT");
  });

  it("permite al cliente consultar los presupuestos de su orden", async () => {
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
          id: estimateId,
          version: 1,
          status: "PENDING",
          total: "25000.00",
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "item-1",
          description: "Reemplazo de cadena",
          subtotal: "15000.00",
        }],
        rowCount: 1,
      });

    const response = await request(app)
      .get(`/api/repair-orders/${orderId}/estimates`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].items).toHaveLength(1);
  });

  it("impide que un cliente consulte presupuestos de otra persona", async () => {
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
      .get(`/api/repair-orders/${orderId}/estimates`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(response.status).toBe(403);
  });
});

