/**
 * Chat Messages Component
 * Scrollable container for chat messages
 */

import type { RefObject } from "react";
import { ChatMessage } from "./chat-message";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  isStreaming?: boolean;
}

interface ChatMessagesProps {
  messages: Message[];
  messagesEndRef: RefObject<HTMLDivElement>;
}

export function ChatMessages({ messages, messagesEndRef }: ChatMessagesProps) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            isStreaming={message.isStreaming}
          />
        ))
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <h2 className="text-base font-semibold mb-1 text-primary/80">
        Start a conversation
      </h2>
      <p className="text-xs text-muted-foreground/50">
        Ask anything to get started
      </p>
    </div>
  );
}
