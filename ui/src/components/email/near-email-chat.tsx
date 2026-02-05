/**
 * NearEmailChat Component
 *
 * A chat-like messaging interface for near.email
 * Uses NEAR blockchain transactions for encrypted messaging
 *
 * Feels like a messaging app, not email
 *
 * Smooth, conversational UX with:
 * - Message thread view
 * - Quick compose at bottom
 * - Slide-out panel design
 * - Real-time feel
 * - Wallet transaction signing via near-kit (same as profile update)
 *
 * Only .near addresses are supported for on-chain email delivery
 */

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { MessageCircle, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";

// =============================================================================
// NEAR EMAIL CONFIG
// =============================================================================

const NEAR_EMAIL_CONTRACT = "outlayer.near";
const NEAR_EMAIL_PROJECT_ID = "zavodil.near/near-email";

/**
 * Validates if a string is a valid NEAR account ID (.near address)
 */
function isValidNearAddress(address: string): boolean {
  if (!address || !address.endsWith('.near')) {
    return false;
  }
  if (address.length < 6 || address.length > 64) {
    return false;
  }
  const nearRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.([a-z0-9]([a-z0-9-]*[a-z0-9])?))*\.near$/;
  return nearRegex.test(address);
}

interface NearEmailChatProps {
  /** The recipient NEAR account ID */
  recipientAccountId: string;
  /** Optional recipient display name */
  recipientName?: string;
  /** Optional recipient avatar URL */
  recipientAvatar?: string;
  /** Optional button variant */
  variant?: "default" | "ghost" | "outline" | "secondary" | "link";
  /** Optional custom trigger */
  trigger?: React.ReactNode;
  /** Optional className */
  className?: string;
}

interface EmailMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  timestamp: string;
  isIncoming: boolean;
}

