import cloudinary from "../lib/cloudinary.js";
import { io } from "../lib/socket.js"; // ✅ Removed getReceiverSocketId
import Message from "../models/message.js";
import { User } from "../models/User.js";
import { producer } from "../lib/kafka.js";
import { redisCache } from "../lib/redis.js";   

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

export const getAllChatByUserId = async (req, res) => {
  try {
    const myId = req.user._id.toString(); 
    const { id: UserToChat } = req.params;

    // 1. Create a unique, predictable string for the Redis Key
    // Sorting ensures that Alice+Bob creates the exact same key as Bob+Alice
    const chatKey = `chat:${[myId, UserToChat].sort().join("_")}`;

    // 2. ⚡ CHECK REDIS FIRST (The Fast Lane)
    const cachedChat = await redisCache.get(chatKey);
    
    if (cachedChat) {
      console.log("⚡ Serving chat history from Redis Cache");
      return res.status(200).json(JSON.parse(cachedChat));
    }

    // 3. 🐢 FALLBACK TO MONGODB (The Slow Lane)
    console.log("🐢 Serving chat history from MongoDB");
    const message = await Message.find({
      $or: [
        { senderId: myId, receiverId: UserToChat },
        { senderId: UserToChat, receiverId: myId },
      ],
    }).sort({ createdAt: 1 }); // 👈 Ensures messages are strictly chronological

    // 4. 💾 SAVE TO REDIS FOR NEXT TIME (Set to expire in 1 hour)
    await redisCache.set(chatKey, JSON.stringify(message), { EX: 3600 });

    res.status(200).json(message);
  } catch (error) {
    console.log("Not able to get chats", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const sendMessage = async (req, res) => {
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

  let imageUrl;
  if (image) {
    const uploadResponse = await cloudinary.uploader.upload(image);
    imageUrl = uploadResponse.secure_url;
  }

  // THE NEW WAY (Lightning Fast)
  const newMessage = new Message({
    senderId,
    receiverId,
    text,
    image,
  });
  newMessage.createdAt = new Date();
  // 1. Instantly throw the message onto the Kafka conveyor belt
  await producer.send({
    topic: "chat-messages",
    messages: [{ value: JSON.stringify(newMessage) }],
  });

  // 2. Broadcast to Redis immediately so the user sees it instantly
  io.to(receiverId.toString()).emit("newMessage", newMessage);

  // 3. Respond to the API request
  res.status(201).json(newMessage);
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
