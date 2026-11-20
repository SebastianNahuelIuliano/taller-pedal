
# AGENTS.md — Taller Pedal

## 1. Principio de trabajo

Specification-first y test-driven development. Antes de implementar una funcionalidad, leer la regla RN correspondiente en `docs/spec.md`, la arquitectura de `docs/plan.md` y la tarea de `docs/tasks.md`.

## 2. Fuentes de verdad

- `docs/spec.md`: comportamiento funcional y reglas de negocio.
- `docs/plan.md`: arquitectura, modelo de datos y contratos técnicos.
- `docs/tasks.md`: alcance, dependencias y estado del trabajo.
- `docs/decisions.md`: decisiones aceptadas y sus motivos.
- Si hay contradicción, no inventar una solución: registrar el conflicto en `docs/preguntas_abiertas.md` y solicitar resolución.

## 3. Reglas generales

- No implementar funcionalidades fuera del alcance acordado sin actualizar documentación.
- No marcar tareas como terminadas sin implementación y verificación.
- No inventar resultados de pruebas ni URLs de despliegue.
- Mantener nombres, estados y contratos consistentes entre frontend, backend y base de datos.
- Preferir soluciones simples y mantenibles.

## 4. Backend

- Usar TypeScript con `strict: true`.
- Separar rutas, controladores, servicios y repositorios.
- Los controladores traducen HTTP; la lógica de negocio vive en servicios.
- El acceso SQL vive en repositorios.
- Validar entradas en el límite de la API.
- Usar consultas parametrizadas.
- Centralizar el manejo de errores.
- Las operaciones que modifican varias entidades deben usar transacciones.
- Validar autorización en el servidor, nunca confiar solamente en el frontend.

## 5. Frontend

- Usar React y TypeScript.
- Separar páginas, componentes, hooks y cliente API.
- Los formularios deben mostrar errores comprensibles.
- Incluir estados de carga, vacío y error.
- Proteger rutas por sesión y rol como mejora de experiencia, sin reemplazar la autorización del backend.
- No duplicar reglas críticas de negocio como única validación en el navegador.

## 6. Base de datos

- PostgreSQL como fuente persistente.
- Versionar cambios mediante migraciones.
- Declarar claves foráneas, restricciones e índices.
- Usar `NUMERIC` para importes monetarios.
- Guardar timestamps de forma consistente y presentar fechas en la zona horaria del taller.
- No borrar físicamente registros que formen parte de un historial necesario.

## 7. Seguridad

- Nunca guardar `.env`, contraseñas, tokens ni claves en Git.
- Mantener `.env.example` sin valores secretos.
- Hashear contraseñas con una biblioteca reconocida.
- Aplicar autorización por rol y propiedad del recurso.
- Configurar CORS para el origen real del frontend.
- Validar datos recibidos y limitar intentos en autenticación.
- No registrar contraseñas, tokens ni datos sensibles en logs.

## 8. Pruebas

- Cada regla RN debe tener pruebas asociadas.
- Probar caminos exitosos, rechazos y límites.
- Usar reloj inyectable o fechas controladas en pruebas temporales.
- Probar concurrencia en reservas e inventario.
- Ejecutar tests y compilación antes de cerrar una tarea.
- Registrar resultados reales en `docs/informe-pruebas.md`.

## 9. Git

- Un commit por tarea lógica terminada.
- Usar mensajes descriptivos, por ejemplo `docs: completar especificación de negocio`.
- No mezclar secretos, archivos temporales ni `node_modules`.
- No hacer commits de tareas que no pasaron sus verificaciones.
- Actualizar `docs/tasks.md` en el mismo trabajo que completa la tarea.

## 10. Definición de terminado

Una tarea está terminada solamente si:
1. Cumple sus criterios de aceptación.
2. Respeta las RN relacionadas.
3. Tiene pruebas adecuadas y aprobadas.
4. La aplicación compila.
5. No rompe pruebas existentes.
6. La documentación está actualizada.
7. Existe un commit identificable.

## 11. Agentes o responsabilidades

- **Analista:** aclara reglas, historias y casos límite.
- **Arquitecto:** mantiene el diseño y contratos.
- **Backend:** implementa API y dominio.
- **Frontend:** implementa pantallas y flujos.
- **Tester:** diseña y ejecuta pruebas.
- **Revisor:** verifica trazabilidad, seguridad y calidad.

Una misma persona puede asumir varias responsabilidades; estos nombres describen tareas, no herramientas obligatorias.