export function NearEmailChat({
  recipientAccountId,
  recipientName,
  recipientAvatar,
  variant = "default",
  trigger,
  className,
}: NearEmailChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Validate recipient account ID
  const isValid = isValidNearAddress(recipientAccountId);

  console.log("[NearEmailChat] Component mounted for:", recipientAccountId, "valid:", isValid);

  console.log("[NearEmailChat] authClient:", authClient);
  console.log("[NearEmailChat] authClient.near:", authClient?.near);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load messages when panel opens
  useEffect(() => {
    if (open) {
      loadMessages();
    }
  }, [open, recipientAccountId]);

  const loadMessages = async () => {
    setIsLoading(true);
    try {
      // TODO: Implement loading messages from near.email API
      // For now, this is a placeholder
      const response = await fetch(`/api/email/messages/${recipientAccountId}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error("Failed to load messages:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    const message = inputValue.trim();
    console.log("[NearEmailChat] handleSend called");
    console.log("[NearEmailChat] Recipient:", recipientAccountId);
    console.log("[NearEmailChat] Message length:", message.length);

    if (!message || isSending) {
      console.log("[NearEmailChat] Skipping send - no message or already sending");
      return;
    }

    // Recipient already validated during component mount
    // No need to re-validate here

    console.log("[NearEmailChat] All validations passed");
    setIsSending(true);
    const tempId = `temp-${Date.now()}`;
    console.log("[NearEmailChat] tempId:", tempId);

    // Optimistically add message
    const newMessage: EmailMessage = {
      id: tempId,
      from: "me",
      to: recipientAccountId,
      subject: "Message",
      body: message,
      timestamp: new Date().toISOString(),
      isIncoming: false,
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputValue("");
    console.log("[NearEmailChat] Optimistic message added, input cleared");

    try {
      console.log("[NearEmailChat] Getting authClient.near...");
      // Use same wallet setup as profile update (via near-kit)
      const nearAuth = authClient.near;
      console.log("[NearEmailChat] nearAuth:", nearAuth);

      if (!nearAuth) {
        console.log("[NearEmailChat] ERROR: No nearAuth found");
        throw new Error("No NEAR wallet connected");
      }

      console.log("[NearEmailChat] Getting wallet account ID...");
      const walletAccountId = nearAuth.getAccountId();
      console.log("[NearEmailChat] walletAccountId:", walletAccountId);

      if (!walletAccountId) {
        console.log("[NearEmailChat] ERROR: No wallet account ID");
        throw new Error("Please connect your NEAR wallet first");
      }

      // Prepare transaction args for near.email
      // Using send_email_plaintext (no encryption, content is public on-chain)
      // Format matches official documentation: to must be email address
      const inputData = JSON.stringify({
        action: "send_email_plaintext",
        to: `${recipientAccountId}@near.email`,
        subject: "Message",
        body: message,
      });

      const args = {
        source: {
          Project: {
            project_id: "zavodil.near/near-email",
            version_key: null,
          },
        },
        input_data: inputData,
        resource_limits: {
          max_instructions: 2000000000,
          max_memory_mb: 512,
          max_execution_seconds: 120,
        },
        response_format: "Json",
      };

      console.log("[NearEmailChat] Transaction args:", JSON.stringify(args, null, 2));
      toast.info("Sending message... please approve transaction (public on-chain)");

      // Use near-kit to send transaction (same as profile update)
      console.log("[NearEmailChat] Getting near client...");
      const near = nearAuth.getNearClient();
      console.log("[NearEmailChat] near client:", near);

      console.log("[NearEmailChat] Calling near.transaction().functionCall()...");
      await near
        .transaction(walletAccountId)
        .functionCall(NEAR_EMAIL_CONTRACT, "request_execution", args, {
          gas: "300 Tgas",
          attachedDeposit: "0.1 NEAR",
        })
        .send();

      console.log("[NearEmailChat] Transaction completed successfully");

      toast.success("Message sent via near.email (public on-chain)");

      // Update message ID
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId
            ? { ...msg, id: `sent_${Date.now()}` }
            : msg
        )
      );
    } catch (error) {
      console.error("[NearEmailChat] ERROR in handleSend:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to send message"
      );
      // Remove failed message
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
    } finally {
      console.log("[NearEmailChat] Finally block, setting sending to false");
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    console.log("[NearEmailChat] Key pressed:", e.key);
    if (e.key === "Enter" && !e.shiftKey) {
      console.log("[NearEmailChat] Enter pressed (no shift), triggering handleSend");
      e.preventDefault();
      handleSend();
    } else {
      console.log("[NearEmailChat] Key not handled");
    }
  };

  const displayName = recipientName || recipientAccountId.split(".")[0];

  // Don't render anything if the address is invalid
  if (!isValid) {
    return null;
  }

  const defaultTrigger = (
    <Button variant={variant} size="sm" className={className}>
      <MessageCircle className="mr-2 h-4 w-4" />
      Message
    </Button>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger || defaultTrigger}</SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 sm:max-w-md gap-0 bg-background border-primary/30"
      >
        {/* Header */}
        <SheetHeader className="flex flex-row items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/20">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 border border-primary/40">
              <AvatarImage src={recipientAvatar || undefined} />
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-mono font-bold">
                {displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-sm font-semibold text-foreground truncate">
                {displayName}
              </SheetTitle>
              <p className="text-xs text-muted-foreground font-mono truncate">
                {recipientAccountId}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </SheetHeader>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-sm text-muted-foreground">Loading messages...</div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <MessageCircle className="h-12 w-12 text-muted-foreground/30" />
              <div>
                <p className="text-sm font-medium text-foreground">No messages yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Start the conversation with {displayName}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isIncoming={message.isIncoming}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-border/50 bg-muted/20 p-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                disabled={isSending}
                className="pr-10 bg-background border-primary/30 text-foreground min-h-[40px]"
                maxLength={1000}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {inputValue.length}/1000
              </div>
            </div>
            <Button
              type="button"
              onClick={handleSend}
              disabled={!inputValue.trim() || isSending}
              size="icon"
              className="h-10 w-10 bg-primary text-primary-foreground shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            <span className="text-yellow-600 dark:text-yellow-400">⚠️ Public on-chain</span> • Messages via near.email
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Individual message bubble component
 */
function MessageBubble({
  message,
  isIncoming,
}: {
  message: EmailMessage;
  isIncoming: boolean;
}) {
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={cn(
        "flex w-full",
        isIncoming ? "justify-start" : "justify-end"
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm",
          isIncoming
            ? "bg-muted text-foreground rounded-tl-sm"
            : "bg-primary text-primary-foreground rounded-tr-sm"
        )}
      >
        {message.subject && message.subject !== "Message" && (
          <p className="text-xs font-medium mb-1 opacity-80">{message.subject}</p>
        )}
        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
          {message.body}
        </p>
        <p
          className={cn(
            "text-[10px] mt-1 text-right opacity-60",
            isIncoming ? "text-foreground" : "text-primary-foreground"
          )}
        >
          {time}
        </p>
      </div>
    </div>
  );
}

/**
 * Compact icon-only version
 */
export function NearEmailIcon({
  recipientAccountId,
  recipientName,
  recipientAvatar,
  className,
}: Omit<NearEmailChatProps, "variant" | "size" | "trigger">) {
  return (
    <NearEmailChat
      recipientAccountId={recipientAccountId}
      recipientName={recipientName}
      recipientAvatar={recipientAvatar}
      trigger={
        <MessageCircle
          className={cn(
            "h-5 w-5 text-primary hover:text-primary/80 cursor-pointer transition-colors",
            className
          )}
        />
      }
    />
  );
}
