
# Decisiones del proyecto — Taller Pedal

Las decisiones se identifican como D01, D02, etc. Si una decisión cambia, registrar fecha, motivo e impacto.

## D01 — Proyecto de taller de bicicletas

**Decisión:** desarrollar Taller Pedal, no ReservaClub.

**Motivo:** cumplir la consigna con un dominio propio y reglas operativas verificables.

## D02 — Aplicación web cliente-servidor

**Decisión:** React para frontend, Express para API y PostgreSQL para persistencia.

**Motivo:** separar interfaz, reglas y datos; facilita pruebas y despliegue independiente.

## D03 — Tres roles

**Decisión:** Cliente, Mecánico y Administrador.

**Motivo:** representan los actores principales del proceso real.

## D04 — El backend es autoridad de negocio

**Decisión:** toda regla crítica se valida en backend.

**Motivo:** evitar que un usuario pueda eludir reglas manipulando el navegador.

## D05 — Cancelación con 12 horas

**Decisión:** cliente puede cancelar con al menos 12 horas; dentro de ese plazo debe intervenir administrador.

**Motivo:** dar previsibilidad al taller y permitir reasignar el espacio.

## D06 — Límite de tres turnos futuros activos

**Decisión:** un cliente puede mantener hasta tres turnos futuros activos.

**Motivo:** evitar acaparamiento de agenda sin impedir el uso normal.

## D07 — Asignación de mecánico obligatoria

**Decisión:** un turno solo se confirma cuando hay mecánico disponible.

**Motivo:** evitar reservas que el taller no puede atender.

## D08 — Duración y precio históricos

**Decisión:** guardar snapshots de duración y precio de referencia en la reserva.

**Motivo:** cambios posteriores del catálogo no deben alterar compromisos existentes.

## D09 — Presupuesto aprobado antes de reparar

**Decisión:** el trabajo presupuestado no comienza sin aceptación del cliente.

**Motivo:** transparencia y autorización explícita.

## D10 — Historial en lugar de borrado destructivo

**Decisión:** servicios, usuarios y repuestos relacionados con operaciones históricas se desactivan en lugar de eliminarse físicamente.

**Motivo:** conservar trazabilidad.

## D11 — Operaciones críticas transaccionales

**Decisión:** reservas y consumos de inventario usan transacciones y protección ante concurrencia.

**Motivo:** evitar doble asignación y stock negativo.

## D12 — Sin pagos online en MVP

**Decisión:** no integrar pasarela de pagos en la primera versión.

**Motivo:** mantener el alcance realizable; los importes son informativos y se registran como presupuesto.
