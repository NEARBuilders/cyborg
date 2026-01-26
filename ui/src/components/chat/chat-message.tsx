/**
 * ChatMessage Component
 *
 * Displays a single chat message.
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
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono",
          isUser ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
        )}
      >
        {isUser ? "you" : "ai"}
      </div>

      {/* Message Content */}
      <div className={cn("flex-1 max-w-[85%]", isUser && "flex flex-col items-end")}>
        <div
          className={cn(
            "rounded-lg px-4 py-3 text-sm",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted/50 border border-border/50"
          )}
        >
          <div className="whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
            {isStreaming && (
              <span className="inline-block w-2 h-4 ml-1 bg-primary/60 animate-pulse rounded-sm" />
            )}
          </div>
        </div>

        {/* Timestamp */}
        <div className="mt-1 text-xs text-muted-foreground/50 font-mono">
          {isStreaming ? (
            <span className="text-primary">generating...</span>
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
