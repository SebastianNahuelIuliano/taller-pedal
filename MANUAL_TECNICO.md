
# Manual técnico — Taller Pedal

## Estado

Guía prevista para el stack seleccionado. Los comandos definitivos se ajustarán a los scripts reales de `package.json` cuando se inicialicen frontend y backend.

## Requisitos

- Git.
- Node.js LTS compatible con las dependencias elegidas.
- npm.
- PostgreSQL local o cuenta/proyecto Neon.
- Visual Studio Code recomendado.

## Clonar

```bash
git clone https://github.com/SebastianNahuelIuliano/taller-pedal.git
cd taller-pedal
```

## Variables de entorno

Backend `.env` (ejemplo de nombres, no incluir secretos reales en Git):

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
FRONTEND_URL=http://localhost:5173
SESSION_SECRET=replace-with-a-long-random-secret
```

Frontend `.env`:

```env
VITE_API_URL=http://localhost:3000/api
```

## Instalación

Cuando se creen los proyectos:

```bash
cd backend
npm install
```

En otra terminal:

```bash
cd frontend
npm install
```

Los comandos `dev`, `build`, `test` y `db:migrate` se documentarán según los scripts efectivamente configurados.

## Base de datos

1. Crear una base PostgreSQL de desarrollo.
2. Configurar `DATABASE_URL`.
3. Ejecutar migraciones versionadas.
4. Verificar tablas, índices y restricciones.
5. Utilizar una base separada para pruebas.

No ejecutar migraciones destructivas contra producción sin backup y revisión.

## Despliegue previsto

- Neon: crear PostgreSQL y copiar connection string al secreto `DATABASE_URL` de Render.
- Render: conectar repositorio y configurar build/start commands según `backend/package.json`.
- Netlify: conectar repositorio, configurar directorio base `frontend`, comando build y publish `dist`.
- Configurar `VITE_API_URL` en Netlify con la URL real de la API.
- Configurar `FRONTEND_URL` en Render con el dominio real de Netlify.
- Aplicar migraciones y ejecutar pruebas smoke.

## Seguridad

- Nunca subir `.env`.
- No compartir credenciales de servicios.
- Rotar secretos si se exponen.
- Usar HTTPS en producción.
- No utilizar datos personales reales para demostración.
