
import express, {
  type ErrorRequestHandler,
} from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import servicesRoutes from "./routes/services.routes.js";
import bicyclesRoutes from "./routes/bicycles.routes.js";
import workshopRoutes from "./routes/workshop.routes.js";
import appointmentsRoutes from "./routes/appointments.routes.js";
import appointmentsBookingRoutes from "./routes/appointments.booking.routes.js";
import appointmentsCancellationRoutes from "./routes/appointments.cancellation.routes.js";
import appointmentsAssignmentRoutes from "./routes/appointments.assignment.routes.js";
import repairOrdersRoutes from "./routes/repair-orders.routes.js";
import diagnosesRoutes from "./routes/diagnoses.routes.js";
import estimatesRoutes from "./routes/estimates.routes.js";
import estimatesResponseRoutes from "./routes/estimates.response.routes.js";
import repairStatusRoutes from "./routes/repair-status.routes.js";
import sparePartsRoutes from "./routes/spare-parts.routes.js";
import repairConsumptionsRoutes from "./routes/repair-consumptions.routes.js";

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

// Rutas de disponibilidad y turnos.
app.use("/api/appointments", appointmentsRoutes);
app.use("/api/appointments", appointmentsBookingRoutes);
app.use("/api/appointments", appointmentsCancellationRoutes);
app.use("/api/appointments", appointmentsAssignmentRoutes);
app.use("/api/appointments", repairOrdersRoutes);
app.use("/api/repair-orders", diagnosesRoutes);
app.use("/api/repair-orders", estimatesRoutes);
app.use("/api/repair-orders", estimatesResponseRoutes);
app.use("/api/repair-orders", repairStatusRoutes);
app.use("/api/repair-orders", repairConsumptionsRoutes);
app.use("/api/spare-parts", sparePartsRoutes);


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
