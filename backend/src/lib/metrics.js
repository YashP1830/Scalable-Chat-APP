// ---------------------------------------------------------------------------
// Metrics collection — all counters live in Redis so they aggregate correctly
// across the 3 API instances (each instance's in-memory count would be partial).
// ---------------------------------------------------------------------------
import { redisCache } from "./redis.js";
import { admin } from "./kafka.js";

const COUNTERS_KEY = "metrics:counters";     // hash: messages_produced, cache_hits, ...
const REQUESTS_KEY = "metrics:requests";     // hash: <instanceId> -> request count
const TOPIC = "chat-messages";

// Fire-and-forget increment (never let metrics break a request path).
export async function incrMetric(field, by = 1) {
  try {
    await redisCache.hIncrBy(COUNTERS_KEY, field, by);
  } catch {
    /* metrics are best-effort */
  }
}

export async function incrInstanceRequest(instanceId) {
  try {
    await redisCache.hIncrBy(REQUESTS_KEY, instanceId, 1);
  } catch {
    /* best-effort */
  }
}

export async function getCounters() {
  const raw = (await redisCache.hGetAll(COUNTERS_KEY)) || {};
  const num = (k) => Number(raw[k] || 0);
  const hits = num("cache_hits");
  const misses = num("cache_misses");
  const totalReads = hits + misses;
  return {
    messages_produced: num("messages_produced"),
    messages_persisted: num("messages_persisted"),
    cache_hits: hits,
    cache_misses: misses,
    cache_hit_ratio: totalReads ? +(hits / totalReads).toFixed(3) : null,
  };
}

export async function getInstanceRequests() {
  return (await redisCache.hGetAll(REQUESTS_KEY)) || {};
}

export async function getOnlineCount() {
  try {
    return await redisCache.sCard("global_online_users");
  } catch {
    return 0;
  }
}

// Consumer lag = how far behind a group is on the topic.
//   lag(partition) = latestOffset - committedOffset
// A steadily growing lag means the worker can't keep up with producers.
export async function getConsumerLag(groupId) {
  try {
    const [latest, committed] = await Promise.all([
      admin.fetchTopicOffsets(TOPIC), // [{partition, offset (high watermark)}]
      admin.fetchOffsets({ groupId, topics: [TOPIC] }),
    ]);

    const latestByPartition = Object.fromEntries(
      latest.map((p) => [p.partition, Number(p.offset)])
    );

    let totalLag = 0;
    const committedParts = committed[0]?.partitions || [];
    for (const { partition, offset } of committedParts) {
      const high = latestByPartition[partition] ?? 0;
      const cur = Number(offset); // -1 means "no committed offset yet"
      const behind = cur < 0 ? high : high - cur;
      totalLag += Math.max(0, behind);
    }
    return totalLag;
  } catch {
    return null; // e.g. group hasn't committed yet / admin not ready
  }
}
