/**
 * Shared Chat Page Component
 * Used by both / and /chat routes
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  streamChat,
  isChunkData,
  isCompleteData,
  isErrorData,
} from "../../utils/stream";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  isStreaming?: boolean;
}

// Chat state that can be passed via location.state
export interface ChatState {
  messages: Message[];
  conversationId: string | null;
  isStreaming: boolean;
}

export function ChatPage() {
  const routerState = useRouterState();
  const restoredState = routerState.location.state as unknown as ChatState | undefined;

  console.log('🔵 ChatPage - Restoring state:', {
    hasState: !!restoredState,
    messageCount: restoredState?.messages?.length ?? 0,
    conversationId: restoredState?.conversationId,
    isStreaming: restoredState?.isStreaming,
  });

  const [messages, setMessages] = useState<Message[]>(() => restoredState?.messages ?? []);
  const [conversationId, setConversationId] = useState<string | null>(() => restoredState?.conversationId ?? null);
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
              // Append chunk to assistant message
              pendingContentRef.current += chunkData.content;
              scheduleFlush();
            }
            break;

          case 'complete':
            if (isCompleteData(event.data)) {
              const completeData = event.data;
              flushPendingContent();

              // Update conversation ID if new
              if (!conversationId) {
                setConversationId(completeData.conversationId);
              }

              // Update message with final data
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
              // Remove streaming message on error
              pendingContentRef.current = "";
              setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId));
            }
            break;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // User cancelled, remove incomplete message
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
    <div className="flex h-[calc(100vh-8rem)] -mx-4 sm:-mx-6 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-medium">Chat</h1>
          {conversationId && (
            <span className="text-xs text-muted-foreground font-mono">
              {conversationId.slice(0, 8)}...
            </span>
          )}
          {isStreaming && (
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              streaming
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleNewConversation}
            className="px-3 py-1.5 text-xs font-mono border border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/40 transition-all rounded-lg"
          >
            new chat
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto px-4">
            <h2 className="text-lg font-medium mb-2">Start a conversation</h2>
            <p className="text-sm text-muted-foreground text-center">
              Ask a question or start typing below.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              isStreaming={message.isStreaming}
              chatState={{ messages, conversationId, isStreaming }}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border/50">
        <ChatInput
          onSend={handleSendMessage}
          onStop={handleStopStreaming}
          disabled={false}
          isStreaming={isStreaming}
          placeholder="Type a message..."
        />
      </div>
    </div>
  );
}
