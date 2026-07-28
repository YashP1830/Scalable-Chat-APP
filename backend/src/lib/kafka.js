import { Kafka, Partitioners, logLevel } from "kafkajs";

// ---------------------------------------------------------------------------
// Kafka connection (shared by API servers + background workers)
// ---------------------------------------------------------------------------
// In Docker Compose every service talks to the broker via the service name
// "kafka:9092" (set through KAFKA_BROKER). Locally it falls back to localhost.
const brokers = (process.env.KAFKA_BROKER || "localhost:9092")
  .split(",")
  .map((b) => b.trim());

const kafka = new Kafka({
  clientId: "chat-app-backend",
  brokers,
  logLevel: logLevel.ERROR,
  // Retry the initial broker connection instead of crashing when Kafka is
  // still booting (common in docker-compose where containers start together).
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

// The producer is used by the API servers to publish chat messages.
export const producer = kafka.producer({
  // Silence the partitioner warning and keep deterministic partitioning.
  createPartitioner: Partitioners.LegacyPartitioner,
  allowAutoTopicCreation: true,
});

// Factory so every worker gets its OWN consumer group. Two different groups
// (db-workers vs analytics-workers) each receive their own copy of a message.
export const createConsumer = (groupId) =>
  kafka.consumer({
    groupId,
    // Give Kafka time to (re)balance without kicking a slow consumer.
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
  });

// Backwards-compatible default consumer used by the DB worker.
export const consumer = createConsumer("chat-db-workers");

export const connectKafkaProducer = async () => {
  try {
    await producer.connect();
    console.log("🚀 Kafka Producer Connected");
  } catch (error) {
    console.error("❌ Error connecting Kafka Producer:", error);
  }
};

// Flush + close the producer cleanly on shutdown so no in-flight message is
// lost when a container is stopped.
export const disconnectKafkaProducer = async () => {
  try {
    await producer.disconnect();
    console.log("👋 Kafka Producer Disconnected");
  } catch (error) {
    console.error("❌ Error disconnecting Kafka Producer:", error);
  }
};

export { kafka };
