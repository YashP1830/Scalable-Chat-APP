// Shared CORS origin logic for both Express (server.js) and Socket.IO
// (socket.js) so the two never drift out of sync.
//
// Why not just a static array of CLIENT_URL? Vercel gives every deployment
// its own unique preview URL (e.g. https://yash-chat-<hash>-<team>.vercel.app)
// IN ADDITION to the stable production alias (CLIENT_URL). Pinning to only
// CLIENT_URL means CORS breaks every time you push and Vercel builds a new
// preview — which is exactly what just happened. Since only your own Vercel
// account can deploy under your project, it's safe to allow any *.vercel.app
// origin broadly, plus your explicit CLIENT_URL and local dev ports.
const staticAllowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
  "http://localhost:5174",
].filter(Boolean);

export function isAllowedOrigin(origin) {
  // No Origin header = same-origin / non-browser request (curl, server-to-
  // server, health checks) — allow.
  if (!origin) return true;
  if (staticAllowedOrigins.includes(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return true;
  return false;
}

// cors() package expects (origin, callback) — this adapts the check above.
export function corsOriginCheck(origin, callback) {
  if (isAllowedOrigin(origin)) return callback(null, true);
  callback(new Error(`CORS blocked: origin "${origin}" is not allowed`));
}
