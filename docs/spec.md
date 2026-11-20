
# Especificación funcional — Taller Pedal

**Versión:** 1.0  
**Estado:** Base funcional para implementación; revisar preguntas abiertas antes de cerrar el alcance.  
**Zona horaria del negocio:** `America/Argentina/Buenos_Aires`.

## 1. Propósito

Definir el comportamiento verificable del sistema de gestión de turnos y reparaciones de Taller Pedal. Este documento es el contrato funcional para frontend, backend, base de datos y pruebas.

## 2. Roles

| Rol | Permisos principales |
|---|---|
| Invitado | Ver información pública y catálogo de servicios activos. |
| Cliente | Administrar sus bicicletas, reservar/cancelar según reglas, consultar sus turnos, órdenes y presupuestos, responder presupuestos. |
| Mecánico | Ver agenda y órdenes asignadas; registrar recepción, diagnóstico, trabajo, consumos y estados permitidos. |
| Administrador | Gestionar usuarios, servicios, horarios, mecánicos, bloqueos, turnos, inventario y supervisar órdenes. |

El backend valida rol y propiedad de cada recurso. Ocultar botones en el frontend no constituye autorización.

## 3. Alcance del MVP

### Incluido

- Registro, login, logout y sesión.
- Roles cliente, mecánico y administrador.
- Gestión de bicicletas.
- Catálogo de servicios.
- Horarios y bloqueos.
- Disponibilidad y reserva de turnos.
- Cancelación y asignación de mecánicos.
- Recepción, diagnóstico, presupuesto y aprobación.
- Flujo de reparación y entrega.
- Inventario y consumo de repuestos.
- Historial por bicicleta/orden.
- Auditoría básica de acciones administrativas.
- Pruebas unitarias y de integración.

### Excluido

- Cobro/pago online.
- Facturación fiscal.
- Aplicación móvil nativa.
- Multi-sucursal.
- Mensajería WhatsApp/SMS.
- Integración con proveedores de repuestos.
- Notificaciones push. En MVP se muestran avisos dentro de la aplicación y/o correo si el proveedor queda configurado.

## 4. Reglas de negocio

### RN01 — Zona horaria

El taller opera en `America/Argentina/Buenos_Aires`. Las reglas de fechas, horarios y anticipación se calculan en esa zona; los instantes se almacenan de forma consistente.

**Verificación:** Una reserva en el límite de medianoche se interpreta según la fecha local del taller.

### RN02 — Horario de atención

El horario inicial del taller es de lunes a sábado de 09:00 a 18:00. El administrador puede modificarlo. Los domingos se consideran cerrados hasta que se configure lo contrario.

**Verificación:** No se ofrecen turnos fuera del horario configurado ni en días cerrados.

### RN03 — Duración de servicio

Cada servicio activo tiene una duración estimada positiva en minutos. La duración se fija al crear el turno como snapshot para que cambios futuros del catálogo no alteren reservas existentes.

**Verificación:** El intervalo reservado abarca desde el inicio hasta el inicio más la duración guardada.

### RN04 — Capacidad de mecánico

Un mecánico no puede tener dos turnos confirmados o trabajos programados cuyos intervalos se superpongan.

**Verificación:** Los intervalos contiguos, donde uno termina exactamente cuando el otro comienza, sí son válidos.

### RN05 — Bloqueos de agenda

El administrador puede crear bloqueos de agenda por mecánico y rango temporal, por vacaciones, pausas o mantenimiento de herramientas/puesto. Un bloqueo impide nuevas asignaciones en ese intervalo.

**Verificación:** No se asigna ni reserva con ese mecánico dentro del intervalo bloqueado.

### RN06 — Servicios

Cada servicio tiene nombre, descripción, precio de referencia, duración y estado activo/inactivo. Solo servicios activos se ofrecen para nuevas reservas.

**Verificación:** Desactivar un servicio no borra los turnos históricos.

### RN07 — Clientes y bicicletas

