
import express, {
  type ErrorRequestHandler,
} from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.routes.js";
import servicesRoutes from "./routes/services.routes.js";
import bicyclesRoutes from "./routes/bicycles.routes.js";
import workshopRoutes from "./routes/workshop.routes.js";

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
  })
);

app.use(express.json({ limit: "10kb" }));

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Taller Pedal API funcionando correctamente",
    timestamp: new Date().toISOString(),
  });
});

// Rutas de autenticaciÃ³n.
app.use("/api/auth", authRoutes);

// Rutas de servicios.
app.use("/api/services", servicesRoutes);

// Rutas de bicicletas.
app.use("/api/bicycles", bicyclesRoutes);

// Rutas de horarios y bloqueos.
app.use("/api/workshop", workshopRoutes);

// Ruta no encontrada.
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Ruta no encontrada",
  });
});

// Manejo general de errores.
const errorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next
) => {
  console.error("Error en la API:", error);

  res.status(500).json({
    success: false,
    message: "OcurriÃ³ un error interno en el servidor",
  });
};

app.use(errorHandler);

export default app;
