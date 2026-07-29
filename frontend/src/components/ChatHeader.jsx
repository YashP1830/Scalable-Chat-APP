import { XIcon, UsersIcon, InfoIcon } from "lucide-react";
import { useChatStore } from "../store/useChatStore.js";
import { useEffect, useState } from "react";
import { useAuthStore } from "../store/useAuth.stores.js";
import GroupInfoModal from "./GroupInfoModal.jsx";

function formatLastSeen(ts) {
  if (!ts) return "Offline";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "last seen just now";
  if (mins < 60) return `last seen ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `last seen ${hrs}h ago`;
  return `last seen ${new Date(ts).toLocaleDateString()}`;
}

function ChatHeader() {
  const { selectedUser, setSelectedUser, typingUsers, groupTypers } = useChatStore();
  const { onlineUsers, lastSeen, socket, authUser } = useAuthStore();
  const [showInfo, setShowInfo] = useState(false);

  const isGroup = !!selectedUser.isGroup;

  useEffect(() => {
    if (!isGroup && !onlineUsers.includes(selectedUser._id) && socket) {
      socket.emit("getLastSeen", { userId: selectedUser._id });
    }
  }, [selectedUser._id, isGroup, onlineUsers, socket]);

  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === "Escape") setSelectedUser(null);
    };
    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [setSelectedUser]);

  // ── Group header ──────────────────────────────────────────────────────
  if (isGroup) {
    const members = selectedUser.members || [];
    const typerIds = Object.keys(groupTypers[selectedUser._id] || {}).filter(
      (id) => id !== authUser?._id
    );
    const typerNames = typerIds
      .map((id) => members.find((m) => m._id === id)?.fullName)
      .filter(Boolean);
    const sub =
      typerNames.length > 0
        ? `${typerNames.slice(0, 2).join(", ")} typing…`
        : `${members.length} members`;

    return (
      <div className="flex justify-between items-center bg-slate-800/50 border-b border-slate-700/50 max-h-[84px] px-6 flex-1">
        <div className="flex items-center space-x-3">
          <div className="size-12 rounded-full bg-fuchsia-500/30 flex items-center justify-center">
            <UsersIcon className="size-6 text-fuchsia-200" />
          </div>
          <div>
            <h3 className="text-slate-200 font-medium">{selectedUser.name}</h3>
            <p className={`text-sm ${typerNames.length ? "text-cyan-400" : "text-slate-400"}`}>
              {sub}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowInfo(true)}
            title="Group info & members"
            className="text-slate-400 hover:text-fuchsia-300 transition-colors"
          >
            <InfoIcon className="w-5 h-5" />
          </button>
          <button onClick={() => setSelectedUser(null)}>
            <XIcon className="w-5 h-5 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer" />
          </button>
        </div>
        {showInfo && <GroupInfoModal onClose={() => setShowInfo(false)} />}
      </div>
    );
  }

  // ── DM header ─────────────────────────────────────────────────────────
  const isOnline = onlineUsers.includes(selectedUser._id);
  const isTyping = !!typingUsers[selectedUser._id];
  const statusText = isTyping
    ? "typing…"
    : isOnline
    ? "Online"
    : formatLastSeen(lastSeen[selectedUser._id]);

  return (
    <div className="flex justify-between items-center bg-slate-800/50 border-b border-slate-700/50 max-h-[84px] px-6 flex-1">
      <div className="flex items-center space-x-3">
        <div className={`avatar ${isOnline ? "online" : "offline"}`}>
          <div className="w-12 rounded-full">
            <img src={selectedUser.profilePic || "/avatar.png"} alt={selectedUser.fullName} />
          </div>
        </div>
        <div>
          <h3 className="text-slate-200 font-medium">{selectedUser.fullName}</h3>
          <p className={`text-sm ${isTyping ? "text-cyan-400" : "text-slate-400"}`}>{statusText}</p>
        </div>
      </div>
      <button onClick={() => setSelectedUser(null)}>
        <XIcon className="w-5 h-5 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer" />
      </button>
    </div>
  );
}
export default ChatHeader;
