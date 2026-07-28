import { Check, CheckCheck, Clock } from "lucide-react";

/**
 * WhatsApp-style delivery ticks (only shown on the sender's own messages).
 *
 *   sending   → clock            (message still in flight)
 *   sent      → single grey ✓    (server accepted it)
 *   delivered → double grey ✓✓   (receiver's device got it)
 *   read      → double blue ✓✓   (receiver opened the chat)
 */
function MessageTicks({ status = "sent" }) {
  if (status === "sending") {
    return <Clock className="w-3.5 h-3.5 opacity-70" aria-label="Sending" />;
  }

  if (status === "sent") {
    return <Check className="w-3.5 h-3.5 opacity-80" aria-label="Sent" />;
  }

  if (status === "delivered") {
    return (
      <CheckCheck className="w-3.5 h-3.5 opacity-80" aria-label="Delivered" />
    );
  }

  if (status === "read") {
    return (
      <CheckCheck
        className="w-3.5 h-3.5 text-sky-400"
        aria-label="Read"
      />
    );
  }

  return null;
}

export default MessageTicks;
