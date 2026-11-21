
# Plan de tareas â€” Taller Pedal

**Regla:** una tarea se marca DONE solamente cuando cumple sus criterios, pruebas y commit. No marcar tareas futuras como hechas anticipadamente.

Estados: `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`.

| ID | Tarea | Dependencias | Criterio de finalizaciÃ³n | Estado |
|---|---|---|---|---|
| T01 | Crear repositorio y estructura inicial | â€” | Repo pÃºblico, carpetas y archivos base | DONE* |
| T02 | Completar documentaciÃ³n funcional | T01 | spec con RN, HU, EC y trazabilidad revisada | DONDE |
| T03 | Definir arquitectura y modelo de datos | T02 | plan y entidades coherentes con spec | TODO |
| T04 | Completar decisiones y glosario | T02 | decisiones y tÃ©rminos documentados | DONE |
| T05 | Definir plan de pruebas | T02,T03 | matriz de pruebas por RN | DONE |
| T06 | Inicializar backend TypeScript | T03 | scripts dev/build/test y compilaciÃ³n | DONE |
| T07 | Configurar PostgreSQL y migraciones | T06 | migraciÃ³n inicial aplicada en DB de prueba | DONE |
| T08 | Implementar autenticaciÃ³n | T07 | registro/login/logout y pruebas | DONE |
| T09 | Implementar autorizaciÃ³n | T08 | roles y propiedad probados en API | DONE |
| T10 | Implementar servicios | T07,T09 | CRUD admin y catÃ¡logo pÃºblico | DONE |
| T11 | Implementar bicicletas | T09 | ABM propio del cliente y pruebas | DONE |
| T12 | Implementar horarios y bloqueos | T10 | configuraciÃ³n y validaciÃ³n horaria | DONE |
| T13 | Implementar disponibilidad | T11,T12 | intervalos correctos y pruebas | DONE |
| T14 | Implementar reserva transaccional | T13 | no hay doble reserva bajo concurrencia | DONE |
| T15 | Implementar cancelaciÃ³n | T14 | regla 12 horas y liberaciÃ³n de agenda | DONE |
| T16 | Implementar asignaciÃ³n/reasignaciÃ³n | T14 | no se permiten conflictos | DONE |
| T17 | Implementar recepciÃ³n y Ã³rdenes | T14 | orden vinculada al turno | DONE |
| T18 | Implementar diagnÃ³stico | T17 | diagnÃ³stico y permisos probados | DONE |
| T19 | Implementar presupuestos | T18 | conceptos y total calculado en servidor | DONE |
| T20 | Implementar aprobaciÃ³n/rechazo | T19 | propietario responde una sola vez | DONE |
| T21 | Implementar estados de reparaciÃ³n | T20 | transiciones e historial probados | DONE |
| T22 | Implementar catÃ¡logo de repuestos | T07,T09 | ABM y cÃ³digo Ãºnico | DONE |
| T23 | Implementar consumo de repuestos | T21,T22 | stock y movimiento atÃ³micos | DONDE |
| T24 | Implementar historial | T17,T21,T23 | cliente ve solo sus registros | DONE |
| T25 | Inicializar frontend React | T03 | Vite, TS y estructura compilan | DONE |
| T26 | Implementar autenticaciÃ³n UI | T08,T25 | registro/login/logout integrados | TODO |
| T27 | Implementar pantallas cliente | T11,T13,T14 | bicicletas, catÃ¡logo, reserva, turnos | TODO |
| T28 | Implementar pantallas mecÃ¡nico | T17,T18,T21 | agenda, diagnÃ³stico y estados | TODO |
| T29 | Implementar panel administrador | T10,T12,T16,T22 | servicios, agenda, mecÃ¡nicos e inventario | TODO |
| T30 | IntegraciÃ³n frontend-backend | T26-T29 | flujos completos en entorno integrado | TODO |
| T31 | Pruebas E2E y regresiÃ³n | T30 | escenarios crÃ­ticos aprobados | TODO |
| T32 | Desplegar DB, API y frontend | T31 | URL pÃºblica y smoke tests exitosos | TODO |
| T33 | Completar manuales e informe | T31,T32 | documentaciÃ³n refleja evidencia real | TODO |
* T01 se considera completada segÃºn el trabajo realizado hasta ahora: repositorio creado, estructura y documentaciÃ³n inicial subidas. Si el docente exige evidencias mÃ¡s precisas, conservar el commit correspondiente.

## Protocolo por tarea

1. Leer RN/HU asociadas.
2. Implementar una unidad pequeÃ±a.
3. Agregar pruebas.
4. Ejecutar pruebas y build.
5. Revisar cambios y secretos.
6. Actualizar esta tabla.
7. Crear un commit propio de la tarea.

## Registro de commits

Completar a medida que se realicen:

| Tarea | Hash | Mensaje | VerificaciÃ³n |
|---|---|---|---|
| T01 | Completar con `git log` | `docs: agregar documentaciÃ³n inicial del proyecto` | Commit local y publicaciÃ³n en GitHub |
