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
const sparePartId = "87f1bba4-a421-4f84-91ca-70eacd7ae695";

const mechanicToken = createAccessToken(mechanicId, "MECANICO");
const otherMechanicToken = createAccessToken(otherMechanicId, "MECANICO");
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

function mockTransaction(options?: {
  orderExists?: boolean;
  mechanicId?: string;
  status?: string;
  stockAvailable?: boolean;
  partExists?: boolean;
  partActive?: boolean;
  quantityAvailable?: number;
  movementFails?: boolean;
}) {
  const orderExists = options?.orderExists ?? true;
  const assignedMechanic = options?.mechanicId ?? mechanicId;
  const status = options?.status ?? "IN_PROGRESS";
  const stockAvailable = options?.stockAvailable ?? true;
  const partExists = options?.partExists ?? true;
  const partActive = options?.partActive ?? true;
  const quantityAvailable = options?.quantityAvailable ?? 10;
  const movementFails = options?.movementFails ?? false;

  transactionQueryMock
    .mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }) // BEGIN
    .mockResolvedValueOnce({
      rows: orderExists
        ? [{
            id: orderId,
            status,
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

  const allowedStatuses = [
    "APPROVED",
    "IN_PROGRESS",
    "WAITING_PARTS",
  ];

  if (!allowedStatuses.includes(status)) {
    transactionQueryMock.mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // ROLLBACK
    return;
  }

  transactionQueryMock.mockResolvedValueOnce({
    rows: stockAvailable
      ? [{
          id: sparePartId,
          code: "REP-001",
          name: "Cadena",
          quantity_available: quantityAvailable - 2,
        }]
      : [],
    rowCount: stockAvailable ? 1 : 0,
  }); // UPDATE STOCK

  if (!stockAvailable) {
    transactionQueryMock.mockResolvedValueOnce({
      rows: partExists
        ? [{
            id: sparePartId,
            is_active: partActive,
            quantity_available: quantityAvailable,
          }]
        : [],
      rowCount: partExists ? 1 : 0,
    }); // SELECT PART

    transactionQueryMock.mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // ROLLBACK
    return;
  }

  if (movementFails) {
    transactionQueryMock.mockRejectedValueOnce(
      new Error("Error al insertar movimiento")
    );

    transactionQueryMock.mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // ROLLBACK
    return;
  }

  transactionQueryMock
    .mockResolvedValueOnce({
      rows: [{
        id: "a7f1bba4-a421-4f84-91ca-70eacd7ae695",
        spare_part_id: sparePartId,
        repair_order_id: orderId,
        movement_type: "OUT",
        quantity: 2,
        notes: null,
        created_by: mechanicId,
      }],
      rowCount: 1,
    }) // MOVEMENT
    .mockResolvedValueOnce({
      rows: [],
      rowCount: 1,
    }) // AUDIT
    .mockResolvedValueOnce({
      rows: [],
      rowCount: null,
    }); // COMMIT
}

describe("Consumo de repuestos", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    connectMock.mockResolvedValue({
      query: transactionQueryMock,
      release: releaseMock,
    });
  });

  it("rechaza consumos sin autenticación", async () => {
    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/consumptions`)
      .send({
        sparePartId,
        quantity: 2,
      });

    expect(response.status).toBe(401);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("impide que un cliente registre consumos", async () => {
    mockAuthentication("CLIENTE", clientId);

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/consumptions`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({
        sparePartId,
        quantity: 2,
      });

    expect(response.status).toBe(403);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza identificadores inválidos", async () => {
    mockAuthentication();

    const response = await request(app)
      .post("/api/repair-orders/id-invalido/consumptions")
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({
        sparePartId,
        quantity: 2,
      });

    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza cantidades inválidas", async () => {
    mockAuthentication();

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/consumptions`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({
        sparePartId,
        quantity: 0,
      });

    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rechaza observaciones demasiado largas", async () => {
    mockAuthentication();

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/consumptions`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({
        sparePartId,
        quantity: 2,
        notes: "a".repeat(1001),
      });

    expect(response.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("permite al mecánico asignado registrar un consumo", async () => {
    mockAuthentication();
    mockTransaction();

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/consumptions`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({
        sparePartId,
        quantity: 2,
        notes: "Repuesto utilizado",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.movement.movement_type).toBe("OUT");
    expect(response.body.data.movement.quantity).toBe(2);
    expect(response.body.data.sparePart.quantity_available).toBe(8);

    expect(transactionQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("FOR UPDATE OF ro"),
      [orderId]
    );

    expect(transactionQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE spare_parts"),
      [2, sparePartId]
    );

    expect(transactionQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO stock_movements"),
      [
        sparePartId,
        orderId,
        2,
        "Repuesto utilizado",
        mechanicId,
      ]
    );

    expect(transactionQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it("permite al administrador registrar consumos", async () => {
    mockAuthentication("ADMINISTRADOR", adminId);
    mockTransaction();

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/consumptions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        sparePartId,
        quantity: 2,
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(transactionQueryMock).toHaveBeenCalledWith("COMMIT");
  });

  it("rechaza órdenes inexistentes", async () => {
    mockAuthentication();
    mockTransaction({ orderExists: false });

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/consumptions`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({
        sparePartId,
        quantity: 2,
      });

    expect(response.status).toBe(404);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rechaza consumos de órdenes asignadas a otro mecánico", async () => {
    mockAuthentication();
    mockTransaction({ mechanicId: otherMechanicId });

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/consumptions`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({
        sparePartId,
        quantity: 2,
      });

    expect(response.status).toBe(403);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rechaza consumos en órdenes con estado no permitido", async () => {
    mockAuthentication();
    mockTransaction({ status: "DELIVERED" });

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/consumptions`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({
        sparePartId,
        quantity: 2,
      });

    expect(response.status).toBe(409);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rechaza repuestos inexistentes", async () => {
    mockAuthentication();
    mockTransaction({
      stockAvailable: false,
      partExists: false,
    });

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/consumptions`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({
        sparePartId,
        quantity: 2,
      });

    expect(response.status).toBe(404);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rechaza repuestos inactivos", async () => {
    mockAuthentication();
    mockTransaction({
      stockAvailable: false,
      partActive: false,
    });

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/consumptions`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({
        sparePartId,
        quantity: 2,
      });

    expect(response.status).toBe(409);
    expect(response.body.message).toContain("inactivo");
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rechaza consumos cuando el stock es insuficiente", async () => {
    mockAuthentication();
    mockTransaction({
      stockAvailable: false,
      quantityAvailable: 1,
    });

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/consumptions`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({
        sparePartId,
        quantity: 2,
      });

    expect(response.status).toBe(409);
    expect(response.body.message).toContain("Stock insuficiente");
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
  });

  it("revierte el descuento de stock si falla el movimiento", async () => {
    mockAuthentication();
    mockTransaction({ movementFails: true });

    const response = await request(app)
      .post(`/api/repair-orders/${orderId}/consumptions`)
      .set("Authorization", `Bearer ${mechanicToken}`)
      .send({
        sparePartId,
        quantity: 2,
      });

    expect(response.status).toBe(500);
    expect(transactionQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(transactionQueryMock).not.toHaveBeenCalledWith(
      "COMMIT"
    );
    expect(releaseMock).toHaveBeenCalledOnce();
  });
});

describe("Historial de consumos", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("permite al cliente consultar los movimientos de su orden", async () => {
    mockAuthentication("CLIENTE", clientId);

    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: orderId, client_id: clientId, mechanic_id: mechanicId }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          spare_part_id: sparePartId,
          spare_part_code: "REP-001",
          spare_part_name: "Cadena",
          repair_order_id: orderId,
          movement_type: "OUT",
          quantity: 1,
          notes: "Reemplazo",
          created_by: mechanicId,
          created_by_name: "Mecánico",
          created_at: new Date().toISOString(),
        }],
        rowCount: 1,
      });

    const response = await request(app)
      .get(`/api/repair-orders/${orderId}/consumptions`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].spare_part_name).toBe("Cadena");
  });

  it("rechaza al cliente que no es propietario de la orden", async () => {
    mockAuthentication("CLIENTE", clientId);

    queryMock.mockResolvedValueOnce({
      rows: [{
        id: orderId,
        client_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        mechanic_id: mechanicId,
      }],
      rowCount: 1,
    });

    const response = await request(app)
      .get(`/api/repair-orders/${orderId}/consumptions`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(response.status).toBe(403);
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("rechaza al mecánico que no tiene asignada la orden", async () => {
    mockAuthentication("MECANICO", otherMechanicId);

    queryMock.mockResolvedValueOnce({
      rows: [{ id: orderId, client_id: clientId, mechanic_id: mechanicId }],
      rowCount: 1,
    });

    const response = await request(app)
      .get(`/api/repair-orders/${orderId}/consumptions`)
      .set("Authorization", `Bearer ${otherMechanicToken}`);

    expect(response.status).toBe(403);
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("permite al administrador consultar los movimientos", async () => {
    mockAuthentication("ADMINISTRADOR", adminId);

    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: orderId, client_id: clientId, mechanic_id: mechanicId }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await request(app)
      .get(`/api/repair-orders/${orderId}/consumptions`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it("devuelve 404 si la orden no existe", async () => {
    mockAuthentication();

    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await request(app)
      .get(`/api/repair-orders/${orderId}/consumptions`)
      .set("Authorization", `Bearer ${mechanicToken}`);

    expect(response.status).toBe(404);
  });

  it("rechaza un identificador inválido", async () => {
    mockAuthentication();

    const response = await request(app)
      .get("/api/repair-orders/invalid/consumptions")
      .set("Authorization", `Bearer ${mechanicToken}`);

    expect(response.status).toBe(400);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("requiere autenticación", async () => {
    const response = await request(app)
      .get(`/api/repair-orders/${orderId}/consumptions`);

    expect(response.status).toBe(401);
  });
});