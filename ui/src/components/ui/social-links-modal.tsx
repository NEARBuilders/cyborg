import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SocialLinksModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (links: { website?: string; github?: string; twitter?: string; telegram?: string }) => void | Promise<void>;
  isSaving?: boolean;
  initialLinks?: { website?: string; github?: string; twitter?: string; telegram?: string };
}

export function SocialLinksModal({
  isOpen,
  onClose,
  onSave,
  isSaving,
  initialLinks = { website: "", github: "", twitter: "", telegram: "" },
}: SocialLinksModalProps) {
  const [website, setWebsite] = useState(initialLinks.website || "");
  const [github, setGithub] = useState(initialLinks.github || "");
  const [twitter, setTwitter] = useState(initialLinks.twitter || "");
  const [telegram, setTelegram] = useState(initialLinks.telegram || "");
  const [isMobile, setIsMobile] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isClosing) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
    };
  }, [isOpen, isClosing]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 150);
  };

  const handleSave = async () => {
    await onSave({
      website: website.trim() || undefined,
      github: github.trim() || undefined,
      twitter: twitter.trim() || undefined,
      telegram: telegram.trim() || undefined,
    });
  };

  if (!isOpen) return null;

  const isBottomSheet = isMobile;

  return (
    <div
      className={`fixed inset-0 z-50 ${isBottomSheet ? "flex items-end justify-center" : "flex items-center justify-center p-4"}`}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          isClosing ? "opacity-0" : "opacity-100"
        }`}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={`relative bg-background shadow-2xl ${
          isBottomSheet
            ? `w-full max-h-[85vh] rounded-t-2xl transform transition-transform duration-200 ${
                isClosing ? "translate-y-full" : "translate-y-0"
              }`
            : `w-full max-w-md rounded-2xl transform transition-all duration-200 ${
                isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"
              }`
        } overflow-hidden flex flex-col`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border/50 bg-background/95 backdrop-supports-[backdrop-filter]">
          <h2 className="text-base sm:text-lg font-semibold text-foreground pr-4">Edit Social Links</h2>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1 -mr-1 rounded-lg hover:bg-muted/50"
            aria-label="Close"
          >
            <X className="size-5 sm:size-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
          <div className="space-y-5">
            {/* Info text */}
            <p className="text-sm text-muted-foreground">
              Update your social links. Changes will be saved to NEAR Social blockchain.
            </p>

            {/* Website */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Website</label>
              <Input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="jemartel.dev"
                className="h-10"
              />
            </div>

            {/* GitHub */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">GitHub Username</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">github.com/</span>
                <Input
                  value={github}
                  onChange={(e) => setGithub(e.target.value)}
                  placeholder="Kampouse"
                  className="h-10 flex-1"
                />
              </div>
            </div>

            {/* Twitter */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Twitter Username</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">@</span>
                <Input
                  value={twitter}
                  onChange={(e) => setTwitter(e.target.value)}
                  placeholder="jemartel98"
                  className="h-10 flex-1"
                />
              </div>
            </div>

            {/* Telegram */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Telegram Username</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">t.me/</span>
                <Input
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  placeholder="username"
                  className="h-10 flex-1"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-border/50 bg-muted/30/50 backdrop-supports-[backdrop-filter]">
          <Button
            variant="outline"
            onClick={handleClose}
            className="h-9 sm:h-10 px-4 sm:px-6 text-sm sm:text-base"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="h-9 sm:h-10 px-4 sm:px-6 text-sm sm:text-base"
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>

        {/* Mobile drag handle */}
        {isBottomSheet && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-muted-foreground/20 rounded-full" />
        )}
      </div>
    </div>
  );
}
