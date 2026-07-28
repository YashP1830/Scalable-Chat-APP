import arcjet, { shield, detectBot, slidingWindow } from "@arcjet/node";

// Mode is env-driven so we keep full protection in normal running but can flip
// everything to "DRY_RUN" (log-only, never blocks) for load testing — where k6
// has no browser UA and would otherwise be blocked as a bot / rate-limited.
//   ARCJET_MODE=LIVE      → enforce (default, production)
//   ARCJET_MODE=DRY_RUN   → log only, allow all (use while running k6)
const MODE = process.env.ARCJET_MODE === "DRY_RUN" ? "DRY_RUN" : "LIVE";

// Requests allowed per interval — raise this for load tests if you keep LIVE.
const RATE_MAX = Number(process.env.ARCJET_RATE_MAX) || 100;
const RATE_INTERVAL = Number(process.env.ARCJET_RATE_INTERVAL) || 60;

const aj = arcjet({
  // Set ARCJET_API_KEY as an environment variable rather than hard coding.
  key: process.env.ARCJET_API_KEY,
  rules: [
    // Shield protects your app from common attacks e.g. SQL injection.
    shield({ mode: MODE }),
    // Bot detection.
    detectBot({
      mode: MODE, // "LIVE" blocks, "DRY_RUN" only logs.
      allow: [
        "CATEGORY:SEARCH_ENGINE", // Google, Bing, etc
        // "CATEGORY:MONITOR",     // Uptime monitoring services
        // "CATEGORY:PREVIEW",     // Link previews e.g. Slack, Discord
      ],
    }),
    // Sliding-window rate limit.
    slidingWindow({
      mode: MODE,
      max: RATE_MAX,
      interval: RATE_INTERVAL,
    }),
  ],
});

console.log(
  `🛡️  ArcJet mode=${MODE} (rate ${RATE_MAX}/${RATE_INTERVAL}s)`
);

export { aj };
