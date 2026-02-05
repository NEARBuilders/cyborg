/**
 * NearEmailButton Component
 *
 * A reusable component for sending emails via near.email protocol
 * using NEAR blockchain transactions (wallet signing via near-kit).
 *
 * Can be used in chat and builders pages to contact NEAR accounts.
 *
 * Documentation: https://near.email/dev
 * - Contract: outlayer.near
 * - Email format: alice.near = alice@near.email
 * - Only .near addresses are supported for on-chain email delivery
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";

// =============================================================================
// NEAR EMAIL CONFIG
// =============================================================================

const NEAR_EMAIL_CONTRACT = "outlayer.near";
const NEAR_EMAIL_PROJECT_ID = "zavodil.near/near-email";

/**
 * Validates if a string is a valid NEAR account ID (.near address)
 * Rules:
 * - Must end with .near
 * - Must be 2-64 characters
 * - Can only contain lowercase letters, numbers, hyphens, and dots
 * - Must have at least one character before .near
 * - Cannot start or end with hyphen or dot
 * - Cannot have consecutive hyphens or dots
 */
export function isValidNearAddress(address: string): boolean {
  // Basic format check - must end with .near
  if (!address || !address.endsWith('.near')) {
    return false;
  }

  // Length check (account ID without .near: 1-32 chars, plus .near = 2-37 chars)
  if (address.length < 6 || address.length > 64) {
    return false;
  }

  // Character validation - only lowercase letters, numbers, hyphens, and dots
  const nearRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.([a-z0-9]([a-z0-9-]*[a-z0-9])?))*\.near$/;
  return nearRegex.test(address);
}

/**
 * Gets the near.email address for a NEAR account
 */
export function toNearEmailAddress(accountId: string): string {
  if (!isValidNearAddress(accountId)) {
    throw new Error(`Invalid NEAR address: ${accountId}`);
  }
  return `${accountId}@near.email`;
}

interface NearEmailButtonProps {
  /** The recipient NEAR account ID (e.g., "alice.near") */
  recipientAccountId: string;
  /** Optional recipient display name */
  recipientName?: string;
  /** Optional button variant */
  variant?: "default" | "ghost" | "outline" | "secondary" | "link";
  /** Optional button size */
  size?: "default" | "sm" | "lg" | "icon";
  /** Optional custom trigger button */
  trigger?: React.ReactNode;
  /** Optional className */
  className?: string;
}

interface EmailForm {
  subject: string;
  body: string;
}

