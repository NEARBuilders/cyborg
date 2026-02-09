/**
 * Chat Help Modal - Shows example queries
 */

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChatHelpModal({ isOpen, onClose }: ChatHelpModalProps) {
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

  const exampleQuery = (query: string) => {
    navigator.clipboard.writeText(query);
    // Optional: You could dispatch a custom event or call a callback
    // to populate the input field
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
            : `w-full max-w-2xl rounded-2xl transform transition-all duration-200 ${
                isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"
              }`
        } overflow-hidden flex flex-col max-h-[90vh]`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border/50 bg-background/95 backdrop-supports-[backdrop-filter]">
          <h2 className="text-base sm:text-lg font-semibold text-foreground pr-4">
            💬 What can I help you find?
          </h2>
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
          <div className="space-y-6">
            {/* Intro */}
            <div className="text-sm text-muted-foreground">
              <p>Click any example below to copy it to your clipboard, then paste it in the chat input!</p>
            </div>

            {/* Search by Skills & Interests */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span>🎯</span>
                <span>Search by Skills & Interests</span>
              </h3>
              <div className="space-y-2">
                <ExampleCard
                  query="Find React developers"
                  description="Discover builders who work with React"
                />
                <ExampleCard
                  query="Find people interested in DeFi and smart contracts"
                  description="Match all tags (both DeFi AND smart contracts)"
                />
                <ExampleCard
                  query="Find rust or python developers"
                  description="Match any tag (rust OR python)"
                />
                <ExampleCard
                  query="Find nft gaming builders"
                  description="Multiple interests"
                />
              </div>
            </div>

            {/* Search by Social Platform */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span>📱</span>
                <span>Search by Social Platform</span>
              </h3>
              <div className="space-y-2">
                <ExampleCard
                  query="Find people with Twitter"
                  description="Builders with Twitter/X accounts"
                />
                <ExampleCard
                  query="Find Telegram users"
                  description="Builders on Telegram"
                />
                <ExampleCard
                  query="Who has GitHub?"
                  description="Developers with GitHub profiles"
                />
                <ExampleCard
                  query="Find Discord users"
                  description="Community members on Discord"
                />
                <ExampleCard
                  query="Find YouTube creators"
                  description="Content creators on YouTube"
                />
              </div>
            </div>

            {/* Discover Legion Members */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span>🏆</span>
                <span>Discover Legion Members</span>
              </h3>
              <div className="space-y-2">
                <ExampleCard
                  query="List Ascendant members"
                  description="Highest rank members"
                />
                <ExampleCard
                  query="List Initiate members"
                  description="New Legion members"
                />
                <ExampleCard
                  query="Show me all NFT holders"
                  description="Legion NFT holders"
                />
              </div>
            </div>

            {/* Get Profile Info */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span>👤</span>
                <span>Get Profile Information</span>
              </h3>
              <div className="space-y-2">
                <ExampleCard
                  query="Tell me about example.near"
                  description="Get detailed profile info"
                />
                <ExampleCard
                  query="What's the rank of account.near?"
                  description="Check Legion rank tier"
                />
              </div>
            </div>

            {/* General Search */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span>🔍</span>
                <span>General Search</span>
              </h3>
              <div className="space-y-2">
                <ExampleCard
                  query="Find frontend developers"
                  description="Search by description/skills"
                />
                <ExampleCard
                  query="Who knows about blockchain?"
                  description="Keyword search"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-4 sm:px-6 py-4 border-t border-border/50 bg-muted/30/50 backdrop-supports-[backdrop-filter]">
          <Button
            variant="outline"
            onClick={handleClose}
            className="h-9 sm:h-10 px-4 sm:px-6 text-sm sm:text-base"
          >
            Got it!
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

function ExampleCard({ query, description }: { query: string; description: string }) {
  return (
    <div
      onClick={() => navigator.clipboard.writeText(query)}
      className="group p-3 bg-muted/20 border border-border/50 rounded-lg hover:border-primary/30 hover:bg-muted/30 transition-all cursor-pointer"
    >
      <code className="block text-sm font-mono text-primary group-hover:text-primary/80 mb-1">
        "{query}"
      </code>
      <p className="text-xs text-muted-foreground">{description}</p>
      <p className="text-[10px] text-muted-foreground/70 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        Click to copy
      </p>
    </div>
  );
}
