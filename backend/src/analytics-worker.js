import dotenv from "dotenv";
dotenv.config();

import { Kafka } from "kafkajs";

// 1. Connect to the exact same Kafka cluster
const kafka = new Kafka({
  clientId: "chat-app-backend",
  brokers: ["localhost:9092"], 
});

// 2. 🛑 THE MOST IMPORTANT LINE: Notice the new groupId!
const consumer = kafka.consumer({ groupId: "chat-analytics-workers" });

// A simple in-memory map to track spam/message velocity
const userMessageCounts = new Map();

async function startAnalytics() {
  console.log("📊 Starting Analytics Worker...");
  
  await consumer.connect();
  console.log("✅ Analytics Consumer Connected");

  // 3. Subscribe to the exact same topic as the DB worker
  await consumer.subscribe({ topic: "chat-messages", fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const messageData = JSON.parse(message.value.toString());
        const sender = messageData.senderId;

        // Simple analytics logic: Count messages per user
        const currentCount = userMessageCounts.get(sender) || 0;
        userMessageCounts.set(sender, currentCount + 1);

        console.log(`📈 [ANALYTICS] User ${sender} has sent ${currentCount + 1} messages this session.`);
        
        // In a real app, if currentCount > 100, we might trigger a "Ban User" event!

      } catch (error) {
        console.error("❌ Analytics error:", error);
      }
    },
  });
}

startAnalytics();