Un cliente puede registrar varias bicicletas. Cada bicicleta pertenece a un único cliente y contiene marca, modelo y tipo; número de serie y observaciones son opcionales.

**Verificación:** Un cliente no puede consultar ni modificar bicicletas ajenas.

### RN08 — Reserva

Un cliente autenticado reserva una bicicleta propia, un servicio activo, fecha y hora disponibles. La reserva queda asociada al cliente, bicicleta, servicio y duración/precio vigentes al momento de crearla.

**Verificación:** La reserva debe validarse nuevamente en backend al confirmar.

### RN09 — Anticipación

No se permiten reservas en el pasado. La anticipación máxima inicial es de 30 días calendario desde la fecha local actual.

**Verificación:** El día actual es reservable si existe un horario futuro disponible.

### RN10 — Confirmación y cupo

La reserva se confirma solo si existe un mecánico elegible y el intervalo está libre. La creación y asignación se realizan atómicamente. Un cliente puede tener hasta 3 turnos futuros activos simultáneamente.

**Verificación:** Una cuarta reserva activa se rechaza; cancelar una reserva libera el cupo.

### RN11 — Concurrencia

Dos solicitudes simultáneas no pueden obtener el mismo intervalo del mismo mecánico. La comprobación y escritura deben protegerse mediante transacción y restricción/estrategia de bloqueo adecuada.

**Verificación:** En una carrera por el último horario, como máximo una solicitud termina confirmada.

### RN12 — Cancelación

El cliente puede cancelar su propio turno con al menos 12 horas antes del inicio. Dentro de las 12 horas, solo el administrador puede cancelarlo. Toda cancelación registra fecha, actor y motivo si corresponde.

**Verificación:** Un turno ya cancelado, completado o en reparación no puede cancelarse como si estuviera pendiente.

### RN13 — Asignación

El sistema asigna un mecánico activo con horario disponible. El administrador puede reasignar un turno, siempre que el nuevo mecánico esté disponible. La reasignación conserva auditoría básica.

**Verificación:** No se permite asignar mecánicos inactivos ni generar solapamientos.

### RN14 — Recepción

Al recibir la bicicleta, el personal registra fecha/hora, estado visible y accesorios entregados. La recepción está vinculada a un turno y genera una orden de reparación.

**Verificación:** Una misma orden no puede tener dos recepciones iniciales.

### RN15 — Diagnóstico

El mecánico asignado o administrador registra un diagnóstico no vacío y las tareas recomendadas, con autor y fecha/hora.

**Verificación:** El cliente solo consulta diagnósticos de sus propias órdenes.

### RN16 — Presupuesto

El presupuesto contiene uno o más conceptos con descripción, cantidad, precio unitario y subtotal. El total se calcula en backend. Los importes no pueden ser negativos. Se conserva la versión enviada al cliente.

**Verificación:** El total es la suma de subtotales y no puede ser enviado como valor confiable desde el navegador.

### RN17 — Aprobación

Solo el cliente propietario puede aprobar o rechazar el presupuesto pendiente. La respuesta registra fecha/hora. Un presupuesto respondido no se modifica; los cambios requieren una nueva versión.

**Verificación:** No se inicia el trabajo presupuestado sin aprobación registrada.

### RN18 — Estados de reparación

La orden usa estados RECEIVED, DIAGNOSIS, WAITING_APPROVAL, APPROVED, IN_PROGRESS, WAITING_PARTS, READY, DELIVERED y CANCELLED. Solo se permiten transiciones definidas en la especificación.

**Verificación:** No se entrega una bicicleta que no esté READY; una orden DELIVERED o CANCELLED es terminal.

### RN19 — Inventario

Cada repuesto tiene código único, nombre, precio de referencia, cantidad disponible y stock mínimo. La cantidad nunca puede ser negativa. Solo repuestos activos pueden consumirse.

**Verificación:** El código duplicado y las cantidades negativas se rechazan.

