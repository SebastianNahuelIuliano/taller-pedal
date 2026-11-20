
# Plan de pruebas — Taller Pedal

## 1. Objetivo

Demostrar que las reglas de negocio y flujos del MVP funcionan y que las restricciones de seguridad e integridad se cumplen.

## 2. Niveles

- **Unitarias:** servicios y funciones de dominio aisladas.
- **Integración:** endpoints, base de datos, transacciones y permisos.
- **Componentes:** formularios, tablas, mensajes y estados de interfaz.
- **E2E/manuales:** flujos principales en navegador contra entorno desplegado.

## 3. Herramientas previstas

- Vitest para unitarias.
- Supertest para API.
- Testing Library para componentes React.
- PostgreSQL de prueba separado de producción.
- Playwright opcional si el tiempo lo permite.

## 4. Datos de prueba

Crear fixtures controlados para:
- Un cliente A y un cliente B.
- Dos mecánicos activos y uno inactivo.
- Un administrador.
- Dos bicicletas de clientes distintos.
- Servicios activos e inactivos con distintas duraciones.
- Un repuesto con stock conocido.
- Turnos contiguos y turnos en conflicto.

No usar datos personales reales ni credenciales de producción en tests.

## 5. Matriz mínima por regla

| Regla | Casos mínimos |
|---|---|
| RN01 | fecha local, cambio de día y zona horaria |
| RN02 | horario de apertura, cierre y día cerrado |
| RN03 | duración positiva y snapshot histórico |
| RN04 | conflicto, intervalo contiguo y mecánico distinto |
| RN05 | bloqueo que intersecta el turno |
| RN06 | servicio activo/inactivo |
| RN07 | bicicleta propia/ajena |
| RN08 | reserva válida y datos obligatorios |
| RN09 | pasado, hoy futuro y límite de 30 días |
| RN10 | límite de tres turnos y liberación de cupo |
| RN11 | dos solicitudes simultáneas por el mismo intervalo |
| RN12 | exactamente 12 horas, menos de 12 y cancelación admin |
| RN13 | mecánico inactivo, ocupado y reasignación válida |
| RN14 | recepción única por orden |
| RN15 | diagnóstico vacío y diagnóstico válido |
| RN16 | suma de conceptos, importes negativos y total manipulado |
| RN17 | propietario, tercero y doble respuesta |
| RN18 | transiciones permitidas y prohibidas |
| RN19 | código duplicado y stock no negativo |
| RN20 | consumo válido, stock insuficiente y rollback |

## 6. Criterios de salida

- Todas las pruebas automatizadas del alcance pasan.
- Compilación TypeScript sin errores.
- Las pruebas de autorización no permiten acceso cruzado entre clientes.
- Las pruebas concurrentes no crean doble reserva ni stock negativo.
- No quedan errores críticos conocidos.
- Los resultados y comandos se registran en `informe-pruebas.md`.

## 7. Registro de defectos

Cada defecto debe incluir identificador, regla afectada, pasos para reproducir, resultado esperado, resultado real, severidad y estado.
