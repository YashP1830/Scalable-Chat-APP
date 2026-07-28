import http from "http";
import { Server } from "socket.io";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import { socketAuthMiddleware } from "../middleware/socketAuthMiddleware.js";
import Message from "../models/message.js";
import { redisCache, getChatKey, CHAT_CACHE_TTL_SECONDS } from "./redis.js";

let io;

// Update a single message's status inside the Redis list IN PLACE (find by _id
// via LSET) instead of deleting the key. Deleting would be unsafe: if the
// db-worker is down the message isn't in Mongo yet, so a re-hydrate would drop
// it. Updating in place keeps ticks correct even while the worker is off.
async function patchStatusInCache(chatKey, predicate, nextStatus) {
  try {
    const raw = await redisCache.lRange(chatKey, 0, -1);
    for (let i = 0; i < raw.length; i++) {
      const msg = JSON.parse(raw[i]);
      if (predicate(msg) && msg.status !== nextStatus) {
        msg.status = nextStatus;
        await redisCache.lSet(chatKey, i, JSON.stringify(msg));
      }
    }
    if (raw.length > 0) await redisCache.expire(chatKey, CHAT_CACHE_TTL_SECONDS);
  } catch (err) {
    // Message may only be a WRONGTYPE/empty key on a cold cache — non-fatal.
    if (err?.message && !err.message.includes("no such key")) {
      console.error("⚠️ patchStatusInCache failed:", err);
    }
  }
}

export const initSocket = (app) => {
  const server = http.createServer(app);
  const PORT = process.env.PORT || 3000;

  io = new Server(server, {
    cors: {
      origin: [
        process.env.CLIENT_URL,
        "http://localhost:5173",
        "http://localhost:5174",
      ],
      credentials: true,
    },
  });

  // 🔌 Redis adapter so socket rooms work across all 3 API instances.
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();

  Promise.all([pubClient.connect(), subClient.connect()])
    .then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      console.log(`📡 [Port ${PORT}] Redis Adapter Connected`);
    })
    .catch((err) => console.error("❌ Redis Adapter failed:", err));

  io.use(socketAuthMiddleware);

  io.on("connection", async (socket) => {
    const userId = socket.userId.toString();
    console.log(`🟢 [Port ${PORT}] Socket connected:`, socket.id);

    // Each user joins a room named after their id (used for direct delivery).
    socket.join(userId);

    // Track presence in a shared Redis set.
    await pubClient.sAdd("global_online_users", userId);
    const onlineUsers = await pubClient.sMembers("global_online_users");
    io.emit("getOnlineUsers", onlineUsers);

    // -----------------------------------------------------------------------
    // ✔✔ DELIVERED: receiver's device acknowledges it got a message.
    // Payload: { messageId, senderId }
    // -----------------------------------------------------------------------
    socket.on("messageDelivered", async ({ messageId, senderId }) => {
      try {
        if (!messageId || !senderId) return;
        const chatKey = getChatKey(userId, senderId);

        // Only advance sent → delivered (never downgrade a read message).
        await Message.updateOne(
          { _id: messageId, status: "sent" },
          { $set: { status: "delivered" } }
        );
        await patchStatusInCache(
          chatKey,
          (m) => m._id === messageId && m.status === "sent",
          "delivered"
        );

        // Tell the original sender to flip that message to double-grey.
        io.to(senderId.toString()).emit("messageStatusUpdate", {
          messageId,
          status: "delivered",
        });
      } catch (err) {
        console.error("❌ messageDelivered handler failed:", err);
      }
    });

    // -----------------------------------------------------------------------
    // ✔✔ (blue) READ: receiver opened the chat with `partnerId`.
    // Marks every message partner → me as read. Payload: { partnerId }
    // -----------------------------------------------------------------------
    socket.on("messageRead", async ({ partnerId }) => {
      try {
        if (!partnerId) return;
        const chatKey = getChatKey(userId, partnerId);

        await Message.updateMany(
          { senderId: partnerId, receiverId: userId, status: { $ne: "read" } },
          { $set: { status: "read" } }
        );
        await patchStatusInCache(
          chatKey,
          (m) => m.senderId === partnerId && m.receiverId === userId,
          "read"
        );

        // Tell the sender all their messages in this chat are now blue.
        io.to(partnerId.toString()).emit("messagesRead", { by: userId });
      } catch (err) {
        console.error("❌ messageRead handler failed:", err);
      }
    });

    socket.on("disconnect", async () => {
      console.log(`🔴 [Port ${PORT}] Socket disconnected:`, socket.id);
      await pubClient.sRem("global_online_users", userId);
      const currentOnlineUsers = await pubClient.sMembers("global_online_users");
      io.emit("getOnlineUsers", currentOnlineUsers);
    });
  });

  return server;
};

export { io };
