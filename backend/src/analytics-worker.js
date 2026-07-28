import dotenv from "dotenv";
dotenv.config();

import { createConsumer } from "./lib/kafka.js";

// ---------------------------------------------------------------------------
// Analytics worker
// ---------------------------------------------------------------------------
// 🐛 ROOT CAUSE (why analytics never worked in Docker):
// this file used to hard-code brokers:["localhost:9092"]. Inside the
// analytics-worker container "localhost" is the container itself, NOT the
// Kafka broker — so the consumer could never connect and silently retried
// forever. It now shares lib/kafka.js which reads KAFKA_BROKER (kafka:9092),
// which docker-compose already injects for this service.

// Its OWN consumer group → gets its own independent copy of every message.
const consumer = createConsumer("chat-analytics-workers");

// A simple in-memory map to track spam / message velocity per user.
const userMessageCounts = new Map();

async function startAnalytics() {
  console.log("📊 Starting Analytics Worker...");

  await consumer.connect();
  console.log("✅ Analytics Consumer Connected");

  // Only care about new traffic, not historical replay.
  await consumer.subscribe({ topic: "chat-messages", fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const messageData = JSON.parse(message.value.toString());
        const sender = messageData.senderId;
        if (!sender) return;

        const currentCount = (userMessageCounts.get(sender) || 0) + 1;
        userMessageCounts.set(sender, currentCount);

        console.log(
          `📈 [ANALYTICS] User ${sender} has sent ${currentCount} messages this session.`
        );

        // In a real app: if currentCount > 100, emit a "rate-limit / ban" event.
      } catch (error) {
        console.error("❌ Analytics error:", error);
      }
    },
  });
}

// Graceful shutdown so the consumer leaves its group cleanly.
const shutdown = async () => {
  console.log("👋 Analytics worker shutting down…");
  try {
    await consumer.disconnect();
  } finally {
    process.exit(0);
  }
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startAnalytics().catch((err) => {
  console.error("❌ Analytics worker failed to start:", err);
  process.exit(1);
});