### RN20 — Consumo e historial

El consumo de repuestos se registra dentro de una transacción que descuenta stock y crea el movimiento asociado a la orden. Se conserva historial de turnos, diagnósticos, presupuestos, estados y consumos.

**Verificación:** Si falla el registro del movimiento, el stock no debe quedar descontado parcialmente.

## 5. Estados y transiciones

### 5.1 Turnos

Estados: `CONFIRMED`, `CANCELLED`, `COMPLETED`, `NO_SHOW`.

Transiciones:

- `CONFIRMED` → `CANCELLED` por cliente si cumple RN12 o por administrador.
- `CONFIRMED` → `COMPLETED` por administrador/mecánico autorizado al concluir atención.
- `CONFIRMED` → `NO_SHOW` por personal autorizado al registrar inasistencia.
- `CANCELLED`, `COMPLETED` y `NO_SHOW` son estados terminales en el MVP.

### 5.2 Órdenes de reparación

| Estado actual | Próximos estados permitidos |
|---|---|
| RECEIVED | DIAGNOSIS, CANCELLED |
| DIAGNOSIS | WAITING_APPROVAL, CANCELLED |
| WAITING_APPROVAL | APPROVED, CANCELLED |
| APPROVED | IN_PROGRESS, CANCELLED |
| IN_PROGRESS | WAITING_PARTS, READY |
| WAITING_PARTS | IN_PROGRESS |
| READY | DELIVERED |
| DELIVERED | Ninguno |
| CANCELLED | Ninguno |

El cambio de estado registra actor, fecha/hora y comentario opcional. El rol autorizado depende de la operación: el mecánico asignado puede actualizar estados operativos; el administrador puede supervisar y corregir con registro de auditoría.

## 6. Historias de usuario y criterios de aceptación

Los criterios usan formato Dado/Cuando/Entonces. Las pruebas automatizadas deberán usar identificadores HU y RN.

### HU01 — Registro de cliente

**Como** visitante, **quiero** crear una cuenta, **para** solicitar turnos.

- Dado un correo no registrado y datos válidos, cuando envío el registro, entonces se crea una cuenta con rol CLIENTE.
- Dado un correo ya registrado, cuando intento registrarme, entonces recibo un error de validación.
- Dada una solicitud que intenta asignar rol ADMIN, cuando se procesa el registro público, entonces el rol enviado se ignora y se asigna CLIENTE.

### HU02 — Inicio de sesión

**Como** usuario registrado, **quiero** iniciar sesión, **para** acceder a mis funciones.

- Dadas credenciales correctas, cuando inicio sesión, entonces recibo una sesión válida.
- Dada una contraseña incorrecta, cuando intento ingresar, entonces el acceso se rechaza sin revelar cuál dato fue incorrecto.

### HU03 — Administrar mis bicicletas

**Como** cliente, **quiero** registrar mis bicicletas, **para** reservar servicios para ellas.

- Dado un cliente autenticado, cuando registra marca, modelo y tipo válidos, entonces la bicicleta queda asociada a su cuenta.
- Dada una bicicleta de otro cliente, cuando intento consultarla o modificarla, entonces el backend responde acceso denegado/no encontrado según política.

### HU04 — Consultar servicios

**Como** visitante o cliente, **quiero** ver los servicios activos, **para** conocer las opciones del taller.

- Dado un servicio inactivo, cuando consulto el catálogo público, entonces no aparece como reservable.
- Dado un turno histórico de un servicio luego desactivado, cuando consulto el turno, entonces se conserva el snapshot del servicio.

### HU05 — Consultar disponibilidad

**Como** cliente, **quiero** consultar horarios libres, **para** elegir un turno.

- Dada una fecha dentro del horizonte permitido, cuando consulto disponibilidad, entonces solo aparecen intervalos dentro del horario y sin conflictos.
- Dado un bloqueo o mecánico no disponible, cuando consulto horarios, entonces ese intervalo no se ofrece para ese mecánico.

