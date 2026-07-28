# Kafka — Deep Guide, Grounded in ChatAppScalable

A study reference that explains Kafka concepts **and** points at the exact lines
in this project where each concept lives. Use the last section for interview prep.

---

## PART 1 — THE MENTAL MODEL

### Kafka is a distributed, append-only commit log

The single most important reframe: **Kafka is not a queue. It is a log.**

A traditional queue (RabbitMQ, SQS) is like a to-do list — a consumer takes a
task, acknowledges it, and the task is **deleted**.

Kafka is like a **ledger / diary**. Producers append entries to the end. Nothing
is deleted when read. Each consumer independently keeps a **bookmark** (an
*offset*) of how far they've read. Ten different consumers can read the same
entries at their own pace, and any of them can rewind.

Everything else about Kafka follows from this one design choice:
- Replay is possible → because data isn't deleted on read.
- Multiple independent consumers → because each holds its own bookmark.
- Huge throughput → because appending to a file sequentially is extremely fast.

---

## PART 2 — THE CORE VOCABULARY

### Broker
A single Kafka **server process**. It stores partition data on disk and serves
producers/consumers.

> **In this project:** the `kafka` service in `docker-compose.yml`
> (`container_name: kafka-broker`). We run exactly **one** broker.

### Cluster
A group of brokers working together. Data is spread across them and replicated
between them. A cluster is what gives Kafka fault tolerance and horizontal scale.

> **In this project:** our "cluster" is a single broker — fine for development,
> but it is a **single point of failure**. Be honest about this in interviews
> (see the Weaknesses section).

### Topic
A named stream/category of messages. Like a table name, or a folder.

> **In this project:** one topic — `"chat-messages"`. Every chat message
> published by the API goes here (`message.controller.js`), and both workers
> read from it.

### Partition
A topic is split into one or more **partitions**. A partition is the actual
append-only log file on disk. This is the unit of parallelism **and** ordering.

This is very close to **database sharding** — you already know this concept.
Splitting a topic into partitions lets you spread load across brokers, exactly
like sharding spreads rows across database nodes.

**Two rules you must know cold:**
1. Kafka guarantees ordering **only within a single partition** — never across
   partitions.
2. A partition is consumed by **exactly one consumer** within a consumer group.
   → Therefore: **max parallelism in a group = number of partitions.**
   10 partitions + 20 consumers = 10 consumers sit idle doing nothing.

### Offset
A monotonically increasing ID of a message *within a partition* (0, 1, 2, 3…).
A consumer's progress is just "group X has read up to offset N on partition P."
Offsets are stored by Kafka itself in an internal topic (`__consumer_offsets`).

### Producer
Writes messages to a topic.

> **In this project:** `lib/kafka.js` exports `producer`; every API instance
> connects it at boot (`server.js` → `connectKafkaProducer()`), and
> `sendMessage()` in `message.controller.js` calls `producer.send()`.

### Consumer & Consumer Group
A consumer reads messages. A **consumer group** is a set of consumers that
cooperate to split the work of a topic — Kafka assigns each partition to one
member of the group.

**The critical rule:** each consumer *group* gets its **own independent copy** of
every message. Two consumers in the *same* group split the messages between them
(load balancing). Two consumers in *different* groups each receive **all**
messages (fan-out / broadcast).

> **In this project — this is the key design point:**
> - `"chat-db-workers"` (in `lib/kafka.js`) → the DB worker, persists to MongoDB.
> - `"chat-analytics-workers"` (in `analytics-worker.js`) → counts message
>   velocity per user.
>
> Because these are **different group IDs**, both workers independently receive
> **every** message. One message → saved to Mongo **and** counted by analytics.
> If they had shared a group ID, each message would go to only *one* of them and
> the app would break in a very confusing way.

### Message Key & Partitioning
When you send a message you may include a **key**. Kafka hashes the key to pick
a partition: `partition = hash(key) % numPartitions`. Same key → always the same
partition → **guaranteed ordering for that key**. No key → round-robin.

