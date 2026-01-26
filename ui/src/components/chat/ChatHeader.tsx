/**
 * Chat Header Component
 * Shows conversation info and controls
 */

import { RankBadge } from "./RankBadge";

interface ChatHeaderProps {
  conversationId: string | null;
  isStreaming: boolean;
  onNewConversation: () => void;
}

export function ChatHeader({
  conversationId,
  isStreaming,
  onNewConversation,
}: ChatHeaderProps) {
  return (
    <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-border/20 bg-background/50">
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-semibold text-primary">Chat</h1>
        {conversationId && (
          <span className="text-[10px] text-muted-foreground/40 font-mono hidden sm:inline">
            {conversationId.slice(0, 8)}
          </span>
        )}
        {isStreaming && (
          <span className="flex items-center gap-1 text-[10px] text-primary/70">
            <span className="w-1 h-1 bg-primary rounded-full animate-pulse" />
            <span className="hidden sm:inline">streaming</span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <RankBadge />
        <button
          onClick={onNewConversation}
          className="px-2 py-1 text-[10px] font-mono border border-border/30 hover:border-primary/30 bg-transparent hover:bg-primary/5 text-muted-foreground/60 hover:text-primary transition-all"
        >
          new
        </button>
      </div>
    </div>
  );
}