export function NearEmailButton({
  recipientAccountId,
  recipientName,
  variant = "default",
  size = "default",
  trigger,
  className,
}: NearEmailButtonProps) {
  const [open, setOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [form, setForm] = useState<EmailForm>({ subject: "", body: "" });

  // Validate recipient account ID
  const isValid = isValidNearAddress(recipientAccountId);

  console.log("[NearEmailButton] Component mounted for:", recipientAccountId, "valid:", isValid);
  console.log("[NearEmailButton] authClient:", authClient);
  console.log("[NearEmailButton] authClient.near:", authClient?.near);

  const handleSend = async () => {
    console.log("[NearEmailButton] handleSend called");
    console.log("[NearEmailButton] Recipient:", recipientAccountId);
    console.log("[NearEmailButton] Form state:", { subject: form.subject, bodyLength: form.body?.length });

    // Recipient already validated during component mount
    // No need to re-validate here

    if (!form.subject.trim() || !form.body.trim()) {
      console.log("[NearEmailButton] Validation failed - empty fields");
      toast.error("Please fill in both subject and message");
      return;
    }

    console.log("[NearEmailButton] All validations passed, setting sending state...");
    setIsSending(true);

    try {
      console.log("[NearEmailButton] Getting authClient.near...");
      // Use same wallet setup as profile update (via near-kit)
      const nearAuth = authClient.near;
      console.log("[NearEmailButton] nearAuth:", nearAuth);

      if (!nearAuth) {
        console.log("[NearEmailButton] ERROR: No nearAuth found");
        throw new Error("No NEAR wallet connected");
      }

      console.log("[NearEmailButton] Getting wallet account ID...");
      const walletAccountId = nearAuth.getAccountId();
      console.log("[NearEmailButton] walletAccountId:", walletAccountId);

      if (!walletAccountId) {
        console.log("[NearEmailButton] ERROR: No wallet account ID");
        throw new Error("Please connect your NEAR wallet first");
      }

      // Prepare transaction args for near.email
      // Using send_email_plaintext (no encryption, content is public on-chain)
      // Format matches official documentation: to must be email address
      const inputData = JSON.stringify({
        action: "send_email_plaintext",
        to: `${recipientAccountId}@near.email`,
        subject: form.subject,
        body: form.body,
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

      console.log("[NearEmailButton] Transaction args:", JSON.stringify(args, null, 2));
      toast.info("Sending email... please approve transaction (content will be public on-chain)");

      // Use near-kit to send transaction (same as profile update)
      console.log("[NearEmailButton] Getting near client...");
      const near = nearAuth.getNearClient();
      console.log("[NearEmailButton] near client:", near);

      console.log("[NearEmailButton] Calling near.transaction().functionCall()...");
      await near
        .transaction(walletAccountId)
        .functionCall(NEAR_EMAIL_CONTRACT, "request_execution", args, {
          gas: "300 Tgas",
          attachedDeposit: "0.1 NEAR",
        })
        .send();

      console.log("[NearEmailButton] Transaction completed successfully");

      toast.success("Email sent successfully via near.email (public on-chain)");
      setOpen(false);
      setForm({ subject: "", body: "" });
    } catch (error) {
      console.error("[NearEmailButton] ERROR in handleSend:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to send email. Please try again."
      );
    } finally {
      console.log("[NearEmailButton] Finally block, setting sending to false");
      setIsSending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    console.log("[NearEmailButton] Form submitted, calling handleSend...");
    e.preventDefault();
    await handleSend();
  };

  // Don't render anything if the address is invalid
  if (!isValid) {
    return null;
  }

  const defaultTrigger = (
    <Button variant={variant} size={size} className={className}>
      <Mail className="mr-2 h-4 w-4" />
      Contact
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-background border-primary/30">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Send Email to {recipientName || recipientAccountId}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            via near.email
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Recipient Info */}
          <div className="p-3 bg-muted/30 rounded-lg border border-primary/20">
            <Label className="text-xs text-muted-foreground font-mono uppercase">
              To
            </Label>
            <p className="text-sm font-medium text-foreground mt-1">
              {recipientName || recipientAccountId}
            </p>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject" className="text-foreground">
              Subject
            </Label>
            <Input
              id="subject"
              type="text"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="Enter subject..."
              className="bg-muted/20 border-primary/30 text-foreground"
              disabled={isSending}
              maxLength={200}
              autoFocus
            />
          </div>

          {/* Body */}
          <div className="space-y-2">
            <Label htmlFor="body" className="text-foreground">
              Message
            </Label>
            <Textarea
              id="body"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Type your message..."
              className="bg-muted/20 border-primary/30 text-foreground min-h-[150px] resize-none"
              disabled={isSending}
              maxLength={5000}
            />
            <p className="text-xs text-muted-foreground text-right">
              {form.body.length} / 5000
            </p>
          </div>

          {/* Info */}
          <div className="text-xs text-muted-foreground bg-muted/20 p-3 rounded border border-border/50">
            <p className="font-medium mb-1 flex items-center gap-1">
              <span>⚠️</span> Public On-Chain
            </p>
            <ul className="space-y-1 ml-4 list-disc">
              <li>Messages are public on NEAR blockchain</li>
              <li>Anyone can view the content</li>
              <li>Sent via {recipientAccountId}</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSending}
              className="border-primary/30"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSending || !form.subject.trim() || !form.body.trim()}
              className="bg-primary text-primary-foreground"
            >
              {isSending ? "Sending..." : "Send Email"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Compact icon-only version for use in tight spaces
 */
export function NearEmailIcon({
  recipientAccountId,
  recipientName,
  className,
}: Omit<NearEmailButtonProps, "variant" | "size" | "trigger">) {
  return (
    <NearEmailButton
      recipientAccountId={recipientAccountId}
      recipientName={recipientName}
      variant="ghost"
      size="icon"
      trigger={
        <Mail className={`h-4 w-4 text-primary hover:text-primary/80 ${className || ""}`} />
      }
    />
  );
}
