
# Plan técnico — Taller Pedal

## 1. Objetivo

Definir una arquitectura simple, comprobable y mantenible para implementar las reglas de `spec.md`.

## 2. Arquitectura

Aplicación web cliente-servidor:

- React + TypeScript + Vite: interfaz.
- API REST Node.js + Express + TypeScript: autenticación, autorización y reglas.
- PostgreSQL: persistencia.
- HTTPS entre frontend y API.
- Frontend y backend desplegados por separado.

Flujo: navegador → API HTTP → middleware → ruta/controlador → servicio de dominio → repositorio → PostgreSQL.

## 3. Estructura prevista

```text
backend/
  src/
    config/
    domain/
      entities/
      enums/
    middleware/
    routes/
    controllers/
    services/
    repositories/
    app.ts
    server.ts
  migrations/
  tests/
frontend/
  src/
    api/
    components/
    hooks/
    layouts/
    pages/
    styles/
```

## 4. Responsabilidades

- **Routes:** declaran endpoints y middleware.
- **Controllers:** reciben request, llaman servicios y responden HTTP.
- **Services:** implementan RN y coordinan transacciones.
- **Repositories:** consultas SQL parametrizadas.
- **Domain:** tipos, estados y reglas puras.
- **Frontend API:** centraliza llamadas HTTP y manejo de sesión.
- **Pages/components:** pantallas y componentes visuales.

No se implementa lógica crítica exclusivamente en el frontend.

## 5. Modelo de datos inicial

| Tabla | Propósito | Relaciones principales |
|---|---|---|
| users | cuentas, email, password_hash, role, active | 1:N con bicycles; 1:N con appointments como cliente |
| bicycles | bicicletas de clientes | N:1 users |
| services | catálogo y duración/precio | 1:N appointments |
| workshop_hours | horarios por día | configuración |
| mechanic_blocks | bloqueos de agenda | N:1 users (mecánico) |
| appointments | reserva, intervalo, estado, snapshots | N:1 cliente, bicicleta, servicio y mecánico |
| repair_orders | recepción y estado de reparación | 1:1 appointment |
| diagnoses | diagnóstico y autor | N:1 repair_orders |
| estimates | versión, estado, total y respuesta | N:1 repair_orders |
| estimate_items | conceptos del presupuesto | N:1 estimates |
| spare_parts | catálogo e inventario | 1:N stock_movements |
| stock_movements | entradas/consumos y referencia | N:1 spare_parts; opcional repair_order |
| repair_status_history | auditoría de estados | N:1 repair_orders |
| audit_logs | acciones administrativas | referencia a actor y entidad |

### Restricciones importantes

- `users.email` único.
- `spare_parts.code` único.
- `appointments` debe tener `starts_at < ends_at`.
- Índices para agenda por mecánico y rango temporal.
- Claves foráneas para preservar relaciones.
- Las operaciones de reserva y consumo de stock usan transacciones.
- La prevención de solapamientos se implementa con una estrategia PostgreSQL atómica: restricción de exclusión por rango si la configuración lo permite, o bloqueo transaccional por mecánico antes de comprobar e insertar. La elección se registra al implementar.

## 6. API REST prevista

Prefijo: `/api`.

### Autenticación

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

### Clientes y bicicletas

- `GET /bicycles`
- `POST /bicycles`
- `PATCH /bicycles/:id`
- `DELETE /bicycles/:id` (solo si no rompe historial; de lo contrario desactivar)

### Servicios y agenda

- `GET /services`
- `POST /services` (admin)
- `PATCH /services/:id` (admin)
- `GET /availability?date=YYYY-MM-DD&serviceId=...`
- `GET /appointments`
- `POST /appointments`
- `POST /appointments/:id/cancel`
- `PATCH /appointments/:id/assign` (admin)

### Reparaciones

- `POST /appointments/:id/receive`
- `POST /repair-orders/:id/diagnoses`
- `POST /repair-orders/:id/estimates`
- `POST /estimates/:id/respond`
- `PATCH /repair-orders/:id/status`
- `GET /repair-orders/:id`
- `GET /bicycles/:id/history`

### Inventario

- `GET /spare-parts`
- `POST /spare-parts` (admin)
- `PATCH /spare-parts/:id` (admin)
- `POST /repair-orders/:id/consumptions`

Los contratos definitivos incluyen esquemas de request/response, códigos de error y paginación al implementar cada módulo.

## 7. Seguridad

- Password hashing con bcrypt o Argon2id; parámetros configurados y documentados.
- Sesión mediante cookie HttpOnly/Secure/SameSite en producción o estrategia equivalente documentada.
- Validación de entrada con Zod.
- Autorización por rol y propiedad del recurso.
- CORS limitado al origen frontend.
- Rate limit en login/registro.
- Helmet y HTTPS en producción.
- Variables de entorno fuera del repositorio.
- No exponer stack traces ni secretos al cliente.

## 8. Pruebas

- Unitarias para servicios y reglas puras.
- Integración para API y PostgreSQL.
- Pruebas de autorización y propiedad.
- Pruebas de concurrencia para reserva e inventario.
- Pruebas de componentes y flujos críticos del frontend.
- Ver detalles en `plan-pruebas.md`.

## 9. Variables de entorno previstas

Backend:

- `DATABASE_URL`
- `JWT_SECRET` o secretos de sesión según implementación
- `FRONTEND_URL`
- `NODE_ENV`
- `PORT`

Frontend:

- `VITE_API_URL`

Los valores reales se guardan localmente en `.env` y en los paneles de despliegue. `.env.example` contiene nombres y valores ficticios únicamente.

## 10. Despliegue

- Neon: PostgreSQL administrado.
- Render: API Node.js.
- Netlify: frontend estático.
- Configurar CORS con el dominio real de Netlify.
- Configurar `VITE_API_URL` con la URL real del backend.
- Ejecutar migraciones antes de habilitar tráfico.
- No declarar deploy completo hasta probar registro, login y una reserva real.

## 11. Orden de implementación

1. Fundaciones y configuración.
2. Base de datos y autenticación.
3. Bicicletas y servicios.
4. Agenda, disponibilidad y reservas.
5. Cancelación y asignación.
6. Órdenes, diagnóstico y presupuestos.
7. Reparación e inventario.
8. Frontend completo.
9. Pruebas integrales y despliegue.
