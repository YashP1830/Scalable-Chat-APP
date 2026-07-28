import { createClient } from "redis";

// ---------------------------------------------------------------------------
// Redis cache client (chat history + online-user set live here)
// ---------------------------------------------------------------------------
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

// How long a cached chat history stays warm before we re-hydrate from Mongo.
export const CHAT_CACHE_TTL_SECONDS = 60 * 60; // 1 hour

export const redisCache = createClient({
  url: redisUrl,
  socket: {
    // Auto-reconnect with capped exponential backoff instead of giving up.
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
  },
});

redisCache.on("error", (err) => console.error("❌ Redis Cache Error:", err));
redisCache.on("reconnecting", () => console.log("… Redis reconnecting"));
redisCache.on("ready", () => console.log("🗄️ Redis Cache Client Ready"));

export const connectRedisCache = async () => {
  try {
    if (!redisCache.isOpen) await redisCache.connect();
  } catch (error) {
    console.error("❌ Failed to connect Redis Cache:", error);
  }
};

// Deterministic key for a 1-to-1 conversation. Sorting the two ids means
// (Alice, Bob) and (Bob, Alice) always resolve to the same key.
export const getChatKey = (idA, idB) =>
  `chat:${[idA.toString(), idB.toString()].sort().join("_")}`;
