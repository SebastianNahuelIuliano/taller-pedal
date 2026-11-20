# AGENTS.md — Taller Pedal

## 1. Objetivo del proyecto

Desarrollar una aplicación web completa para administrar turnos, servicios y reparaciones de un taller mecánico de bicicletas.

## 2. Reglas generales

- Antes de implementar una funcionalidad, consultar `docs/spec.md`.
- Respetar todas las reglas de negocio documentadas.
- Seguir la arquitectura definida en `docs/plan.md`.
- Consultar las tareas pendientes en `docs/tasks.md`.
- No implementar funcionalidades que contradigan la especificación.
- Mantener el código organizado, modular y reutilizable.

## 3. Backend

- Utilizar Node.js, Express y TypeScript.
- Separar rutas, controladores, servicios y repositorios.
- Implementar las reglas de negocio en la capa de servicios.
- Validar los datos recibidos.
- Gestionar los errores mediante un middleware centralizado.
- Utilizar consultas parametrizadas.
- No exponer información sensible.
- Implementar autenticación y autorización.

## 4. Frontend

- Utilizar React, TypeScript y Vite.
- Crear componentes reutilizables.
- Mantener separadas las páginas, componentes y servicios de comunicación con la API.
- Validar los formularios.
- Mostrar mensajes claros de éxito y error.
- Implementar estados de carga y pantallas vacías.
- Respetar los permisos de cada tipo de usuario.

## 5. Base de datos

- Utilizar PostgreSQL.
- Mantener las relaciones y restricciones necesarias.
- Crear migraciones versionadas.
- Evitar la eliminación de información histórica importante.
- No almacenar contraseñas en texto plano.

## 6. Pruebas

- Escribir pruebas para las reglas de negocio.
- Probar los casos válidos e inválidos.
- No considerar terminada una tarea si sus pruebas fallan.
- Ejecutar la suite completa antes de finalizar una tarea.

## 7. Seguridad

- No guardar secretos ni contraseñas en el repositorio.
- Utilizar variables de entorno.
- Mantener el archivo `.env` fuera de Git.
- Validar y sanitizar las entradas.
- Proteger las rutas privadas.
- Verificar permisos en el backend, no solamente en el frontend.

## 8. Git y commits

- Realizar un commit por cada tarea completada.
- Utilizar mensajes descriptivos.
- No marcar tareas como terminadas sin verificar su implementación.
- No incluir archivos generados o secretos en los commits.

## 9. Documentación

- Actualizar README y documentos cuando corresponda.
- Mantener la especificación sincronizada con el comportamiento real.
- Registrar las decisiones técnicas importantes.
- Documentar los resultados de las pruebas.

## 10. Criterio de finalización

Una tarea solamente puede marcarse como completada cuando:

1. Su implementación está realizada.
2. Cumple la especificación.
3. Sus pruebas pasan.
4. No introduce errores en funcionalidades existentes.
5. Se actualizó la documentación correspondiente.
6. Se creó su commit individual.