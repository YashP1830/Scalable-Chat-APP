import express from "express";
import dotenv from "dotenv";
import path from "path";
import cookieParser from "cookie-parser";
import cors from "cors";
import { connectKafkaProducer, disconnectKafkaProducer } from "./lib/kafka.js";

import authRoutes from "./routes/auth.route.js";
import messageRoutes from "./routes/message.route.js";
import { connectDB } from "./lib/db.js";
import { initSocket } from "./lib/socket.js";
import { connectRedisCache } from "./lib/redis.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.resolve();

// Which API instance is this? Set via INSTANCE_ID in docker-compose; falls back
// to the container hostname. Used to see how nginx spreads traffic.
import os from "os";
const INSTANCE_ID = process.env.INSTANCE_ID || os.hostname();

// ✅ MIDDLEWARES FIRST
app.use(
  cors({
    origin: [
      process.env.CLIENT_URL,
      "http://localhost:5173",
      "http://localhost:5174" // Added the second frontend port
    ],
    credentials: true,
    // Let the browser read our debug header.
    exposedHeaders: ["X-Served-By"],
  })
);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Stamp every response with the instance that handled it (visible in the
// browser Network tab → Response Headers, or via `curl -i`).
app.use((req, res, next) => {
  res.setHeader("X-Served-By", INSTANCE_ID);
  next();
});

// Unauthenticated debug endpoint: which instance answered?
app.get("/api/whoami", (req, res) =>
  res.status(200).json({ instance: INSTANCE_ID })
);

// ✅ ROUTES
app.use("/api/auth", authRoutes);
app.use("/api/message", messageRoutes);

// ✅ INIT SOCKET **AFTER** MIDDLEWARE
const server = initSocket(app);


server.listen(PORT, () => {
    console.log(`🚀 [Server Instance] Running on port: ${PORT}`);
    connectDB();
    connectKafkaProducer();
    connectRedisCache();
}); 

// ✅ PRODUCTION FRONTEND SERVE
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
  });
}

// ✅ GRACEFUL SHUTDOWN — flush any in-flight Kafka messages before exit.
const shutdown = async () => {
  console.log("👋 API server shutting down…");
  await disconnectKafkaProducer();
  server.close(() => process.exit(0));
  // Safety net if connections hang.
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