> **In this project:** we send with `key: chatKey` where `chatKey` is the sorted
> pair of user IDs (`getChatKey()` in `lib/redis.js`). This means **every message
> in a given conversation lands on the same partition**, so those messages are
> processed in the exact order they were sent — even after we scale to many
> partitions. Messages from *different* conversations may interleave, which is
> fine; we only care about order within a conversation.
>
> This is a strong interview talking point: *"I keyed by conversation ID so
> per-conversation ordering survives partition scaling."*

### Replication (Leader / Follower / ISR)
Each partition has one **leader** and N-1 **followers** on other brokers.
Producers/consumers talk to the leader; followers copy its data. Replicas that
are caught up are the **ISR** (In-Sync Replicas). If the leader dies, an ISR
member is promoted — that's Kafka's fault tolerance.

- `replication.factor` = how many copies exist.
- `min.insync.replicas` = how many must confirm before a write is accepted.
- Producer `acks`: `0` (fire & forget), `1` (leader only), `all`/`-1` (all ISR —
  safest). **kafkajs defaults to `acks: -1` (all)**, which is what we use.

> **In this project:** `KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1` — one copy,
> because we have one broker. Production would use 3 brokers, RF=3, and
> `min.insync.replicas=2`.

### Retention
Kafka deletes data by **policy**, not by consumption. Default retention is
**7 days** (`log.retention.hours=168`) or by size. There's also **log
compaction**, which keeps only the *latest* value per key (useful for
"current state" topics).

> **In this project:** retention is why we could **replay** messages that were
> lost by the buggy worker — they were still sitting in the log even though the
> consumer had already moved past them.

---

## PART 3 — KRAFT vs ZOOKEEPER

### The old way: ZooKeeper
Historically Kafka could not run alone. It needed **Apache ZooKeeper**, a
separate distributed coordination service, to store cluster metadata: which
brokers are alive, who leads each partition, topic configs, ACLs, and to run
**controller election**.

Problems: two systems to deploy/tune/monitor, metadata was a scaling bottleneck
(partition counts capped in the low tens of thousands), and failover/restart was
slow because the controller had to read a lot of state out of ZooKeeper.

### The new way: KRaft (Kafka Raft)
Kafka now manages its **own** metadata using the **Raft** consensus algorithm —
no ZooKeeper. Metadata is stored in an internal Kafka topic
(`__cluster_metadata`) that a quorum of **controllers** replicates among
themselves. Timeline: introduced in 2.8 (preview), production-ready in 3.3,
and **ZooKeeper support was fully removed in Kafka 4.0**.

Benefits: one system instead of two, much faster controller failover and
startup, and scales to millions of partitions.

**Roles in KRaft:** a node can be a `broker` (stores data), a `controller`
(manages metadata/quorum), or **both** ("combined mode", for small deployments).

> **In this project — read your `docker-compose.yml`:**
> ```yaml
> KAFKA_PROCESS_ROLES: broker,controller      # combined mode: one node does both
> KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093  # the controller quorum = just itself
> KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
> KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
> ```
> **There is no ZooKeeper container anywhere in this stack** — that alone proves
> we're running KRaft. Note the *two* ports: `9092` for normal client traffic,
> `9093` reserved for controller-to-controller quorum traffic.
>
> If an interviewer asks "do you use ZooKeeper?" the answer is:
> *"No — we run KRaft mode, combined broker+controller, which is the modern
> default since ZooKeeper was removed in Kafka 4.0."*

### Listeners & Advertised Listeners (a classic Docker gotcha)
`KAFKA_LISTENERS` = what the broker binds to locally.
`KAFKA_ADVERTISED_LISTENERS` = the address the broker **tells clients to use**.

> **In this project:** `KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092`.
> `kafka` is the Docker Compose **service name**, resolvable on the internal
> Docker network. That's why every service sets `KAFKA_BROKER=kafka:9092`.
>
> This is exactly why the analytics worker was broken: it hard-coded
> `brokers: ["localhost:9092"]`, and inside a container `localhost` is *that
> container itself*, not the broker. Classic Kafka-in-Docker bug.

---

