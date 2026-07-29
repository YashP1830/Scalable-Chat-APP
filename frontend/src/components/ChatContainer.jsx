import { useEffect, useRef } from "react";
import { useAuthStore } from "../store/useAuth.stores.js";
import { useChatStore } from "../store/useChatStore.js";
import ChatHeader from "./ChatHeader.jsx";
import NoChatHistoryPlaceholder from "./NoChatHistoryPlaceholder.jsx";
import MessageInput from "./MessageInput.jsx";
import MessagesLoadingSkeleton from "./MessagesLoadingSkeleton.jsx";
import MessageTicks from "./MessageTicks.jsx";

// Stable-ish color for a sender's name label in group chats.
const NAME_COLORS = [
  "text-rose-300",
  "text-amber-300",
  "text-emerald-300",
  "text-sky-300",
  "text-violet-300",
  "text-lime-300",
];
function nameColor(id = "") {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % NAME_COLORS.length;
  return NAME_COLORS[h];
}

function ChatContainer() {
  const {
    selectedUser,
    getMessagesByUserId,
    getGroupMessages,
    messages,
    isMessagesLoading,
    subscribeToMessages,
    unsubscribeFromMessages,
  } = useChatStore();
  const { authUser } = useAuthStore();
  const messageEndRef = useRef(null);

  const isGroup = !!selectedUser.isGroup;

  useEffect(() => {
    if (isGroup) getGroupMessages(selectedUser._id);
    else getMessagesByUserId(selectedUser._id);
    subscribeToMessages();
    return () => unsubscribeFromMessages();
  }, [
    selectedUser,
    isGroup,
    getMessagesByUserId,
    getGroupMessages,
    subscribeToMessages,
    unsubscribeFromMessages,
  ]);

  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  return (
    <>
      <ChatHeader />
      <div className="flex-1 px-6 overflow-y-auto py-8">
        {messages.length > 0 && !isMessagesLoading ? (
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg) => {
              const mine = msg.senderId === authUser._id;
              return (
                <div key={msg._id} className={`chat ${mine ? "chat-end" : "chat-start"}`}>
                  <div
                    className={`chat-bubble relative transition-all duration-200 origin-bottom-right ${
                      mine ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-200"
                    } ${msg.isOptimistic ? "opacity-60 scale-95" : "opacity-100 scale-100"}`}
                  >
                    {/* Sender name label (group chats, others' messages only) */}
                    {isGroup && !mine && msg.senderName && (
                      <p className={`text-xs font-semibold mb-1 ${nameColor(msg.senderId)}`}>
                        {msg.senderName}
                      </p>
                    )}

                    {msg.image && (
                      <img src={msg.image} alt="Shared" className="rounded-lg h-48 object-cover" />
                    )}
                    {msg.text && <p className="mt-2">{msg.text}</p>}

                    <div className="text-[10px] mt-1 flex items-center justify-end gap-1 opacity-75">
                      <p>
                        {new Date(msg.createdAt).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>

                      {/* Ticks only for my own DM messages (group read receipts are v2). */}
                      {mine && !isGroup && (
                        <span className="ml-1 inline-flex items-center">
                          <MessageTicks status={msg.isOptimistic ? "sending" : msg.status || "sent"} />
                        </span>
                      )}
                      {mine && isGroup && (
                        <span className="ml-1 inline-flex items-center">
                          <MessageTicks status={msg.isOptimistic ? "sending" : "sent"} />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messageEndRef} />
          </div>
        ) : isMessagesLoading ? (
          <MessagesLoadingSkeleton />
        ) : (
          <NoChatHistoryPlaceholder name={selectedUser.fullName || selectedUser.name} />
        )}
      </div>

      <MessageInput />
    </>
  );
}

export default ChatContainer;
