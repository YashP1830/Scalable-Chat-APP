import mongoose from "mongoose";
import cloudinary from "../lib/cloudinary.js";
import { io } from "../lib/socket.js";
import Message from "../models/message.js";
import { User } from "../models/User.js";
import { producer } from "../lib/kafka.js";
import {
  redisCache,
  getChatKey,
  CHAT_CACHE_TTL_SECONDS,
} from "../lib/redis.js";

export const getAllContacts = async (req, res) => {
  try {
    const loggedInuser = req.user._id;
    const filterUserById = await User.find({
      _id: { $ne: loggedInuser },
    }).select("-password");

    res.status(200).json(filterUserById);
  } catch (error) {
    console.log("Error in Getting Contacts", error);
    return res.status(500).json({ mesaage: "Internal Server Error" });
  }
};

// ---------------------------------------------------------------------------
// Cache model
// ---------------------------------------------------------------------------
// Each conversation is a Redis LIST of JSON-encoded messages (oldest → newest).
// A LIST (not a single JSON blob) is what makes sends resilient: appending a
// new message is an atomic RPUSH, so we never lose a concurrent write.
//
// hydrateChatCache() loads the full history from Mongo into the list ONCE when
// the cache is cold, so appending later can never produce a partial history.
async function hydrateChatCache(chatKey, myId, otherId) {
  const history = await Message.find({
    $or: [
      { senderId: myId, receiverId: otherId },
      { senderId: otherId, receiverId: myId },
    ],
  }).sort({ createdAt: 1 });

  // Rebuild the list atomically: clear, push all, then set the TTL.
  const multi = redisCache.multi();
  multi.del(chatKey);
  if (history.length > 0) {
    multi.rPush(
      chatKey,
      history.map((m) => JSON.stringify(m))
    );
  }
  await multi.exec();
  if (history.length > 0)
    await redisCache.expire(chatKey, CHAT_CACHE_TTL_SECONDS);

  return history;
}

export const getAllChatByUserId = async (req, res) => {
  try {
    const myId = req.user._id.toString();
    const { id: UserToChat } = req.params;
    const chatKey = getChatKey(myId, UserToChat);

    // ⚡ Fast lane: read the whole conversation straight out of the Redis list.
    const cachedLen = await redisCache.lLen(chatKey);
    if (cachedLen > 0) {
      const raw = await redisCache.lRange(chatKey, 0, -1);
      console.log("⚡ Serving chat history from Redis Cache");
      return res.status(200).json(raw.map((s) => JSON.parse(s)));
    }

    // 🐢 Slow lane: cache is cold → hydrate it from Mongo and return.
    console.log("🐢 Serving chat history from MongoDB");
    const history = await hydrateChatCache(chatKey, myId, UserToChat);
    res.status(200).json(history);
  } catch (error) {
    console.log("Not able to get chats", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { image, text } = req.body;
    const senderId = req.user._id;
    const { id: receiverId } = req.params;

    if (!text && !image) {
      return res.status(400).json({ message: "Text or image is required." });
    }
    if (senderId.equals(receiverId)) {
      return res
        .status(400)
        .json({ message: "Cannot send messages to yourself." });
    }
    const receiverExists = await User.exists({ _id: receiverId });
    if (!receiverExists) {
      return res.status(404).json({ message: "Receiver not found." });
    }

    let imageUrl = "";
    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    // Build the message with a stable _id up front. The SAME _id flows to
    // Kafka → Mongo, to the socket, to the cache, and back to the sender, so
    // every layer agrees on identity (and the worker can upsert idempotently).
    const message = {
      _id: new mongoose.Types.ObjectId().toString(),
      senderId: senderId.toString(),
      receiverId: receiverId.toString(),
      text: text || "",
      image: imageUrl,
      status: "sent",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 1. Durably persist to the Redis cache RIGHT NOW.
    //    This is the fix for "message disappears on refresh when db-worker is
    //    off": reads are served from this cache, so the message survives a
    //    refresh regardless of whether the DB worker is running.
    const chatKey = getChatKey(senderId, receiverId);
    try {
      // Make sure the full history exists before appending, so a cold cache
      // never ends up holding only this one message.
      if ((await redisCache.exists(chatKey)) === 0) {
        await hydrateChatCache(
          chatKey,
          senderId.toString(),
          receiverId.toString()
        );
      }
      await redisCache.rPush(chatKey, JSON.stringify(message));
      await redisCache.expire(chatKey, CHAT_CACHE_TTL_SECONDS);
    } catch (cacheErr) {
      console.error("⚠️ Cache append failed (non-fatal):", cacheErr);
    }

    // 2. Hand off to Kafka for the durable DB write (done by the db-worker).
    await producer.send({
      topic: "chat-messages",
      messages: [{ key: chatKey, value: JSON.stringify(message) }],
    });

    // 3. Push to the receiver in real time (they dedupe by _id on the client).
    io.to(receiverId.toString()).emit("newMessage", message);

    // 4. Ack the sender.
    res.status(201).json(message);
  } catch (error) {
    console.error("❌ sendMessage failed:", error);
    res.status(500).json({ message: "Failed to send message" });
  }
};

export const getChatPartener = async (req, res) => {
  try {
    const loggedInuser = req.user._id;

    const mesaage = await Message.find({
      $or: [{ senderId: loggedInuser }, { receiverId: loggedInuser }],
    });

    const chatPartenerId = [
      ...new Set(
        mesaage.map((msg) =>
          msg.senderId.toString() === loggedInuser.toString()
            ? msg.receiverId.toString()
            : msg.senderId.toString(),
        ),
      ),
    ];

    const chatParteners = await User.find({
      _id: { $in: chatPartenerId },
    }).select("-password");

    return res.status(200).json(chatParteners);
  } catch (error) {
    console.log("Error in getChat Partener controller", error);
    return res.status(500).json({ mesaage: "Interenalserver error" });
  }
};