## PART 4 — DELIVERY SEMANTICS (very common interview topic)

| Semantic | Meaning | Cost |
|---|---|---|
| **At-most-once** | Commit offset *before* processing. Crash = message lost. | Fast, lossy |
| **At-least-once** | Process *then* commit. Crash = message reprocessed → **duplicates**. | Default, safe, needs idempotency |
| **Exactly-once (EOS)** | Transactions + idempotent producer. | Complex, slower, Kafka-to-Kafka only |

**Kafka's practical default is at-least-once.** So consumers must be
**idempotent** — safe to run twice with the same result.

> **In this project:** `worker.js` uses an idempotent upsert:
> ```js
> await Message.updateOne({ _id }, { $setOnInsert: rest }, { upsert: true, timestamps: false });
> ```
> The `_id` is generated **in the API** (`message.controller.js`) *before*
> publishing, so the same logical message always has the same `_id` through
> Kafka → Mongo. Replaying the topic therefore cannot create duplicates —
> `$setOnInsert` writes only on first insert.
>
> This is the textbook answer to *"how do you handle Kafka's duplicate
> delivery?"* — **idempotent writes keyed by a producer-generated ID.**

### ⚠️ The real bug we hit — a perfect interview story
The worker's `eachMessage` wrapped everything in `try/catch` and only logged
errors. When the Mongo write failed (a `ConflictingUpdateOperators` error from
`updatedAt` appearing in both `$set` and `$setOnInsert`), the handler still
**returned successfully** — so kafkajs **committed the offset** and moved on.

Result: the consumer looked perfectly healthy, logs looked fine, and **every
message was silently dropped**. At-least-once delivery was effectively turned
into *at-most-once* by a swallowed exception.

**Lessons (say these out loud in an interview):**
1. Don't swallow exceptions in a consumer — if you can't process it, **rethrow**
   so the offset isn't committed, or route to a **Dead Letter Queue (DLQ)**.
2. Silent consumer failure is the most dangerous failure mode in event systems.
3. Monitor **consumer lag**, not just "is the process alive."

### Consumer Lag
`lag = latest offset in partition − consumer's committed offset`.
It is *the* health metric for a Kafka consumer: lag growing = you're falling
behind and need more consumers/partitions. Check it with:
```bash
docker exec kafka-broker /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --describe --group chat-db-workers
```

### Rebalancing, Heartbeats, Poll
Consumers send **heartbeats** to prove liveness. If none arrive within
`sessionTimeout`, the group **rebalances** (partitions reassigned). If processing
one batch takes longer than `max.poll.interval.ms`, the consumer is kicked out —
a common cause of "my consumer keeps restarting" loops.

> **In this project:** `lib/kafka.js` sets `sessionTimeout: 30000` and
> `heartbeatInterval: 3000` in `createConsumer()`, giving the group room to
> rebalance without kicking a slow consumer.

---

## PART 5 — HOW A MESSAGE FLOWS THROUGH THIS PROJECT

Trace it end to end — this is what to whiteboard in an interview:

```
Browser (sender)
   │  POST /api/message/send/:id
   ▼
nginx (load balancer, ip_hash)
   │
   ▼
chat-api-1 / 2 / 3   ← sendMessage() in message.controller.js
   │
   ├─1─► Generate stable _id + timestamps
   ├─2─► Redis: RPUSH into chat:<idA>_<idB>   (durable read cache — instant)
   ├─3─► Kafka: producer.send({ topic:"chat-messages", key: chatKey, value })
   ├─4─► Socket.IO: io.to(receiverId).emit("newMessage")  (via Redis adapter)
   └─5─► HTTP 201 back to sender
                     │
        ┌────────────┴─────────────┐
        ▼                          ▼
  group: chat-db-workers    group: chat-analytics-workers
  (worker.js)               (analytics-worker.js)
        │                          │
   idempotent upsert          in-memory velocity counts
   into MongoDB               (spam detection hook)
```

**Why the response returns at step 5, not after Mongo:** the user's perceived
latency is decoupled from database speed. The API's job ends once the message is
safely in Kafka (durable) and Redis (readable) — Mongo catches up asynchronously.

