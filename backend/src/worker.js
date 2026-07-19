import dotenv from "dotenv";
import { redisCache, connectRedisCache } from "./lib/redis.js";
dotenv.config(); // 👈 This loads your MONGODB_URI

import { consumer } from "./lib/kafka.js";
import { connectDB } from "./lib/db.js";
import Message from "./models/message.js"; // Ensure this path matches your setup

async function startWorker() {
  console.log("👷 Starting Database Worker...");

  // 1. The worker needs its own connection to MongoDB
  await connectDB();
  // 2. 🔌 CONNECT TO REDIS CACHE (This is the missing link!
  await connectRedisCache();
  // 2. Connect the consumer to Kafka
  await consumer.connect();
  console.log("✅ Kafka Consumer Connected");

  // 3. Subscribe to our specific conveyor belt
  await consumer.subscribe({ topic: "chat-messages", fromBeginning: true });

  // 4. Start the infinite loop to process messages
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        // Kafka sends data as raw Buffers, so we convert it back to a JSON object
        const rawString = message.value.toString();
        const messageData = JSON.parse(rawString);

        // Save to MongoDB at our own pace
        const newMessage = new Message(messageData);
        await newMessage.save();
        const id1 = newMessage.senderId.toString();
        const id2 = newMessage.receiverId.toString();

        // 2. Generate the exact key
        const chatKey = `chat:${[id1, id2].sort().join("_")}`;

        // 3. Delete the cache
        await redisCache.del(chatKey);
        console.log(`🧹 Cleared Redis Cache for key: ${chatKey}`);
        console.log(`💾 Saved message to DB: ${newMessage._id}`);
      } catch (error) {
        console.error("❌ Failed to save message:", error);
      }
    },
  });
}

startWorker();
