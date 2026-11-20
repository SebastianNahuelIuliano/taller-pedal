
# Taller Pedal

Sistema web para gestionar turnos, bicicletas, diagnósticos, presupuestos y reparaciones de un taller mecánico de bicicletas.

## Estado

Proyecto académico en desarrollo. Este repositorio contiene la documentación funcional y técnica inicial. Las funcionalidades se considerarán implementadas únicamente cuando exista código, pruebas aprobadas y evidencia de ejecución.

## Objetivo

Centralizar la operación del taller, permitir que los clientes reserven turnos y sigan sus reparaciones, y ofrecer al personal herramientas para organizar trabajos, presupuestos e inventario.

## Roles

- **Cliente:** administra sus bicicletas, reserva y consulta turnos, y responde presupuestos.
- **Mecánico:** consulta trabajos asignados, registra diagnósticos y actualiza reparaciones.
- **Administrador:** gestiona servicios, horarios, personal, turnos e inventario.

## Alcance del MVP

1. Registro, inicio de sesión y autorización por roles.
2. ABM de bicicletas del cliente.
3. Catálogo de servicios.
4. Horarios de atención y disponibilidad.
5. Reserva, consulta y cancelación de turnos.
6. Asignación de mecánicos.
7. Recepción y diagnóstico.
8. Presupuestos y aprobación del cliente.
9. Seguimiento de reparaciones.
10. Inventario y consumo de repuestos.
11. Historial de reparaciones.

## Stack previsto

- Frontend: React, TypeScript y Vite.
- Backend: Node.js, Express y TypeScript.
- Base de datos: PostgreSQL.
- Validación: Zod.
- Pruebas: Vitest y Supertest; pruebas de interfaz con Testing Library.
- Publicación prevista: Netlify (frontend), Render (backend) y Neon (PostgreSQL).

Las versiones concretas se fijarán en los archivos `package.json` al iniciar la implementación.

## Estructura

```text
taller-pedal/
├── AGENTS.md
├── README.md
├── .gitignore
├── MANUAL_TECNICO.md
├── MANUAL_USUARIO.md
├── docs/
│   ├── idea.md
│   ├── spec.md
│   ├── plan.md
│   ├── tasks.md
│   ├── decisions.md
│   ├── glosario.md
│   ├── preguntas_abiertas.md
│   ├── plan-pruebas.md
│   └── informe-pruebas.md
├── backend/
└── frontend/
```

## Documentación

- [Idea](docs/idea.md)
- [Especificación funcional](docs/spec.md)
- [Plan técnico](docs/plan.md)
- [Tareas](docs/tasks.md)
- [Decisiones](docs/decisions.md)
- [Glosario](docs/glosario.md)
- [Preguntas abiertas](docs/preguntas_abiertas.md)
- [Plan de pruebas](docs/plan-pruebas.md)
- [Informe de pruebas](docs/informe-pruebas.md)

## Configuración local

La configuración detallada se documentará en `MANUAL_TECNICO.md`. Los secretos se configuran mediante variables de entorno y nunca se suben al repositorio. No existe todavía una URL de producción confirmada.

## Criterio de finalización

El MVP se considerará entregado cuando los flujos incluidos estén implementados, las pruebas automatizadas estén aprobadas, el frontend y backend estén publicados, la base de datos remota funcione y el enlace público permita probar las operaciones principales.

## Autor

Sebastián Nahuel Iuliano
