import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import { toast } from "react-hot-toast";
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.MODE === "development" ? import.meta.env.VITE_API_URL.replace("/api", "") : "/";

// Then use SOCKET_URL when connecting:
// const socket = io(SOCKET_URL, { ... })

export const useAuthStore = create((set, get) => ({
  authUser: null,
  isCheckingAuth: true,
  isSigningUp: false,
  isLoggingIn: false,
  socket: null,
  onlineUsers: [],
  lastSeen: {}, // { userId: timestamp } — for offline "last seen" text

  // 🔐 CHECK AUTH
  checkAuth: async () => {
    try {
      const res = await axiosInstance.get("/auth/check");
      set({ authUser: res.data });
    } catch (error) {
      if (error.response?.status === 401) {
        set({ authUser: null });
      }
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  // 📝 SIGNUP
  signup: async (data) => {
    set({ isSigningUp: true });
    try {
      const res = await axiosInstance.post("/auth/signup", data);
      set({ authUser: res.data });
      toast.success("Account created successfully!");
    } catch (error) {
      toast.error(error.response?.data?.message || "Signup failed");
    } finally {
      set({ isSigningUp: false });
    }
  },

  // 🔑 LOGIN
  login: async (data) => {
    set({ isLoggingIn: true });
    try {
      const res = await axiosInstance.post("/auth/login", data);
      set({ authUser: res.data });
      toast.success("Logged in successfully");
    } catch (error) {
      toast.error(error.response?.data?.message || "Login failed");
    } finally {
      set({ isLoggingIn: false });
    }
  },

  // 🚪 LOGOUT
  logout: async () => {
    try {
      await axiosInstance.post("/auth/logout");
      get().disconnectSocket();
      set({ authUser: null, onlineUsers: [] });
      toast.success("Logged out successfully");
    } catch (error) {
      toast.error("Error logging out");
    }
  },

  // 🧑‍💻 UPDATE PROFILE
  updateProfile: async (data) => {
    try {
      const res = await axiosInstance.put("/auth/upadate-profile", data);
      set({ authUser: res.data });
      toast.success("Profile updated successfully");
    } catch (error) {
      toast.error(error.response?.data?.message || "Update failed");
    }
  },

  // 🔌 CONNECT SOCKET (ONLY FROM App.jsx)
  connectSocket: () => {
    const { authUser, socket } = get();
    if (!authUser || socket?.connected) return;

    const socketInstance = io(SOCKET_URL, {
      withCredentials: true,
    });

    socketInstance.on("connect", () => {
      console.log("🟢 Socket connected:", socketInstance.id);
    });

    socketInstance.on("getOnlineUsers", (userIds) => {
      set({ onlineUsers: userIds });
    });

    socketInstance.on("userLastSeen", ({ userId, lastSeen }) => {
      set((state) => ({ lastSeen: { ...state.lastSeen, [userId]: lastSeen } }));
    });

    socketInstance.on("disconnect", () => {
      console.log("🔴 Socket disconnected");
    });

    set({ socket: socketInstance });
  },

  // 🔌 DISCONNECT SOCKET
  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null });
    }
  },
}));