### HU06 — Reservar un turno

**Como** cliente, **quiero** reservar un servicio para una bicicleta, **para** llevarla al taller.

- Dada una bicicleta propia, servicio activo y horario disponible, cuando confirmo, entonces se crea un turno confirmado con precio/duración snapshot.
- Dado un horario ocupado, cuando intento reservarlo, entonces la operación se rechaza sin crear un turno parcial.
- Dada una cuarta reserva futura activa, cuando intento reservar, entonces se rechaza por límite de cupo.

### HU07 — Cancelar turno

**Como** cliente, **quiero** cancelar un turno propio con anticipación suficiente, **para** liberar el horario.

- Dado un turno propio con al menos 12 horas, cuando lo cancelo, entonces pasa a CANCELLED y libera disponibilidad.
- Dado un turno con menos de 12 horas, cuando el cliente intenta cancelarlo, entonces se rechaza.
- Dado un turno de cualquier anticipación, cuando el administrador lo cancela, entonces se registra actor y motivo.

### HU08 — Asignar mecánico

**Como** administrador, **quiero** asignar o reasignar mecánicos, **para** organizar el trabajo.

- Dado un mecánico activo y libre durante todo el intervalo, cuando asigno el turno, entonces queda asignado.
- Dado un mecánico con conflicto, cuando intento asignarlo, entonces la operación se rechaza.

### HU09 — Registrar recepción

**Como** mecánico, **quiero** registrar la recepción de la bicicleta, **para** iniciar su orden de trabajo.

- Dado un turno confirmado, cuando registro recepción, entonces se crea una orden vinculada.
- Dada una orden ya recibida, cuando intento duplicar la recepción inicial, entonces se rechaza.

### HU10 — Registrar diagnóstico

**Como** mecánico, **quiero** cargar el diagnóstico, **para** documentar el problema.

- Dada una orden recibida, cuando guardo un diagnóstico no vacío, entonces se registra autor y fecha.
- Dado un cliente propietario, cuando consulta su orden, entonces puede ver el diagnóstico disponible.

### HU11 — Crear presupuesto

**Como** mecánico, **quiero** detallar trabajos y repuestos, **para** informar el costo antes de reparar.

- Dada una orden diagnosticada, cuando creo un presupuesto con conceptos válidos, entonces el servidor calcula el total.
- Dado un concepto con importe negativo, cuando guardo, entonces se rechaza.

### HU12 — Responder presupuesto

**Como** cliente, **quiero** aprobar o rechazar el presupuesto, **para** autorizar el trabajo.

- Dado un presupuesto pendiente de una orden propia, cuando lo apruebo, entonces se registra la respuesta y la orden pasa a APPROVED.
- Dado un presupuesto pendiente, cuando lo rechazo, entonces queda registrada la decisión y no se inicia el trabajo.
- Dado un presupuesto ya respondido, cuando intento responder nuevamente, entonces se rechaza.

### HU13 — Actualizar reparación

**Como** mecánico, **quiero** actualizar el avance, **para** informar el estado real del trabajo.

- Dada una orden APPROVED, cuando inicio el trabajo, entonces pasa a IN_PROGRESS.
- Dada una orden no READY, cuando intento entregarla, entonces se rechaza.
- Dada una transición no permitida, cuando la solicito, entonces se rechaza y no se altera el historial.

### HU14 — Administrar repuestos

**Como** administrador, **quiero** administrar el inventario, **para** mantener cantidades y precios.

- Dado un código nuevo, cuando creo un repuesto válido, entonces queda registrado.
- Dado un código existente, cuando intento duplicarlo, entonces se rechaza.

### HU15 — Registrar consumo

**Como** mecánico, **quiero** registrar repuestos usados, **para** reflejar el consumo real.

- Dado stock suficiente, cuando registro consumo válido, entonces se crea movimiento y se descuenta stock en una misma transacción.
- Dado stock insuficiente, cuando intento consumir, entonces no se crea movimiento ni se modifica stock.

