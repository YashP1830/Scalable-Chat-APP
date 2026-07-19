import { Kafka } from "kafkajs";

// 1. Initialize the Kafka instance, pointing it to our Docker container
const kafka = new Kafka({
  clientId: "chat-app-backend",
  // To this:
  brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
});

// 2. Create the Producer (used by our API servers)
export const producer = kafka.producer();

// 3. Create the Consumer (used by our background worker)
// Consumers must belong to a "Group". Kafka ensures a message is only processed once per group.
export const consumer = kafka.consumer({ groupId: "chat-db-workers" });

// 4. A helper function to connect the Producer when our server starts
export const connectKafkaProducer = async () => {
  try {
    await producer.connect();
    console.log("🚀 Kafka Producer Connected");
  } catch (error) {
    console.error("❌ Error connecting Kafka Producer:", error);
  }
};
