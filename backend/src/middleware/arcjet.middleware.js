import {aj} from "../lib/arcjet.js";
import { isSpoofedBot } from "@arcjet/inspect";

export const arcjetProtection = async (req, res, next) => {
  // ARCJET_MODE=OFF fully bypasses the shield — no remote decision call at all.
  // Use this for load tests so you measure YOUR infra, not ArcJet's round-trip.
  // (DRY_RUN still calls ArcJet's cloud; OFF skips it entirely.)
  if (process.env.ARCJET_MODE === "OFF") return next();

  try {
    const decision = await aj.protect(req);

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        return res.status(429).json({ message: "Rate limit exceeded. Please try again later." });
      } else if (decision.reason.isBot()) {
        return res.status(403).json({ message: "Bot access denied." });
      } else {
        return res.status(403).json({
          message: "Access denied by security policy.",
        });
      }
    }

    // check for spoofed bots
    if (decision.results.some(isSpoofedBot)) {
      return res.status(403).json({
        error: "Spoofed bot detected",
        message: "Malicious bot activity detected.",
      });
    }

    next();
  } catch (error) {
    console.log("Arcjet Protection Error:", error);
    next();
  }
};