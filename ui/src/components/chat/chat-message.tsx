/**
 * Chat Message Component
 * Displays a single chat message
 */

import { cn } from "../../lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  isStreaming?: boolean;
}

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-2", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "shrink-0 w-6 h-6 flex items-center justify-center text-[9px] font-mono font-bold uppercase",
          isUser
            ? "bg-primary/15 text-primary/80"
            : "bg-muted/30 text-muted-foreground/60"
        )}
      >
        {isUser ? "you" : "ai"}
      </div>

      {/* Message Content */}
      <div className={cn("flex-1 max-w-[90%]", isUser && "flex flex-col items-end")}>
        <div
          className={cn(
            "px-2.5 py-1.5 text-sm",
            isUser
              ? "bg-primary/80 text-primary-foreground"
              : "bg-muted/20 text-foreground/90"
          )}
        >
          <div className="whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
            {isStreaming && (
              <span className="inline-block w-1 h-3 ml-0.5 bg-primary/50 animate-pulse" />
            )}
          </div>
        </div>

        {/* Timestamp */}
        <div className="mt-0.5 text-[9px] text-muted-foreground/30 font-mono">
          {isStreaming ? (
            <span className="text-primary/40">generating...</span>
          ) : (
            new Date(message.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          )}
        </div>
      </div>
    </div>
  );
}
