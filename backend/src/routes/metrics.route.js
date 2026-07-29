import express from "express";
import {
  getCounters,
  getInstanceRequests,
  getOnlineCount,
  getConsumerLag,
} from "../lib/metrics.js";

const router = express.Router();

// Note: intentionally NOT behind auth/arcjet so the dashboard can poll it
// freely and (optionally) Prometheus can scrape it. It exposes only aggregate
// operational numbers, no user data.

// JSON summary consumed by the in-app dashboard.
router.get("/summary", async (req, res) => {
  try {
    const [counters, instances, online, dbLag, analyticsLag] = await Promise.all([
      getCounters(),
      getInstanceRequests(),
      getOnlineCount(),
      getConsumerLag("chat-db-workers"),
      getConsumerLag("chat-analytics-workers"),
    ]);

    res.status(200).json({
      timestamp: Date.now(),
      online,
      counters,
      instances, // { "chat-api-1": 123, ... }
      lag: { db: dbLag, analytics: analyticsLag },
    });
  } catch (error) {
    console.error("metrics summary error:", error);
    res.status(500).json({ message: "metrics error" });
  }
});

// Prometheus text exposition format (bonus — scrape at /api/metrics/prometheus).
router.get("/prometheus", async (req, res) => {
  try {
    const [counters, instances, online, dbLag, analyticsLag] = await Promise.all([
      getCounters(),
      getInstanceRequests(),
      getOnlineCount(),
      getConsumerLag("chat-db-workers"),
      getConsumerLag("chat-analytics-workers"),
    ]);

    const lines = [];
    const metric = (name, help, type, value, labels = "") => {
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} ${type}`);
      lines.push(`${name}${labels} ${value}`);
    };

    metric("chat_online_users", "Currently connected users", "gauge", online);
    metric("chat_messages_produced_total", "Messages published to Kafka", "counter", counters.messages_produced);
    metric("chat_messages_persisted_total", "Messages written to MongoDB", "counter", counters.messages_persisted);
    metric("chat_cache_hits_total", "Chat history served from Redis", "counter", counters.cache_hits);
    metric("chat_cache_misses_total", "Chat history read from Mongo", "counter", counters.cache_misses);
    if (dbLag != null) metric("chat_consumer_lag", "Consumer lag", "gauge", dbLag, '{group="chat-db-workers"}');
    if (analyticsLag != null) lines.push(`chat_consumer_lag{group="chat-analytics-workers"} ${analyticsLag}`);
    for (const [inst, count] of Object.entries(instances)) {
      lines.push(`chat_requests_total{instance="${inst}"} ${count}`);
    }

    res.set("Content-Type", "text/plain; version=0.0.4");
    res.status(200).send(lines.join("\n") + "\n");
  } catch (error) {
    res.status(500).send("# metrics error\n");
  }
});

export default router;
