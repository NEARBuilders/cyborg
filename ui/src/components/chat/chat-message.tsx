/**
 * Chat Message Component
 * Displays a single chat message with markdown support
 * Shows "View Profile" buttons for valid @accountId mentions after streaming completes
 */

import { useState } from "react";
import { cn } from "../../lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { User } from "lucide-react";
import { ProfileSheet } from "./profile-sheet";
import { useQueryClient } from "@tanstack/react-query";

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

// Parse URL to determine route type and params
function parseInternalUrl(url: string): { type: 'profile' | 'builders' | 'unknown'; params?: Record<string, string> } | null {
  try {
    // Remove origin if present
    const cleanPath = url.startsWith(window.location.origin)
      ? url.slice(window.location.origin.length)
      : url;

    // Profile route: /profile/:accountId
    const profileMatch = cleanPath.match(/^\/profile\/([a-z0-9._-]+)$/i);
    if (profileMatch) {
      return { type: 'profile', params: { accountId: profileMatch[1] } };
    }

    return { type: 'unknown' };
  } catch {
    return null;
  }
}

// Simple prefetch function for profile data
async function prefetchProfileData(accountId: string) {
  try {
    const response = await fetch(`/api/builders/${accountId}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Clean up any remaining markers from content
  const displayContent = message.content
    .replace(/\[SEARCHING\]/g, '')
    .replace(/\[BUILDER_RESULTS:([\s\S]*?)\]/g, '')
    .replace(/\[HOLDERS_RESULTS:([\s\S]*?)\]/g, '')
    .replace(/\[HOLDER_RESULTS:([\s\S]*?)\]/g, '')
    .replace(/The builder data has been included[\s\S]*?End your response immediately[\s\S]*?/g, '')
    .trim();

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
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-p:my-1">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code: ({ node, className, children, ...props }: any) => {
                  const inline = !node || node.tagName !== 'pre';
                  if (inline) {
                    return (
                      <code
                        className={cn(
                          "px-1.5 py-0.5 rounded text-xs font-mono",
                          isUser
                            ? "bg-primary/20 text-primary-foreground"
                            : "bg-muted/50 text-foreground/90"
                        )}
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  }
                  return (
                    <code
                      className={cn(
                        "block px-2 py-1.5 rounded text-xs font-mono overflow-x-auto",
                        isUser
                          ? "bg-primary/10 text-primary-foreground"
                          : "bg-muted/30 text-foreground"
                      )}
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                // Custom text renderer to convert @mentions to inline buttons
                p: ({ node, children, ...props }) => {
                  // Convert children to string and process @mentions
                  const content = String(children);

                  // Check if this paragraph contains @mentions
                  if (content.includes('@')) {
                    const parts = content.split(/(@[a-z0-9._-]+)/gi);

                    return (
                      <p {...props} className="prose-p:leading-relaxed prose-p:my-1">
                        {parts.map((part, index) => {
                          // Check if this part is an @mention
                          if (part.startsWith('@')) {
                            const accountId = part.slice(1);
                            // Validate it's a NEAR account
                            if (accountId.includes('.') &&
                                /^[a-z0-9._-]+$/i.test(accountId) &&
                                accountId.length >= 3 &&
                                !accountId.startsWith('.') &&
                                !accountId.endsWith('.')) {
                              // Render as inline button
                              return (
                                <button
                                  key={index}
                                  onPointerEnter={() => {
                                    // Prefetch on hover (intent-based loading)
                                    queryClient.prefetchQuery({
                                      queryKey: ["builder-profile", accountId],
                                      queryFn: () => prefetchProfileData(accountId),
                                      staleTime: 5 * 60 * 1000,
                                    });
                                  }}
                                  onClick={() => setSelectedAccountId(accountId)}
                                  className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 text-xs font-mono bg-primary/10 text-primary hover:bg-primary/20 rounded border border-primary/25 transition-all"
                                >
                                  <User className="h-3 w-3" />
                                  {part}
                                </button>
                              );
                            }
                          }
                          // Regular text
                          return <span key={index}>{part}</span>;
                        })}
                      </p>
                    );
                  }

                  // Default paragraph rendering
                  return <p {...props}>{children}</p>;
                },
                a: ({ node, href, children, ...props }) => {
                  // Check if this is an internal link (same site)
                  const isInternalLink = href && (
                    href.startsWith('/') ||
                    href.startsWith(window.location.origin)
                  );

                  // For internal links, check if it's a profile link
                  if (!isStreaming && isInternalLink && href) {
                    // Parse the URL to check if it's a profile link
                    const cleanUrl = href.startsWith(window.location.origin)
                      ? href.slice(window.location.origin.length)
                      : href;

                    const parsed = parseInternalUrl(cleanUrl);

                    // Profile links -> open ProfileSheet
                    if (parsed?.type === 'profile' && parsed?.params?.accountId) {
                      return (
                        <a
                          href={href}
                          {...props}
                          className={cn(
                            "underline underline-offset-2 cursor-pointer",
                            isUser
                              ? "text-primary-foreground/90 hover:text-primary-foreground"
                              : "text-primary hover:text-primary/80"
                          )}
                          onPointerEnter={() => {
                            // Prefetch on hover (intent-based loading)
                            queryClient.prefetchQuery({
                              queryKey: ["builder-profile", parsed.params!.accountId],
                              queryFn: () => prefetchProfileData(parsed.params!.accountId!),
                              staleTime: 5 * 60 * 1000,
                            });
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            setSelectedAccountId(parsed.params!.accountId!);
                          }}
                        >
                          {children}
                        </a>
                      );
                    }

                    // Other internal links -> open in new tab
                    return (
                      <a
                        href={href}
                        {...props}
                        className={cn(
                          "underline underline-offset-2",
                          isUser
                            ? "text-primary-foreground/90 hover:text-primary-foreground"
                            : "text-primary hover:text-primary/80"
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {children}
                      </a>
                    );
                  }

                  // External links or during streaming - open in new tab
                  return (
                    <a
                      href={href}
                      {...props}
                      className={cn(
                        "underline underline-offset-2",
                        isUser
                          ? "text-primary-foreground/90 hover:text-primary-foreground"
                          : "text-primary hover:text-primary/80"
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {children}
                    </a>
                  );
                },
                h1: ({ node, ...props }) => (
                  <h1 className="text-lg font-semibold mt-2 mb-1" {...props} />
                ),
                h2: ({ node, ...props }) => (
                  <h2 className="text-base font-semibold mt-2 mb-1" {...props} />
                ),
                h3: ({ node, ...props }) => (
                  <h3 className="text-sm font-semibold mt-1.5 mb-1" {...props} />
                ),
                ul: ({ node, ...props }) => (
                  <ul className="my-1 ml-4 list-disc" {...props} />
                ),
                ol: ({ node, ...props }) => (
                  <ol className="my-1 ml-4 list-decimal" {...props} />
                ),
                li: ({ node, ...props }) => (
                  <li className="my-0.5" {...props} />
                ),
                blockquote: ({ node, ...props }) => (
                  <blockquote
                    className="border-l-2 border-muted-foreground/20 pl-3 italic my-2 text-muted-foreground/80"
                    {...props}
                  />
                ),
                strong: ({ node, ...props }) => (
                  <strong className="font-semibold" {...props} />
                ),
                em: ({ node, ...props }) => (
                  <em className="italic" {...props} />
                ),
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
                img: ({ node, ...props }) => (
                  <img
                    {...props}
                    className="rounded-lg max-w-[120px] max-h-[120px] object-cover"
                    loading="lazy"
                  />
                ),
              }}
            >
              {displayContent}
            </ReactMarkdown>
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

      {/* Profile Sheet */}
      {selectedAccountId && (
        <ProfileSheet
          isOpen={!!selectedAccountId}
          onClose={() => setSelectedAccountId(null)}
          accountId={selectedAccountId}
        />
      )}
    </div>
  );
}
