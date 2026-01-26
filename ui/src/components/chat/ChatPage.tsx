/**
 * Chat Page Component
 * Used by both / and /chat routes
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  streamChat,
  isChunkData,
  isCompleteData,
  isErrorData,
} from "../../utils/stream";
import { ChatHeader } from "./ChatHeader";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  isStreaming?: boolean;
}

export function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingContentRef = useRef<string>("");
  const flushTimeoutRef = useRef<number | null>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle streaming message
  const handleSendMessage = useCallback(async (content: string) => {
    // Abort any existing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Add user message immediately
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };

    // Add placeholder for assistant message
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setIsStreaming(true);

    try {
      const flushPendingContent = () => {
        if (!pendingContentRef.current) return;
        const pending = pendingContentRef.current;
        pendingContentRef.current = "";
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, content: msg.content + pending }
            : msg
        ));
      };

      const scheduleFlush = () => {
        if (flushTimeoutRef.current) return;
        flushTimeoutRef.current = window.setTimeout(() => {
          flushTimeoutRef.current = null;
          flushPendingContent();
        }, 50);
      };

      const stream = streamChat(content, conversationId ?? undefined, {
        signal: abortControllerRef.current.signal,
      });

      for await (const event of stream) {
        switch (event.type) {
          case 'chunk':
            if (isChunkData(event.data)) {
              const chunkData = event.data;
              pendingContentRef.current += chunkData.content;
              scheduleFlush();
            }
            break;

          case 'complete':
            if (isCompleteData(event.data)) {
              const completeData = event.data;
              flushPendingContent();

              if (!conversationId) {
                setConversationId(completeData.conversationId);
              }

              setMessages(prev => prev.map(msg =>
                msg.id === assistantMessageId
                  ? {
                      ...msg,
                      id: completeData.messageId,
                      isStreaming: false,
                    }
                  : msg
              ));
            }
            break;

          case 'error':
            if (isErrorData(event.data)) {
              toast.error(event.data.message);
              pendingContentRef.current = "";
              setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId));
            }
            break;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        pendingContentRef.current = "";
        setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId));
      } else {
        console.error("Stream error:", error);
        toast.error(error instanceof Error ? error.message : "Failed to send message");
        pendingContentRef.current = "";
        setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId));
      }
    } finally {
      if (flushTimeoutRef.current) {
        window.clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
      }
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [conversationId]);

  const handleStopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const handleNewConversation = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setConversationId(null);
    toast.success("Started new conversation");
  };

  return (
    <div className="h-full flex flex-col">
      <ChatHeader
        conversationId={conversationId}
        isStreaming={isStreaming}
        onNewConversation={handleNewConversation}
      />

      <ChatMessages
        messages={messages}
        messagesEndRef={messagesEndRef}
      />

      <ChatInput
        onSend={handleSendMessage}
        onStop={handleStopStreaming}
        disabled={false}
        isStreaming={isStreaming}
        placeholder="Type a message..."
      />
    </div>
  );
}
