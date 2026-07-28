import dotenv from "dotenv";
dotenv.config(); // loads MONGODB_URI etc.

import { connectRedisCache } from "./lib/redis.js";
import { consumer } from "./lib/kafka.js";
import { connectDB } from "./lib/db.js";
import Message from "./models/message.js";

async function startWorker() {
  console.log("👷 Starting Database Worker...");

  // The worker owns its own connections to Mongo, Redis and Kafka.
  await connectDB();
  await connectRedisCache();
  await consumer.connect();
  console.log("✅ Kafka Consumer Connected");

  // fromBeginning:true lets a freshly-restarted worker drain the backlog that
  // piled up in Kafka while it was down — this is what persists messages that
  // were sent during the outage.
  await consumer.subscribe({ topic: "chat-messages", fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const messageData = JSON.parse(message.value.toString());
        const { _id, ...rest } = messageData;

        // IDEMPOTENT WRITE (upsert by _id):
        // Kafka may redeliver the same message (consumer restart before the
        // offset commits, or a full backlog replay). A plain new+save() would
        // throw duplicate-key errors on every replay. $setOnInsert writes the
        // doc only the first time and — crucially — leaves an existing doc's
        // status alone, so a "delivered"/"read" tick set via socket is never
        // clobbered back to "sent".
        //
        // timestamps:false is REQUIRED here. The schema has timestamps:true, so
        // Mongoose would auto-add `updatedAt` to the $set part of the update —
        // but `rest` already carries `updatedAt` in $setOnInsert. The same path
        // in both $set and $setOnInsert makes MongoDB throw
        // ConflictingUpdateOperators (code 40), which silently killed every
        // write. Disabling Mongoose timestamps here lets us keep the original
        // send-time createdAt/updatedAt that travelled through Kafka.
        await Message.updateOne(
          { _id },
          { $setOnInsert: rest },
          { upsert: true, timestamps: false }
        );

        // NOTE: we intentionally do NOT delete the Redis cache here. The API's
        // sendMessage already wrote this message into the cache list, so the
        // cache is authoritative even while this worker is down. Deleting it
        // would force a re-hydrate from Mongo and could momentarily drop
        // messages that haven't been persisted yet.
        console.log(`💾 Persisted message to DB: ${_id}`);
      } catch (error) {
        console.error("❌ Failed to save message:", error);
      }
    },
  });
}

// Graceful shutdown → commit offsets and leave the group cleanly.
const shutdown = async () => {
  console.log("👋 DB worker shutting down…");
  try {
    await consumer.disconnect();
  } finally {
    process.exit(0);
  }
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startWorker().catch((err) => {
  console.error("❌ DB worker failed to start:", err);
  process.exit(1);
});