### HU16 — Consultar historial

**Como** cliente, **quiero** consultar el historial de mis bicicletas, **para** conocer sus reparaciones anteriores.

- Dada una bicicleta propia con órdenes anteriores, cuando consulto su historial, entonces veo fechas, estados, diagnósticos, presupuestos y trabajos permitidos.
- Dada una bicicleta ajena, cuando intento consultar su historial, entonces se deniega el acceso.

## 7. Casos límite (EC)

- **EC01:** dos clientes confirman simultáneamente el último intervalo disponible. Solo una reserva puede confirmarse.
- **EC02:** un turno termina exactamente cuando empieza el siguiente. No se considera superposición.
- **EC03:** el servicio cambia de duración después de reservar. El turno conserva la duración original.
- **EC04:** el servicio se desactiva después de crear un turno. El turno existente conserva sus datos.
- **EC05:** el cliente intenta reservar en el pasado o fuera del horizonte de 30 días.
- **EC06:** el cliente intenta cancelar exactamente 12 horas antes. La cancelación se permite porque RN12 exige al menos 12 horas.
- **EC07:** el cliente intenta cancelar 11 horas y 59 minutos antes. Se rechaza.
- **EC08:** un mecánico queda inactivo con turnos futuros. No se borran turnos; el administrador debe reasignarlos.
- **EC09:** una reasignación genera conflicto con otro turno. La operación se rechaza.
- **EC10:** se envía un total de presupuesto manipulado desde el frontend. El backend recalcula el importe.
- **EC11:** dos respuestas intentan aprobar/rechazar el mismo presupuesto simultáneamente. Solo una respuesta queda registrada.
- **EC12:** se intenta una transición de estado no permitida. No se actualiza ni el estado ni su historial.
- **EC13:** dos consumos simultáneos compiten por las últimas unidades. El stock no puede quedar negativo.
- **EC14:** falla la escritura del movimiento de inventario. La transacción revierte también el descuento.
- **EC15:** el cliente intenta acceder a un recurso de otro cliente cambiando el ID de la URL. El backend deniega el acceso.

## 8. Requisitos no funcionales

- **RNF01 Usabilidad:** interfaz responsive y mensajes claros.
- **RNF02 Seguridad:** contraseñas con hashing, sesiones protegidas y autorización backend.
- **RNF03 Mantenibilidad:** TypeScript estricto y separación por capas.
- **RNF04 Integridad:** restricciones y transacciones para operaciones críticas.
- **RNF05 Rendimiento:** paginar listados y evitar consultas repetitivas innecesarias.
- **RNF06 Disponibilidad:** frontend, API y base de datos publicados para evaluación.
- **RNF07 Trazabilidad:** registrar cambios relevantes de turnos, órdenes e inventario.
- **RNF08 Accesibilidad básica:** etiquetas en formularios, foco visible y contraste suficiente.

## 9. Matriz de trazabilidad

| Regla | Historias principales | Pruebas mínimas |
|---|---|---|
| RN01–RN05 | HU05, HU06, HU08 | límites de horario, duración, conflictos y bloqueos |
| RN06–RN07 | HU03, HU04 | servicio activo y propiedad de bicicleta |
| RN08–RN11 | HU05, HU06, HU08 | reserva válida, cupo, carrera concurrente |
| RN12–RN13 | HU07, HU08 | ventana de cancelación y reasignación |
| RN14–RN18 | HU09–HU13 | recepción, presupuesto, aprobación y transiciones |
| RN19–RN20 | HU14–HU16 | código único, stock, transacción e historial |

## 10. Criterio de aceptación global

El MVP cumple la especificación cuando todos los flujos del alcance están implementados, las reglas RN tienen pruebas aprobadas, no existen conflictos de agenda ni stock negativo bajo concurrencia, y los flujos principales pueden ejecutarse desde la aplicación publicada.
