import jwt from "jsonwebtoken";
import cookie from "cookie";
import { User } from "../models/User.js";

export const socketAuthMiddleware = async (socket, next) => {
  try {
    console.log("🟡 Socket auth middleware hit");

    const rawCookie = socket.handshake.headers.cookie;
    if (!rawCookie) {
      console.log("❌ No cookies in handshake");
      return next(new Error("Unauthorized"));
    }

    const cookies = cookie.parse(rawCookie);
    const token = cookies.jwt;

    if (!token) {
      console.log("❌ JWT cookie missing");
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