**Why messages survive with the DB worker off:** reads are served from the Redis
list (step 2), and the Kafka log (step 3) holds the message until the worker
comes back and drains the backlog. Nothing is lost; persistence is just delayed.

---

## PART 6 — INTERVIEW QUESTIONS & STRONG ANSWERS

### Q: Why did you use Kafka at all? Why not just write to MongoDB directly?
Three reasons:
1. **Latency decoupling.** Mongo (Atlas, over the network) is the slowest hop in
   the request. Publishing to Kafka is a fast local append; the user gets their
   201 immediately instead of waiting on a remote DB round-trip.
2. **Burst absorption / back-pressure.** Under a traffic spike, a direct-write
   design pushes every write straight at the DB and it becomes the bottleneck
   (connection pool exhaustion, timeouts, dropped messages). Kafka acts as a
   **buffer** — it absorbs the spike and the worker drains at a sustainable rate.
3. **Decoupling & extensibility.** The write path doesn't know or care who
   consumes it. I added an analytics consumer **without touching the API code at
   all** — just a new consumer group. Tomorrow I could add search indexing,
   moderation, or push notifications the same way.

Plus **durability with replay**: if the DB is down, messages queue in Kafka
instead of being lost, and the log can be replayed to rebuild state.

### Q: Why Kafka specifically, and not RabbitMQ / Redis Pub-Sub / a job queue?
- **vs RabbitMQ:** RabbitMQ is a *broker* — messages are deleted once acked, and
  it excels at complex routing and per-task work queues. But I needed **multiple
  independent consumers reading the same stream** and the ability to **replay
  history**. Kafka's retained log gives me both natively; in RabbitMQ I'd need
  fan-out exchanges with duplicate queues and I'd still have no replay.
- **vs Redis Pub/Sub:** it's fire-and-forget with **no persistence** — if a
  subscriber is offline, the message is gone forever. That's unacceptable for
  message persistence. (Note: I *do* use Redis Pub/Sub — via the Socket.IO Redis
  adapter — but only for **live** fan-out across API instances, where losing a
  message just means the client reloads it from the cache.)
- **vs BullMQ/SQS:** these are task queues, not ordered replayable logs. No
  per-key ordering, no consumer-group fan-out semantics.

**One-line version:** *"I needed a durable, replayable, multi-consumer log —
that's Kafka's exact shape. The others are queues, not logs."*

### Q: Why Kafka for the DB entry specifically?
Because message persistence is the one operation that must be **durable but not
synchronous**. The user needs to *see* their message instantly (Redis + socket
handle that), but it only needs to be *in Mongo* eventually. Kafka is the
durable hand-off between those two timelines. It also means a **MongoDB outage
degrades instead of breaks** the app — messages keep flowing and persist later.

### Q: How do you guarantee message ordering?
Kafka only guarantees order **within a partition**, so I made ordering
deterministic by **keying on the conversation** (`chatKey` = sorted user-ID
pair). Every message in one conversation hashes to the same partition, so it's
consumed in send order. Cross-conversation ordering doesn't matter for a chat
app, which is why this scales cleanly to N partitions.

### Q: How do you handle duplicate messages / at-least-once delivery?
I make the consumer **idempotent**. The `_id` is generated in the API *before*
publishing, so it travels with the message. The worker does
`updateOne({_id}, {$setOnInsert: …}, {upsert:true})` — replaying the same
message is a no-op. `$setOnInsert` (rather than `$set`) also protects fields
mutated later by other flows, like a message's `delivered`/`read` status.

### Q: Why two consumer groups?
Because consumer groups define **fan-out vs load-balancing**. Different group IDs
(`chat-db-workers` vs `chat-analytics-workers`) mean each gets its own copy of
every message and its own offsets — so analytics can't slow down or interfere
with persistence, and either can be restarted/replayed independently. If they
shared a group ID they'd *split* messages and each would only see half.

