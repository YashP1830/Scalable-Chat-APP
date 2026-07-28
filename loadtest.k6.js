// ===========================================================================
// k6 load test for the ChatAppScalable API (Kafka + Redis + Mongo path)
//
// Run against your deployed VM:
//     k6 run -e BASE_URL=http://<VM_PUBLIC_IP> loadtest.k6.js
//
// ⚠️  ArcJet must be in DRY_RUN or k6 gets blocked as a bot / rate-limited.
//     Launch the stack with:  ARCJET_MODE=DRY_RUN docker compose -f docker-compose.prod.yml up -d
//
// What it exercises per iteration:
//   • POST /api/message/send/:id   → Kafka producer + Redis cache append + socket emit
//   • GET  /api/message/:id        → Redis cache read (the fast path)
//   • GET  /api/message/contacts   → Mongo read
// The db-worker draining Kafka into Mongo is observable via its logs.
// ===========================================================================
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost";

// Custom metric so you can see send-latency separately from reads.
const sendTrend = new Trend("msg_send_duration", true);

// SMOKE mode (set -e SMOKE=1) does a tiny 10s / 3-VU run so you can confirm the
// target is reachable and auth works before the real 3-minute ramp.
const SMOKE = __ENV.SMOKE === "1" || __ENV.SMOKE === "true";

export const options = SMOKE
  ? {
      vus: 3,
      duration: "10s",
      thresholds: {
        http_req_failed: ["rate<0.10"],
      },
    }
  : {
      scenarios: {
        ramp: {
          executor: "ramping-vus",
          startVUs: 0,
          stages: [
            { duration: "30s", target: 20 }, // warm up
            { duration: "1m", target: 50 }, // steady load
            { duration: "1m", target: 100 }, // push it
            { duration: "30s", target: 0 }, // ramp down
          ],
          gracefulRampDown: "10s",
        },
      },
      thresholds: {
        http_req_failed: ["rate<0.02"], // <2% errors
        http_req_duration: ["p(95)<800"], // 95% of requests under 800ms
        msg_send_duration: ["p(95)<600"],
      },
    };

// Two fixed accounts. Try login first; sign up if they don't exist yet.
const SENDER = { fullName: "Load Sender", email: "load_sender@test.dev", password: "loadtest123" };
const RECEIVER = { fullName: "Load Receiver", email: "load_receiver@test.dev", password: "loadtest123" };

function authenticate(user) {
  const headers = { "Content-Type": "application/json" };

  // Try login.
  let res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify(user), { headers });

  // If the account doesn't exist yet, create it.
  if (res.status !== 200) {
    res = http.post(`${BASE_URL}/api/auth/signup`, JSON.stringify(user), { headers });
  }

  if (res.status !== 200 && res.status !== 201) {
    throw new Error(
      `Auth failed for ${user.email}: ${res.status} ${res.body}. ` +
        `Is ARCJET_MODE=DRY_RUN? Is the API up?`
    );
  }

  // Pull the jwt out of Set-Cookie and pass it manually — this survives the
  // cookie's Secure flag over plain HTTP (k6's jar would otherwise drop it).
  const jwt = res.cookies?.jwt?.[0]?.value;
  if (!jwt) throw new Error(`No jwt cookie returned for ${user.email}`);

  const body = res.json();
  return { userId: body._id, cookie: `jwt=${jwt}` };
}

// setup() runs ONCE before the load; return value is passed to every VU.
export function setup() {
  const sender = authenticate(SENDER);
  const receiver = authenticate(RECEIVER);
  console.log(`✅ setup complete — sender=${sender.userId} receiver=${receiver.userId}`);
  return { sender, receiver };
}

export default function (data) {
  const { sender, receiver } = data;
  const authHeaders = {
    headers: { "Content-Type": "application/json", Cookie: sender.cookie },
  };

  // 1. Send a message (the write path: Kafka + Redis + socket).
  const sendRes = http.post(
    `${BASE_URL}/api/message/send/${receiver.userId}`,
    JSON.stringify({ text: `k6 msg ${Date.now()} from VU${__VU}-${__ITER}` }),
    authHeaders
  );
  sendTrend.add(sendRes.timings.duration);
  check(sendRes, { "send 201": (r) => r.status === 201 });

  // 2. Read the conversation back (the Redis fast path).
  const histRes = http.get(`${BASE_URL}/api/message/${receiver.userId}`, authHeaders);
  check(histRes, { "history 200": (r) => r.status === 200 });

  // 3. Occasionally hit contacts (a Mongo read) — ~1 in 5 iterations.
  if (__ITER % 5 === 0) {
    const contactsRes = http.get(`${BASE_URL}/api/message/contacts`, authHeaders);
    check(contactsRes, { "contacts 200": (r) => r.status === 200 });
  }

  sleep(Math.random() * 1 + 0.5); // 0.5–1.5s think time
}
