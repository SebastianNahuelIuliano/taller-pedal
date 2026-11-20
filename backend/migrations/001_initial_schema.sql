
-- Taller Pedal
-- Migración inicial: estructura de la base de datos.
-- No contiene contraseñas ni datos personales.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- =====================================================
-- 1. USUARIOS
-- =====================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(40),
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'CLIENTE'
        CHECK (role IN ('CLIENTE', 'MECANICO', 'ADMINISTRADOR')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- 2. BICICLETAS
-- =====================================================

CREATE TABLE bicycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id),
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    bicycle_type VARCHAR(60) NOT NULL,
    serial_number VARCHAR(120),
    observations TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bicycles_owner ON bicycles(owner_id);

-- =====================================================
-- 3. SERVICIOS
-- =====================================================

CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    description TEXT,
    reference_price NUMERIC(12,2) NOT NULL
        CHECK (reference_price >= 0),
    duration_minutes INTEGER NOT NULL
        CHECK (duration_minutes > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- 4. HORARIOS DEL TALLER
-- =====================================================

CREATE TABLE workshop_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    opens_at TIME NOT NULL,
    closes_at TIME NOT NULL,
    is_closed BOOLEAN NOT NULL DEFAULT FALSE,
    CHECK (is_closed OR closes_at > opens_at),
    UNIQUE (day_of_week)
);

-- Horario inicial: lunes a sábado de 09:00 a 18:00.
-- PostgreSQL: domingo = 0, lunes = 1, sábado = 6.

INSERT INTO workshop_hours (day_of_week, opens_at, closes_at, is_closed)
VALUES
    (0, '09:00', '18:00', TRUE),
    (1, '09:00', '18:00', FALSE),
    (2, '09:00', '18:00', FALSE),
    (3, '09:00', '18:00', FALSE),
    (4, '09:00', '18:00', FALSE),
    (5, '09:00', '18:00', FALSE),
    (6, '09:00', '18:00', FALSE);

-- =====================================================
-- 5. BLOQUEOS DE AGENDA DE MECÁNICOS
-- =====================================================

CREATE TABLE mechanic_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mechanic_id UUID NOT NULL REFERENCES users(id),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    reason TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at > starts_at)
);

CREATE INDEX idx_mechanic_blocks_mechanic_dates
ON mechanic_blocks(mechanic_id, starts_at, ends_at);

-- =====================================================
-- 6. TURNOS
-- =====================================================

CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES users(id),
    bicycle_id UUID NOT NULL REFERENCES bicycles(id),
    service_id UUID NOT NULL REFERENCES services(id),
    mechanic_id UUID NOT NULL REFERENCES users(id),

    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,

    -- Snapshot del servicio al momento de reservar.
    service_name_snapshot VARCHAR(150) NOT NULL,
    duration_minutes_snapshot INTEGER NOT NULL
        CHECK (duration_minutes_snapshot > 0),
    price_snapshot NUMERIC(12,2) NOT NULL
        CHECK (price_snapshot >= 0),

    status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED'
        CHECK (status IN ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW')),

    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES users(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (ends_at > starts_at),
    CHECK (ends_at = starts_at + make_interval(mins => duration_minutes_snapshot))
);

CREATE INDEX idx_appointments_client
ON appointments(client_id, starts_at);

CREATE INDEX idx_appointments_mechanic
ON appointments(mechanic_id, starts_at, ends_at);

-- RN04 y RN11: impide superposición de turnos confirmados
-- para el mismo mecánico. Los intervalos contiguos son válidos.
ALTER TABLE appointments
ADD CONSTRAINT appointments_no_mechanic_overlap
EXCLUDE USING GIST (
    mechanic_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
)
WHERE (status = 'CONFIRMED');

-- =====================================================
-- 7. ÓRDENES DE REPARACIÓN Y RECEPCIÓN
-- =====================================================

CREATE TABLE repair_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL UNIQUE REFERENCES appointments(id),
    received_at TIMESTAMPTZ,
    received_by UUID REFERENCES users(id),
    visible_condition TEXT,
    accessories_received TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'RECEIVED'
        CHECK (status IN (
            'RECEIVED',
            'DIAGNOSIS',
            'WAITING_APPROVAL',
            'APPROVED',
            'IN_PROGRESS',
            'WAITING_PARTS',
            'READY',
            'DELIVERED',
            'CANCELLED'
        )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_repair_orders_status ON repair_orders(status);

-- =====================================================
-- 8. DIAGNÓSTICOS
-- =====================================================

CREATE TABLE diagnoses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repair_order_id UUID NOT NULL REFERENCES repair_orders(id),
    mechanic_id UUID NOT NULL REFERENCES users(id),
    description TEXT NOT NULL CHECK (LENGTH(TRIM(description)) > 0),
    recommended_tasks TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_diagnoses_order
ON diagnoses(repair_order_id, created_at);

-- =====================================================
-- 9. PRESUPUESTOS
-- =====================================================

CREATE TABLE estimates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repair_order_id UUID NOT NULL REFERENCES repair_orders(id),
    version INTEGER NOT NULL CHECK (version > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    total NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (total >= 0),
    sent_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    responded_by UUID REFERENCES users(id),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (repair_order_id, version)
);

CREATE TABLE estimate_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estimate_id UUID NOT NULL REFERENCES estimates(id),
    description VARCHAR(255) NOT NULL,
    quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0)
);

CREATE INDEX idx_estimates_order
ON estimates(repair_order_id, version);

-- =====================================================
-- 10. REPUESTOS E INVENTARIO
-- =====================================================

CREATE TABLE spare_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(80) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    reference_price NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (reference_price >= 0),
    quantity_available INTEGER NOT NULL DEFAULT 0
        CHECK (quantity_available >= 0),
    minimum_stock INTEGER NOT NULL DEFAULT 0
        CHECK (minimum_stock >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- 11. MOVIMIENTOS DE STOCK
-- =====================================================

CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spare_part_id UUID NOT NULL REFERENCES spare_parts(id),
    repair_order_id UUID REFERENCES repair_orders(id),
    movement_type VARCHAR(20) NOT NULL
        CHECK (movement_type IN ('IN', 'OUT', 'ADJUSTMENT')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stock_movements_part
ON stock_movements(spare_part_id, created_at);

-- =====================================================
-- 12. HISTORIAL DE ESTADOS DE REPARACIÓN
-- =====================================================

CREATE TABLE repair_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repair_order_id UUID NOT NULL REFERENCES repair_orders(id),
    previous_status VARCHAR(30),
    new_status VARCHAR(30) NOT NULL,
    changed_by UUID NOT NULL REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_repair_history_order
ON repair_status_history(repair_order_id, created_at);

-- =====================================================
-- 13. AUDITORÍA
-- =====================================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_entity
ON audit_logs(entity_type, entity_id, created_at);
