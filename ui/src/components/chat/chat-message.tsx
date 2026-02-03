/**
 * Chat Message Component
 * Displays a single chat message with markdown support
 * Detects and renders builder cards from JSON code blocks
 */

import { cn } from "../../lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { BuilderCard } from "./builder-card";

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
          {isUser ? (
            // User messages: plain text with line breaks
            <div className="whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
            </div>
          ) : (
            // AI messages: render as markdown with builder card detection
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-p:my-1">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                  // Custom code block renderer to detect builder-results
                  code: ({ node, inline, className, children, ...props }) => {
                    if (inline) {
                      return (
                        <code
                          className="px-1.5 py-0.5 rounded bg-muted/50 text-foreground/90 text-xs font-mono"
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    }

                    const codeContent = String(children).replace(/\n$/, "");

                    // Check if this is a builder-results code block
                    if (className?.includes("builder-results") || codeContent.includes('"type": "builders"')) {
                      try {
                        const json = JSON.parse(codeContent);
                        if (json.type === "builders" && Array.isArray(json.data)) {
                          return (
                            <div className="my-3 space-y-3">
                              {json.data.map((builder: any, index: number) => (
                                <BuilderCard key={`${builder.accountId}-${index}`} builder={builder} />
                              ))}
                            </div>
                          );
                        }
                      } catch (e) {
                        console.error("Failed to parse builder-results JSON:", e);
                      }
                    }

                    // Default code block rendering
                    return (
                      <code
                        className="block px-2 py-1.5 rounded bg-muted/30 text-foreground text-xs font-mono overflow-x-auto"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  // Links
                  a: ({ node, ...props }) => (
                    <a
                      {...props}
                      className="text-primary hover:text-primary/80 underline underline-offset-2"
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  ),
                  // Headings
                  h1: ({ node, ...props }) => (
                    <h1 className="text-lg font-semibold mt-2 mb-1" {...props} />
                  ),
                  h2: ({ node, ...props }) => (
                    <h2 className="text-base font-semibold mt-2 mb-1" {...props} />
                  ),
                  h3: ({ node, ...props }) => (
                    <h3 className="text-sm font-semibold mt-1.5 mb-1" {...props} />
                  ),
                  // Lists
                  ul: ({ node, ...props }) => (
                    <ul className="my-1 ml-4 list-disc" {...props} />
                  ),
                  ol: ({ node, ...props }) => (
                    <ol className="my-1 ml-4 list-decimal" {...props} />
                  ),
                  li: ({ node, ...props }) => (
                    <li className="my-0.5" {...props} />
                  ),
                  // Blockquotes
                  blockquote: ({ node, ...props }) => (
                    <blockquote
                      className="border-l-2 border-muted-foreground/20 pl-3 italic my-2 text-muted-foreground/80"
                      {...props}
                    />
                  ),
                  // Strong/bold
                  strong: ({ node, ...props }) => (
                    <strong className="font-semibold" {...props} />
                  ),
                  // Em/italic
                  em: ({ node, ...props }) => (
                    <em className="italic" {...props} />
                  ),
                  // Tables (for GFM tables)
                  table: ({ node, ...props }) => (
                    <div className="my-2 overflow-x-auto">
                      <table className="min-w-full divide-y divide-border" {...props} />
                    </div>
                  ),
                  thead: ({ node, ...props }) => (
                    <thead className="bg-muted/30" {...props} />
                  ),
                  th: ({ node, ...props }) => (
                    <th className="px-2 py-1 text-left text-xs font-medium" {...props} />
                  ),
                  td: ({ node, ...props }) => (
                    <td className="px-2 py-1 text-xs border-t border-border/30" {...props} />
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-1 h-3 ml-0.5 bg-primary/50 animate-pulse" />
              )}
            </div>
          )}
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
