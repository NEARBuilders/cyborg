import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { X } from "lucide-react";

interface EditModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  onSave: () => void | Promise<void>;
  isSaving?: boolean;
  children: React.ReactNode;
}

export function EditModal({ isOpen, onClose, title, onSave, isSaving, children }: EditModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
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
      // Prevent background scrolling
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
        ref={modalRef}
        className={`relative bg-background shadow-2xl ${
          isBottomSheet
            ? `w-full max-h-[85vh] rounded-t-2xl transform transition-transform duration-200 ${
                isClosing ? "translate-y-full" : "translate-y-0"
              }`
            : `w-full max-w-2xl max-h-[90vh] rounded-2xl transform transition-all duration-200 ${
                isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"
              }`
        } overflow-hidden flex flex-col`}
        style={
          isBottomSheet
            ? { maxHeight: "85vh" }
            : {}
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border/50 bg-background/95 backdrop-supports-[backdrop-filter]">
          <h2 className="text-base sm:text-lg font-semibold text-foreground pr-4">{title}</h2>
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
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
          {children}
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
            onClick={onSave}
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

interface ProjectEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (project: { name: string; description: string; status: string }) => void | Promise<void>;
  isSaving?: boolean;
  initialProject?: { name: string; description: string; status: string };
}

export function ProjectEditModal({
  isOpen,
  onClose,
  onSave,
  isSaving,
  initialProject = { name: "", description: "", status: "Active" },
}: ProjectEditModalProps) {
  const [name, setName] = useState(initialProject.name);
  const [description, setDescription] = useState(initialProject.description);
  const [status, setStatus] = useState(initialProject.status);

  useEffect(() => {
    if (isOpen) {
      setName(initialProject.name);
      setDescription(initialProject.description);
      setStatus(initialProject.status);
    }
  }, [isOpen, initialProject]);

  const handleSave = async () => {
    if (name.trim()) {
      await onSave({ name: name.trim(), description, status });
    }
  };

  return (
    <EditModal
      isOpen={isOpen}
      onClose={onClose}
      title={initialProject.name ? "Edit Project" : "Add Project"}
      onSave={handleSave}
      isSaving={isSaving}
    >
      <div className="space-y-5 sm:space-y-6">
        {/* Project Name */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Project Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My awesome project"
            className="h-10 sm:h-11 text-base"
            autoFocus
          />
        </div>

        {/* Status */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Status</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {["Active", "In Development", "Beta", "Completed"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`px-3 py-2.5 sm:px-4 sm:py-2.5 text-sm font-mono rounded-xl border transition-all ${
                  status === s
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/30 text-muted-foreground border-border/50 hover:border-primary/30 hover:bg-muted/50"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Description</label>
          <MarkdownEditor
            value={description}
            onChange={setDescription}
            placeholder="Describe your project... Type / for commands"
            rows={8}
          />
        </div>

        {/* Keyboard hint for desktop */}
        <div className="hidden sm:block text-xs text-muted-foreground text-center py-2">
          Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-muted-foreground font-mono">Esc</kbd> to close
        </div>
      </div>
    </EditModal>
  );
}
