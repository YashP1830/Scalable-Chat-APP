import mongoose from "mongoose";
import cloudinary from "../lib/cloudinary.js";
import { io } from "../lib/socket.js";
import Message from "../models/message.js";
import Group from "../models/Group.js";
import { User } from "../models/User.js";
import { producer } from "../lib/kafka.js";
import { redisCache, CHAT_CACHE_TTL_SECONDS } from "../lib/redis.js";
import { incrMetric } from "../lib/metrics.js";

const groupKey = (id) => `group:${id.toString()}`;
const groupRoom = (id) => `group:${id.toString()}`;

// Load a group's full history from Mongo into its Redis list (cold cache).
async function hydrateGroupCache(groupId) {
  const history = await Message.find({ groupId }).sort({ createdAt: 1 });
  const key = groupKey(groupId);
  const multi = redisCache.multi();
  multi.del(key);
  if (history.length > 0) {
    multi.rPush(key, history.map((m) => JSON.stringify(m)));
  }
  await multi.exec();
  if (history.length > 0) await redisCache.expire(key, CHAT_CACHE_TTL_SECONDS);
  return history;
}

// POST /api/group  — create a group (creator becomes admin + a member)
export const createGroup = async (req, res) => {
  try {
    const { name, memberIds } = req.body;
    const adminId = req.user._id;

    if (!name || !Array.isArray(memberIds) || memberIds.length < 1) {
      return res
        .status(400)
        .json({ message: "Group name and at least one member are required." });
    }

    const others = [...new Set(memberIds.map(String))].filter(
      (id) => id !== adminId.toString()
    );
    const validCount = await User.countDocuments({ _id: { $in: others } });
    if (validCount !== others.length) {
      return res.status(400).json({ message: "One or more members not found." });
    }

    const members = [adminId.toString(), ...others];
    const group = await Group.create({ name, admin: adminId, members });
    const populated = await Group.findById(group._id).populate(
      "members",
      "-password"
    );

    // Make every member's live sockets join the group room + refresh their list.
    for (const m of members) {
      io.in(m).socketsJoin(groupRoom(group._id));
      io.to(m).emit("addedToGroup", populated);
    }

    res.status(201).json(populated);
  } catch (error) {
    console.error("createGroup error:", error);
    res.status(500).json({ message: "Failed to create group" });
  }
};

// GET /api/group  — groups I belong to
export const getMyGroups = async (req, res) => {
  try {
    const groups = await Group.find({ members: req.user._id })
      .populate("members", "-password")
      .sort({ updatedAt: -1 });
    res.status(200).json(groups);
  } catch (error) {
    console.error("getMyGroups error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/group/:id  — single group (members)
export const getGroupById = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id).populate(
      "members",
      "-password"
    );
    if (!group) return res.status(404).json({ message: "Group not found" });
    if (!group.members.some((m) => m._id.toString() === req.user._id.toString()))
      return res.status(403).json({ message: "Not a member" });
    res.status(200).json(group);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/group/:id/messages
export const getGroupMessages = async (req, res) => {
  try {
    const myId = req.user._id.toString();
    const { id } = req.params;

    const group = await Group.findById(id).select("members");
    if (!group) return res.status(404).json({ message: "Group not found" });
    if (!group.members.map(String).includes(myId))
      return res.status(403).json({ message: "Not a member" });

    // Opening the group clears my unread badge for it.
    try {
      await redisCache.hSet(`unread:${myId}`, id, "0");
    } catch {
      /* non-fatal */
    }

    const key = groupKey(id);
    const len = await redisCache.lLen(key);
    if (len > 0) {
      incrMetric("cache_hits");
      const raw = await redisCache.lRange(key, 0, -1);
      return res.status(200).json(raw.map((s) => JSON.parse(s)));
    }
    incrMetric("cache_misses");
    const history = await hydrateGroupCache(id);
    res.status(200).json(history);
  } catch (error) {
    console.error("getGroupMessages error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// POST /api/group/:id/send
export const sendGroupMessage = async (req, res) => {
  try {
    const senderId = req.user._id;
    const { id } = req.params;
    const { text, image } = req.body;

    if (!text && !image)
      return res.status(400).json({ message: "Text or image is required." });

    const group = await Group.findById(id).select("members");
    if (!group) return res.status(404).json({ message: "Group not found" });
    const memberStrs = group.members.map(String);
    if (!memberStrs.includes(senderId.toString()))
      return res.status(403).json({ message: "Not a member" });

    let imageUrl = "";
    if (image) {
      const up = await cloudinary.uploader.upload(image);
      imageUrl = up.secure_url;
    }

    const message = {
      _id: new mongoose.Types.ObjectId().toString(),
      senderId: senderId.toString(),
      senderName: req.user.fullName,
      groupId: id,
      text: text || "",
      image: imageUrl,
      status: "sent",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Durable cache append (same resilience as DMs).
    const key = groupKey(id);
    try {
      if ((await redisCache.exists(key)) === 0) await hydrateGroupCache(id);
      await redisCache.rPush(key, JSON.stringify(message));
      await redisCache.expire(key, CHAT_CACHE_TTL_SECONDS);
    } catch (e) {
      console.error("group cache append failed:", e);
    }

    // Async DB persistence via Kafka (keyed by group so order is preserved).
    await producer.send({
      topic: "chat-messages",
      messages: [{ key, value: JSON.stringify(message) }],
    });
    incrMetric("messages_produced");

    // Real-time fan-out to everyone in the group room.
    io.to(groupRoom(id)).emit("newGroupMessage", message);

    // Bump unread for every member except the sender.
    for (const m of memberStrs) {
      if (m === senderId.toString()) continue;
      try {
        const n = await redisCache.hIncrBy(`unread:${m}`, id, 1);
        io.to(m).emit("unreadUpdate", { partnerId: id, count: n });
      } catch {
        /* non-fatal */
      }
    }

    res.status(201).json(message);
  } catch (error) {
    console.error("sendGroupMessage error:", error);
    res.status(500).json({ message: "Failed to send message" });
  }
};

// POST /api/group/:id/members  — admin only
export const addMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { memberId } = req.body;

    const group = await Group.findById(id);
    if (!group) return res.status(404).json({ message: "Group not found" });
    if (group.admin.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "Only the admin can add members." });

    if (!(await User.exists({ _id: memberId })))
      return res.status(404).json({ message: "User not found" });
    if (group.members.map(String).includes(memberId.toString()))
      return res.status(400).json({ message: "Already a member" });

    group.members.push(memberId);
    await group.save();
    const populated = await Group.findById(id).populate("members", "-password");

    // New member's sockets join the room; everyone gets the updated group.
    io.in(memberId.toString()).socketsJoin(groupRoom(id));
    io.to(memberId.toString()).emit("addedToGroup", populated);
    io.to(groupRoom(id)).emit("groupUpdated", populated);

    res.status(200).json(populated);
  } catch (error) {
    console.error("addMember error:", error);
    res.status(500).json({ message: "Failed to add member" });
  }
};
