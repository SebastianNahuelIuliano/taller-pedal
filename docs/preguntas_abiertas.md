
# Preguntas abiertas y riesgos — Taller Pedal

Las preguntas se resuelven antes de implementar el módulo afectado. Las decisiones aceptadas se trasladan a `decisions.md` y `spec.md`.

| ID | Pregunta / riesgo | Impacto | Estado |
|---|---|---|---|
| PA01 | ¿El taller mantendrá lunes a sábado 09:00–18:00 o necesitará horarios distintos por día? | Agenda | Propuesta inicial definida en RN02; validar con docente/consigna. |
| PA02 | ¿Se habilitará más de un mecánico por turno para servicios complejos? | Modelo y agenda | Fuera del MVP; un mecánico por turno. |
| PA03 | ¿Se requiere confirmación manual del administrador antes de confirmar reservas? | Flujo de reserva | MVP confirma automáticamente al encontrar mecánico libre. |
| PA04 | ¿Qué política se aplica a inasistencias? | Turnos | No se automatiza penalidad en MVP; personal registra NO_SHOW. |
| PA05 | ¿Se enviarán correos reales? | Notificaciones | Opcional; MVP debe funcionar sin proveedor de email. |
| PA06 | ¿Se necesita registrar pagos parciales o señas? | Presupuestos | Fuera del MVP; no hay pasarela ni módulo de pagos. |
| PA07 | ¿Se necesita registrar múltiples fotos por bicicleta/orden? | Almacenamiento | Fuera del MVP salvo tiempo disponible. |
| PA08 | ¿El precio final incluye impuestos? | Presupuestos | No se calcula fiscalmente; aclarar que es importe informativo. |
| PA09 | ¿Se permitirá que un mecánico gestione su propia disponibilidad? | Agenda | Inicialmente solo administrador configura agenda y bloqueos. |
| PA10 | ¿Se requiere más de una sucursal? | Arquitectura | Fuera del MVP; una sede. |

## Riesgos técnicos

- Concurrencia en reservas: mitigar con transacciones y restricción/bloqueo en PostgreSQL.
- Zona horaria: usar una política única y probar límites de fecha.
- Filtración de datos entre clientes: pruebas de autorización por propiedad.
- Stock negativo: transacción y bloqueo de fila en consumo.
- Falta de tiempo de despliegue: desplegar un esqueleto funcional temprano y probar conectividad.
