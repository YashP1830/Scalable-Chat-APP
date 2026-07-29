
import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // DM target. Required ONLY for 1-to-1 messages (i.e. when there's no group).
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return !this.groupId;
      },
    },
    // Set for group messages instead of receiverId.
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
      index: true,
    },
    // Denormalized sender display name — used to label messages in group chats
    // without populating on every read.
    senderName: {
      type: String,
      default: "",
    },
    text: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    image: {
      type: String,
      default: ""
    },
    // WhatsApp-style delivery lifecycle:
    //   sent      → server accepted it            (single grey tick)
    //   delivered → receiver's device received it (double grey tick)
    //   read      → receiver opened the chat       (double blue tick)
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
  },
  { timestamps: true }
);

const Message = mongoose.model("Message", messageSchema);

export default Message;
