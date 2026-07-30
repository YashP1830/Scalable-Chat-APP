import jwt from "jsonwebtoken";
import cookie from "cookie";
import { User } from "../models/User.js";

export const socketAuthMiddleware = async (socket, next) => {
  try {
    console.log("🟡 Socket auth middleware hit");

    // Prefer the token passed explicitly via Socket.IO's `auth` handshake
    // option (io(url, { auth: { token } })) — same reasoning as
    // auth.middleware.js: the cross-site cookie gets silently dropped in
    // Incognito / by third-party-cookie blocking, so the socket handshake
    // needs a cookie-independent way to authenticate too. Cookie stays as a
    // fallback for same-origin/local dev.
    let token = socket.handshake.auth?.token;

    if (!token) {
      const rawCookie = socket.handshake.headers.cookie;
      if (rawCookie) {
        const cookies = cookie.parse(rawCookie);
        token = cookies.jwt;
      }
    }

    if (!token) {
      console.log("❌ No token in handshake auth or cookies");
      return next(new Error("Unauthorized"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      console.log("❌ User not found");
      return next(new Error("Unauthorized"));
    }

    socket.user = user;
    socket.userId = user._id.toString();

    console.log(`✅ Socket authenticated: ${user.fullName}`);

    next();
  } catch (err) {
    console.log("❌ Socket auth error:", err.message);
    next(new Error("Unauthorized"));
  }
};
