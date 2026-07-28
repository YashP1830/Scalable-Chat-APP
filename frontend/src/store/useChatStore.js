import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuth.stores.js";

export const useChatStore = create((set, get) => ({
  allContacts: [],
  chats: [],
  messages: [],
  activeTab: "chats",
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,
  isSoundEnabled: JSON.parse(localStorage.getItem("isSoundEnabled")) === true,

  toggleSound: () => {
    const nextState = !get().isSoundEnabled;
    localStorage.setItem("isSoundEnabled", nextState);
    set({ isSoundEnabled: nextState });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedUser: (selectedUser) => set({ selectedUser }),

  getAllContacts: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/message/contacts");
      set({ allContacts: res.data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch contacts");
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMyChatPartners: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/message/chats");
      set({ chats: res.data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch chats");
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessagesByUserId: async (userId) => {
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/message/${userId}`);
      set({ messages: res.data });

      // I've just opened this chat → everything the partner sent me is read.
      // Tell the server so their ticks turn blue (and it persists to Mongo).
      const socket = useAuthStore.getState().socket;
      socket?.emit("messageRead", { partnerId: userId });
    } catch (error) {
      toast.error(error.response?.data?.message || "Something went wrong");
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  sendMessage: async (messageData) => {
    const { selectedUser } = get();
    const { authUser } = useAuthStore.getState();

    if (!selectedUser) return;

    const tempId = `temp-${Date.now()}`;

    const optimisticMessage = {
      _id: tempId,
      senderId: authUser._id,
      receiverId: selectedUser._id,
      text: messageData.text,
      image: messageData.image,
      status: "sending",
      createdAt: new Date().toISOString(),
      isOptimistic: true,
    };

    // 1. Immediately append optimistic message to UI state
    set((state) => ({
      messages: [...state.messages, optimisticMessage],
    }));

    try {
      const res = await axiosInstance.post(
        `/message/send/${selectedUser._id}`,
        messageData
      );

      // 2. SWAP: replace the temp message with the real record (status "sent").
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg._id === tempId ? res.data : msg
        ),
      }));
    } catch (error) {
      // 3. ROLLBACK: remove ONLY the temp message.
      set((state) => ({
        messages: state.messages.filter((msg) => msg._id !== tempId),
      }));
      toast.error(error.response?.data?.message || "Failed to send message");
    }
  },

  subscribeToMessages: () => {
    const { selectedUser } = get();
    if (!selectedUser) return;

    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    const { authUser } = useAuthStore.getState();

    // Re-register cleanly to avoid stacked listeners when switching chats.
    socket.off("newMessage");
    socket.off("messageStatusUpdate");
    socket.off("messagesRead");

    // ── Incoming message (I'm the receiver) ──────────────────────────────
    socket.on("newMessage", (newMessage) => {
      // My device received it → acknowledge delivery to the sender.
      socket.emit("messageDelivered", {
        messageId: newMessage._id,
        senderId: newMessage.senderId,
      });

      const isFromOpenChat = newMessage.senderId === get().selectedUser?._id;
      if (!isFromOpenChat) return;

      set((state) => {
        // Dedupe by _id (guards against any double delivery).
        if (state.messages.some((m) => m._id === newMessage._id)) return state;
        return { messages: [...state.messages, newMessage] };
      });

      // The chat is open in front of me → it's immediately read.
      socket.emit("messageRead", { partnerId: newMessage.senderId });

      if (get().isSoundEnabled) {
        const notificationSound = new Audio("/sounds/notification.mp3");
        notificationSound.currentTime = 0;
        notificationSound
          .play()
          .catch((e) => console.log("Audio play failed:", e));
      }
    });

    // ── A single message I SENT advanced (sent → delivered) ──────────────
    socket.on("messageStatusUpdate", ({ messageId, status }) => {
      set((state) => ({
        messages: state.messages.map((m) =>
          m._id === messageId ? { ...m, status } : m
        ),
      }));
    });

    // ── The partner opened the chat → all my messages to them are read ───
    socket.on("messagesRead", ({ by }) => {
      set((state) => ({
        messages: state.messages.map((m) =>
          m.senderId === authUser._id && m.receiverId === by
            ? { ...m, status: "read" }
            : m
        ),
      }));
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    socket.off("newMessage");
    socket.off("messageStatusUpdate");
    socket.off("messagesRead");
  },
}));
