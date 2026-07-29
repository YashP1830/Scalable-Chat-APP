import { useEffect, useState } from "react";
import { useChatStore } from "../store/useChatStore.js";
import UsersLoadingSkeleton from "./UsersLoadingSkeleton.jsx";
import NoChatsFound from "./NochatsFound.jsx";
import { useAuthStore } from "../store/useAuth.stores.js";
import CreateGroupModal from "./CreateGroupModal.jsx";
import { UsersIcon, PlusIcon } from "lucide-react";

function UnreadBadge({ count }) {
  if (!count) return null;
  return (
    <span className="ml-auto shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-cyan-500 text-white text-xs font-semibold flex items-center justify-center">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function ChatsList() {
  const {
    getMyChatPartners,
    getMyGroups,
    chats,
    groups,
    isUsersLoading,
    setSelectedUser,
    setSelectedGroup,
    unreadCounts,
    typingUsers,
    groupTypers,
  } = useChatStore();
  const { onlineUsers } = useAuthStore();
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    getMyChatPartners();
    getMyGroups();
  }, [getMyChatPartners, getMyGroups]);

  if (isUsersLoading) return <UsersLoadingSkeleton />;

  const nothing = chats.length === 0 && groups.length === 0;

  return (
    <>
      <button
        onClick={() => setShowCreate(true)}
        className="w-full flex items-center justify-center gap-2 mb-2 py-2 rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 transition-colors text-sm"
      >
        <PlusIcon className="size-4" /> New Group
      </button>

      {nothing && <NoChatsFound />}

      {/* Groups */}
      {groups.map((group) => {
        const unread = unreadCounts[group._id] || 0;
        const typers = Object.keys(groupTypers[group._id] || {});
        return (
          <div
            key={group._id}
            className="bg-fuchsia-500/10 p-4 rounded-lg cursor-pointer hover:bg-fuchsia-500/20 transition-colors"
            onClick={() => setSelectedGroup(group)}
          >
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-full bg-fuchsia-500/30 flex items-center justify-center shrink-0">
                <UsersIcon className="size-6 text-fuchsia-200" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-slate-200 font-medium truncate">{group.name}</h4>
                {typers.length > 0 ? (
                  <p className="text-cyan-400 text-xs">typing…</p>
                ) : (
                  <p className="text-slate-500 text-xs">{group.members?.length || 0} members</p>
                )}
              </div>
              <UnreadBadge count={unread} />
            </div>
          </div>
        );
      })}

      {/* Direct chats */}
      {chats.map((chat) => {
        const unread = unreadCounts[chat._id] || 0;
        const isTyping = !!typingUsers[chat._id];
        return (
          <div
            key={chat._id}
            className="bg-cyan-500/10 p-4 rounded-lg cursor-pointer hover:bg-cyan-500/20 transition-colors"
            onClick={() => setSelectedUser(chat)}
          >
            <div className="flex items-center gap-3">
              <div className={`avatar ${onlineUsers.includes(chat._id) ? "online" : "offline"}`}>
                <div className="size-12 rounded-full">
                  <img src={chat.profilePic || "/avatar.png"} alt={chat.fullName} />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-slate-200 font-medium truncate">{chat.fullName}</h4>
                {isTyping && <p className="text-cyan-400 text-xs">typing…</p>}
              </div>
              <UnreadBadge count={unread} />
            </div>
          </div>
        );
      })}

      {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} />}
    </>
  );
}
export default ChatsList;
