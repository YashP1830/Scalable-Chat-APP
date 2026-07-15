import http from "http";
import { Server } from "socket.io";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import { socketAuthMiddleware } from "../middleware/socketAuthMiddleware.js";

let io;
// 🛑 Notice that userSocketMap is GONE!

export const initSocket = (app) => {
  const server = http.createServer(app);
  const PORT = process.env.PORT || 3000;

  io = new Server(server, {
    cors: {
      origin: [
        process.env.CLIENT_URL, 
        "http://localhost:5173", 
        "http://localhost:5174"
      ],
      credentials: true,
    },
  });

  // 🔌 1. Set up Redis Clients
  const pubClient = createClient({ url: "redis://localhost:6379" });
  const subClient = pubClient.duplicate();

  // Connect to Redis and attach the adapter
  Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
    io.adapter(createAdapter(pubClient, subClient));
    console.log(`📡 [Port ${PORT}] Redis Adapter Connected`);
  });

  // 🔐 Socket auth middleware
  io.use(socketAuthMiddleware);

  io.on("connection", async (socket) => { 
    const userId = socket.userId.toString();
    console.log(`🟢 [Port ${PORT}] Socket connected:`, socket.id);
    
    // 🏠 2. The Room Strategy: User joins a room named after their ID
    socket.join(userId);

    // 💾 3. Global State: Add user to a Redis "Set" of online users
    await pubClient.sAdd("global_online_users", userId);
    
    // Fetch the total list from Redis and broadcast to everyone
    const onlineUsers = await pubClient.sMembers("global_online_users");
    io.emit("getOnlineUsers", onlineUsers);

    socket.on("disconnect", async () => {
      console.log(`🔴 [Port ${PORT}] Socket disconnected:`, socket.id);
      
      // Remove from Redis and broadcast update
      await pubClient.sRem("global_online_users", userId);
      const currentOnlineUsers = await pubClient.sMembers("global_online_users");
      io.emit("getOnlineUsers", currentOnlineUsers);
    });
  });

  return server;
};

export { io };