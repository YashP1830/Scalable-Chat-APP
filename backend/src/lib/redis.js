import { createClient } from "redis";

// Create a standard Redis client for caching
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
export const redisCache = createClient({ url: redisUrl });

redisCache.on("error", (err) => console.error("❌ Redis Cache Error:", err));

export const connectRedisCache = async () => {
  try {
    await redisCache.connect();
    console.log("🗄️ Redis Cache Client Connected");
  } catch (error) {
    console.error("❌ Failed to connect Redis Cache:", error);
  }
};