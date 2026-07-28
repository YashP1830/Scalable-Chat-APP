/**
 * Manually wipe chat messages.
 *
 *   docker compose -f docker-compose.dev.yml exec chat-api node src/scripts/clearMessages.js
 *   (or, running the backend locally)  node src/scripts/clearMessages.js
 *
 * Deletes from BOTH MongoDB and the Redis chat cache, because the API serves
 * chat history from the Redis `chat:*` cache — clearing only Mongo would leave
 * stale messages showing until the cache expires.
 *
 * Options (env or CLI):
 *   --user=<userId>   only delete messages where this user is sender OR receiver
 *   (no flag)         delete ALL messages
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectDB } from "../lib/db.js";
import { redisCache, connectRedisCache } from "../lib/redis.js";
import Message from "../models/message.js";

const arg = process.argv.find((a) => a.startsWith("--user="));
const userId = arg ? arg.split("=")[1] : null;

async function run() {
  await connectDB();
  await connectRedisCache();

  // 1. Delete from MongoDB (source of truth).
  const filter = userId
    ? { $or: [{ senderId: userId }, { receiverId: userId }] }
    : {};
  const { deletedCount } = await Message.deleteMany(filter);
  console.log(`🗑️  Deleted ${deletedCount} messages from MongoDB`);

  // 2. Clear the Redis chat cache so refreshes don't resurrect them.
  //    (SCAN instead of KEYS so it's safe on a large DB.)
  let cleared = 0;
  for await (const key of redisCache.scanIterator({ MATCH: "chat:*" })) {
    // scanIterator may yield a single key or a batch depending on client version
    const keys = Array.isArray(key) ? key : [key];
    if (keys.length) {
      await redisCache.del(keys);
      cleared += keys.length;
    }
  }
  console.log(`🧹 Cleared ${cleared} Redis chat cache key(s)`);

  await mongoose.disconnect();
  await redisCache.quit();
  console.log("✅ Done");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ clearMessages failed:", err);
  process.exit(1);
});