### Q: What happens if the DB worker crashes?
Nothing is lost. The API keeps publishing to Kafka and messages stay readable
from the Redis cache, so users don't notice. Kafka retains the backlog; when the
worker restarts it resumes from its **last committed offset** and drains
everything. I tested exactly this: stop `db-worker`, send messages, refresh —
messages persist; restart the worker and they land in Mongo.

### Q: How would you scale this?
1. **Increase partitions** on `chat-messages` (parallelism is capped by partition
   count).
2. **Run more workers in the same group** — Kafka auto-assigns partitions to
   them. N partitions → up to N parallel workers.
3. **Add brokers**, set `replication.factor=3`, `min.insync.replicas=2`,
   `acks=all` for real HA.
4. **Batch the DB writes** in the worker (`eachBatch` instead of `eachMessage`)
   to cut round-trips to Mongo.
5. Monitor **consumer lag** to decide when to scale out.

### Q: What are the weaknesses of your current setup? (Be honest — this scores well)
- **Single broker, replication factor 1** → a genuine single point of failure and
  no redundancy. Fine for a dev/demo, not production.
- **Default partition count** → effectively no consumer parallelism yet; only one
  worker in the group can do work.
- **No Dead Letter Queue.** A permanently-bad message is logged and skipped —
  which is exactly how I lost writes when a Mongo error was swallowed. A DLQ +
  rethrow-on-failure is the correct fix.
- **No schema/versioning** (raw JSON). A Schema Registry with Avro/Protobuf would
  prevent producer/consumer drift.
- **No consumer-lag monitoring/alerting** yet.
- **Analytics state is in-memory** (`Map`), so counts reset on restart — it
  should write to Redis or a store.

### Q: What is KRaft and why does it matter here?
KRaft replaces ZooKeeper by letting Kafka manage its own metadata via the Raft
consensus protocol, stored in an internal metadata topic. It means one system to
operate instead of two, far faster controller failover, and support for vastly
more partitions. ZooKeeper was removed entirely in Kafka 4.0. **This project runs
KRaft in combined broker+controller mode** — visible in `docker-compose.yml` via
`KAFKA_PROCESS_ROLES: broker,controller` and the absence of any ZooKeeper service.

### Q: Producer `acks` — what do you use?
kafkajs defaults to `acks: -1` ("all"), meaning the leader waits for all in-sync
replicas before acknowledging — the safest setting. With a single broker that's
effectively `acks=1`. In production with RF=3 and `min.insync.replicas=2`, this
is what prevents data loss on a broker failure.

---

## PART 7 — USEFUL COMMANDS (for demos & debugging)

```bash
# List topics
docker exec kafka-broker /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --list

# Describe a topic (partitions, leader, replicas, ISR)
docker exec kafka-broker /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --describe --topic chat-messages

# Consumer groups + LAG (the health metric)
docker exec kafka-broker /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --describe --group chat-db-workers

# Watch raw messages arrive live
docker exec kafka-broker /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 --topic chat-messages --from-beginning

# Replay: reset a group to the start (consumer must be STOPPED first)
docker exec kafka-broker /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --group chat-db-workers \
  --reset-offsets --to-earliest --topic chat-messages --execute

# Add partitions (can only ever increase)
docker exec kafka-broker /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --alter --topic chat-messages --partitions 3
```

---

## PART 8 — 60-SECOND SUMMARY TO MEMORIZE

> "Kafka is a distributed, append-only commit log. Producers append to **topics**,
> which are split into **partitions** — the unit of both parallelism and
> ordering. Consumers track their own **offset**, and because data is retained
> rather than deleted on read, multiple **consumer groups** can independently
> read and replay the same stream.
>
> In my chat app, the API publishes each message to the `chat-messages` topic
> keyed by conversation ID, so per-conversation order is preserved. Two consumer
> groups read it independently: one persists to MongoDB, one does analytics.
> This decouples user-facing latency from database speed, absorbs traffic spikes,
> and means a database outage delays persistence instead of losing messages.
> Delivery is at-least-once, so the DB writer is **idempotent** — it upserts on a
> producer-generated `_id`. The cluster runs in **KRaft** mode, so there's no
> ZooKeeper."
