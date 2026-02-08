import { useState, useEffect } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SocialLink {
  platform: string;
  url: string;
}

interface SocialLinksModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (links: Record<string, string>) => void | Promise<void>;
  isSaving?: boolean;
  initialLinks?: Record<string, string>;
}

export function SocialLinksModal({
  isOpen,
  onClose,
  onSave,
  isSaving,
  initialLinks = {},
}: SocialLinksModalProps) {
  // Convert initial links to array format
  const [links, setLinks] = useState<SocialLink[]>(
    Object.entries(initialLinks).map(([platform, url]) => ({ platform, url }))
  );
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
      // Reset links when modal opens
      setLinks(
        Object.entries(initialLinks).map(([platform, url]) => ({
          platform,
          url,
        }))
      );
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
    };
  }, [isOpen, isClosing, initialLinks]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 150);
  };

  const handleSave = async () => {
    // Convert array back to object, filtering out empty entries
    const linksObject: Record<string, string> = {};
    links.forEach(({ platform, url }) => {
      if (platform.trim() && url.trim()) {
        linksObject[platform.trim()] = url.trim();
      }
    });
    await onSave(linksObject);
  };

  const addLink = () => {
    setLinks([...links, { platform: "", url: "" }]);
  };

  const removeLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const updateLink = (index: number, field: keyof SocialLink, value: string) => {
    const updated = [...links];
    updated[index][field] = value;
    setLinks(updated);
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
            : `w-full max-w-lg rounded-2xl transform transition-all duration-200 ${
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
              Add your social links and websites. Enter the platform name and full URL.
            </p>

            {/* Links list */}
            <div className="space-y-4">
              {links.map((link, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <div className="flex-1 grid grid-cols-[140px_1fr] gap-2">
                    {/* Platform name */}
                    <Input
                      value={link.platform}
                      onChange={(e) => updateLink(index, "platform", e.target.value)}
                      placeholder="Platform"
                      className="h-10"
                    />
                    {/* URL */}
                    <Input
                      value={link.url}
                      onChange={(e) => updateLink(index, "url", e.target.value)}
                      placeholder="https://..."
                      className="h-10"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLink(index)}
                    className="shrink-0 h-10 w-10 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Add link button */}
            <Button
              type="button"
              variant="outline"
              onClick={addLink}
              className="w-full"
            >
              <Plus className="size-4 mr-2" />
              Add Link
            </Button>

            {/* Examples */}
            <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border/50">
              <p className="font-medium">Examples:</p>
              <p>Platform: "Twitter" → URL: "https://twitter.com/username"</p>
              <p>Platform: "GitHub" → URL: "https://github.com/username"</p>
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
