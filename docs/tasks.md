
# Plan de tareas — Taller Pedal

**Regla:** una tarea se marca DONE solamente cuando cumple sus criterios, pruebas y commit. No marcar tareas futuras como hechas anticipadamente.

Estados: `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`.

| ID | Tarea | Dependencias | Criterio de finalización | Estado |
|---|---|---|---|---|
| T01 | Crear repositorio y estructura inicial | — | Repo público, carpetas y archivos base | DONE* |
| T02 | Completar documentación funcional | T01 | spec con RN, HU, EC y trazabilidad revisada | IN_PROGRESS |
| T03 | Definir arquitectura y modelo de datos | T02 | plan y entidades coherentes con spec | TODO |
| T04 | Completar decisiones y glosario | T02 | decisiones y términos documentados | DONE |
| T05 | Definir plan de pruebas | T02,T03 | matriz de pruebas por RN | DONE |
| T06 | Inicializar backend TypeScript | T03 | scripts dev/build/test y compilación | DONE |
| T07 | Configurar PostgreSQL y migraciones | T06 | migración inicial aplicada en DB de prueba | DONE |
| T08 | Implementar autenticación | T07 | registro/login/logout y pruebas | DONE |
| T09 | Implementar autorización | T08 | roles y propiedad probados en API | DONE |
| T10 | Implementar servicios | T07,T09 | CRUD admin y catálogo público | DONE |
| T11 | Implementar bicicletas | T09 | ABM propio del cliente y pruebas | DONE |
| T12 | Implementar horarios y bloqueos | T10 | configuración y validación horaria | DONE |
| T13 | Implementar disponibilidad | T11,T12 | intervalos correctos y pruebas | DONE |
| T14 | Implementar reserva transaccional | T13 | no hay doble reserva bajo concurrencia | DONE |
| T15 | Implementar cancelación | T14 | regla 12 horas y liberación de agenda | DONE |
| T16 | Implementar asignación/reasignación | T14 | no se permiten conflictos | DONE |
| T17 | Implementar recepción y órdenes | T14 | orden vinculada al turno | DONE |
| T18 | Implementar diagnóstico | T17 | diagnóstico y permisos probados | DONE |
| T19 | Implementar presupuestos | T18 | conceptos y total calculado en servidor | TODO |
| T20 | Implementar aprobación/rechazo | T19 | propietario responde una sola vez | TODO |
| T21 | Implementar estados de reparación | T20 | transiciones e historial probados | TODO |
| T22 | Implementar catálogo de repuestos | T07,T09 | ABM y código único | TODO |
| T23 | Implementar consumo de repuestos | T21,T22 | stock y movimiento atómicos | TODO |
| T24 | Implementar historial | T17,T21,T23 | cliente ve solo sus registros | TODO |
| T25 | Inicializar frontend React | T03 | Vite, TS y estructura compilan | TODO |
| T26 | Implementar autenticación UI | T08,T25 | registro/login/logout integrados | TODO |
| T27 | Implementar pantallas cliente | T11,T13,T14 | bicicletas, catálogo, reserva, turnos | TODO |
| T28 | Implementar pantallas mecánico | T17,T18,T21 | agenda, diagnóstico y estados | TODO |
| T29 | Implementar panel administrador | T10,T12,T16,T22 | servicios, agenda, mecánicos e inventario | TODO |
| T30 | Integración frontend-backend | T26-T29 | flujos completos en entorno integrado | TODO |
| T31 | Pruebas E2E y regresión | T30 | escenarios críticos aprobados | TODO |
| T32 | Desplegar DB, API y frontend | T31 | URL pública y smoke tests exitosos | TODO |
| T33 | Completar manuales e informe | T31,T32 | documentación refleja evidencia real | TODO |
* T01 se considera completada según el trabajo realizado hasta ahora: repositorio creado, estructura y documentación inicial subidas. Si el docente exige evidencias más precisas, conservar el commit correspondiente.

## Protocolo por tarea

1. Leer RN/HU asociadas.
2. Implementar una unidad pequeña.
3. Agregar pruebas.
4. Ejecutar pruebas y build.
5. Revisar cambios y secretos.
6. Actualizar esta tabla.
7. Crear un commit propio de la tarea.

## Registro de commits

Completar a medida que se realicen:

| Tarea | Hash | Mensaje | Verificación |
|---|---|---|---|
| T01 | Completar con `git log` | `docs: agregar documentación inicial del proyecto` | Commit local y publicación en GitHub |
