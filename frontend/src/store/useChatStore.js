import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";
import { useAuthStore } from "./useAuth.stores.js";

export const useChatStore = create((set, get) => ({
  allContacts: [],
  chats: [],
  groups: [],
  messages: [],
  activeTab: "chats",
  selectedUser: null, // a User (DM) or a Group with isGroup:true
  isUsersLoading: false,
  isMessagesLoading: false,
  isSoundEnabled: JSON.parse(localStorage.getItem("isSoundEnabled")) === true,
  unreadCounts: {}, // { partnerId|groupId: count }
  typingUsers: {}, // DM: { userId: true }
  groupTypers: {}, // groups: { groupId: { userId: true } }

  toggleSound: () => {
    const nextState = !get().isSoundEnabled;
    localStorage.setItem("isSoundEnabled", nextState);
    set({ isSoundEnabled: nextState });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedUser: (selectedUser) => set({ selectedUser }),
  setSelectedGroup: (group) => set({ selectedUser: { ...group, isGroup: true } }),

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

  // ── Groups ───────────────────────────────────────────────────────────────
  getMyGroups: async () => {
    try {
      const res = await axiosInstance.get("/group");
      set({ groups: res.data || [] });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch groups");
    }
  },

  createGroup: async ({ name, memberIds }) => {
    try {
      const res = await axiosInstance.post("/group", { name, memberIds });
      set((state) => ({ groups: [res.data, ...state.groups] }));
      toast.success("Group created");
      return res.data;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to create group");
      return null;
    }
  },

  addGroupMember: async (groupId, memberId) => {
    try {
      const res = await axiosInstance.post(`/group/${groupId}/members`, {
        memberId,
      });
      // Update the list AND the currently-open group so the header refreshes.
      set((state) => ({
        groups: state.groups.map((g) => (g._id === groupId ? res.data : g)),
        selectedUser:
          state.selectedUser?.isGroup && state.selectedUser._id === groupId
            ? { ...res.data, isGroup: true }
            : state.selectedUser,
      }));
      toast.success("Member added");
      return res.data;
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to add member");
      return null;
    }
  },

  getMessagesByUserId: async (userId) => {
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/message/${userId}`);
      set({ messages: res.data });

      const socket = useAuthStore.getState().socket;
      socket?.emit("messageRead", { partnerId: userId });
      set((state) => ({ unreadCounts: { ...state.unreadCounts, [userId]: 0 } }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Something went wrong");
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  getGroupMessages: async (groupId) => {
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/group/${groupId}/messages`);
      set({ messages: res.data });

      const socket = useAuthStore.getState().socket;
      socket?.emit("groupRead", { groupId });
      set((state) => ({ unreadCounts: { ...state.unreadCounts, [groupId]: 0 } }));
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

    const isGroup = !!selectedUser.isGroup;
    const tempId = `temp-${Date.now()}`;

    const optimisticMessage = {
      _id: tempId,
      senderId: authUser._id,
      senderName: authUser.fullName,
      receiverId: isGroup ? undefined : selectedUser._id,
      groupId: isGroup ? selectedUser._id : undefined,
      text: messageData.text,
      image: messageData.image,
      status: "sending",
      createdAt: new Date().toISOString(),
      isOptimistic: true,
    };

    set((state) => ({ messages: [...state.messages, optimisticMessage] }));

    try {
      const url = isGroup
        ? `/group/${selectedUser._id}/send`
        : `/message/send/${selectedUser._id}`;
      const res = await axiosInstance.post(url, messageData);

      set((state) => ({
        messages: state.messages.map((msg) =>
          msg._id === tempId ? res.data : msg
        ),
      }));
    } catch (error) {
      set((state) => ({
        messages: state.messages.filter((msg) => msg._id !== tempId),
      }));
      toast.error(error.response?.data?.message || "Failed to send message");
    }
  },

  // Chat-scoped DM listeners (re-registered when the open chat changes).
  subscribeToMessages: () => {
    const { selectedUser } = get();
    if (!selectedUser) return;
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    const { authUser } = useAuthStore.getState();

    socket.off("newMessage");
    socket.off("messageStatusUpdate");
    socket.off("messagesRead");

    socket.on("newMessage", (newMessage) => {
      socket.emit("messageDelivered", {
        messageId: newMessage._id,
        senderId: newMessage.senderId,
      });
      const open = get().selectedUser;
      if (open?.isGroup || newMessage.senderId !== open?._id) return;

      set((state) => {
        if (state.messages.some((m) => m._id === newMessage._id)) return state;
        return { messages: [...state.messages, newMessage] };
      });
      socket.emit("messageRead", { partnerId: newMessage.senderId });
      get()._playPing();
    });

    socket.on("messageStatusUpdate", ({ messageId, status }) => {
      set((state) => ({
        messages: state.messages.map((m) =>
          m._id === messageId ? { ...m, status } : m
        ),
      }));
    });

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

  _playPing: () => {
    if (!get().isSoundEnabled) return;
    const a = new Audio("/sounds/notification.mp3");
    a.currentTime = 0;
    a.play().catch(() => {});
  },

  getUnreadCounts: async () => {
    try {
      const res = await axiosInstance.get("/message/unread");
      set({ unreadCounts: res.data || {} });
    } catch {
      /* non-fatal */
    }
  },

  // App-wide listeners (unread, typing, group events) — registered once.
  subscribeToNotifications: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    const { authUser } = useAuthStore.getState();

    [
      "unreadUpdate",
      "userTyping",
      "userStoppedTyping",
      "newGroupMessage",
      "groupUserTyping",
      "groupUserStoppedTyping",
      "addedToGroup",
      "groupUpdated",
    ].forEach((e) => socket.off(e));

    socket.on("unreadUpdate", ({ partnerId, count }) => {
      if (get().selectedUser?._id === partnerId && count > 0) return;
      set((state) => ({
        unreadCounts: { ...state.unreadCounts, [partnerId]: count },
      }));
    });

    socket.on("userTyping", ({ from }) => {
      set((state) => ({ typingUsers: { ...state.typingUsers, [from]: true } }));
    });
    socket.on("userStoppedTyping", ({ from }) => {
      set((state) => {
        const next = { ...state.typingUsers };
        delete next[from];
        return { typingUsers: next };
      });
    });

    // ── Group real-time ──────────────────────────────────────────────────
    socket.on("newGroupMessage", (msg) => {
      // I already have my own message optimistically; ignore the echo.
      if (msg.senderId === authUser._id) return;
      const open = get().selectedUser;
      if (open?.isGroup && open._id === msg.groupId) {
        set((state) => {
          if (state.messages.some((m) => m._id === msg._id)) return state;
          return { messages: [...state.messages, msg] };
        });
        // Viewing this group → keep it read.
        useAuthStore.getState().socket?.emit("groupRead", { groupId: msg.groupId });
        get()._playPing();
      }
    });

    socket.on("groupUserTyping", ({ groupId, from }) => {
      set((state) => ({
        groupTypers: {
          ...state.groupTypers,
          [groupId]: { ...(state.groupTypers[groupId] || {}), [from]: true },
        },
      }));
    });
    socket.on("groupUserStoppedTyping", ({ groupId, from }) => {
      set((state) => {
        const g = { ...(state.groupTypers[groupId] || {}) };
        delete g[from];
        return { groupTypers: { ...state.groupTypers, [groupId]: g } };
      });
    });

    socket.on("addedToGroup", (group) => {
      set((state) => {
        const exists = state.groups.some((g) => g._id === group._id);
        return {
          groups: exists
            ? state.groups.map((g) => (g._id === group._id ? group : g))
            : [group, ...state.groups],
        };
      });
    });
    socket.on("groupUpdated", (group) => {
      set((state) => ({
        groups: state.groups.map((g) => (g._id === group._id ? group : g)),
        selectedUser:
          state.selectedUser?.isGroup && state.selectedUser._id === group._id
            ? { ...group, isGroup: true }
            : state.selectedUser,
      }));
    });
  },

  unsubscribeFromNotifications: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    [
      "unreadUpdate",
      "userTyping",
      "userStoppedTyping",
      "newGroupMessage",
      "groupUserTyping",
      "groupUserStoppedTyping",
      "addedToGroup",
      "groupUpdated",
    ].forEach((e) => socket.off(e));
  },

  // Typing emitters (called by MessageInput).
  emitTyping: (to) => useAuthStore.getState().socket?.emit("typing", { to }),
  emitStopTyping: (to) => useAuthStore.getState().socket?.emit("stopTyping", { to }),
  emitGroupTyping: (groupId) =>
    useAuthStore.getState().socket?.emit("groupTyping", { groupId }),
  emitGroupStopTyping: (groupId) =>
    useAuthStore.getState().socket?.emit("groupStopTyping", { groupId }),
}));
