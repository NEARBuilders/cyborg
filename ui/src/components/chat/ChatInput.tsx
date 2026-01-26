/**
 * Chat Input Component
 * Input field with send/stop button for the chat interface
 */

import { useState, useRef, useEffect } from "react";
import { cn } from "../../lib/utils";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  onStop,
  disabled = false,
  isStreaming = false,
  placeholder = "Type a message...",
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [value]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed && !disabled && !isStreaming) {
      onSend(trimmed);
      setValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="shrink-0 px-3 py-2 border-t border-border/20 bg-background/50">
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className={cn(
            "flex-1 resize-none bg-muted/10 px-2.5 py-2",
            "text-sm placeholder:text-muted-foreground/30",
            "border-0 outline-none focus:bg-muted/15",
            "disabled:cursor-not-allowed disabled:opacity-40",
            "transition-colors"
          )}
        />

        {isStreaming ? (
          <StopButton onClick={onStop} />
        ) : (
          <SendButton onClick={handleSubmit} disabled={disabled || !value.trim()} />
        )}
      </div>
    </div>
  );
}

function SendButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "shrink-0 flex h-8 w-8 items-center justify-center",
        "bg-primary/90 text-primary-foreground",
        "hover:bg-primary active:scale-95",
        "disabled:cursor-not-allowed disabled:opacity-20",
        "transition-all"
      )}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5"
      >
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </svg>
    </button>
  );
}

function StopButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 flex h-8 w-8 items-center justify-center",
        "bg-destructive/80 text-destructive-foreground",
        "hover:bg-destructive active:scale-95",
        "transition-all"
      )}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-3 w-3"
      >
        <rect x="6" y="6" width="12" height="12" rx="1" />
      </svg>
    </button>
  );
}
