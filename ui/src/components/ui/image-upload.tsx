import { useState, useRef, useEffect } from "react";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";

interface ImageUploadProps {
  currentImage?: string;
  label: string;
  type: "avatar" | "background";
  onImageSelect?: (file: File) => void;
  showPreview?: boolean;
  compact?: boolean;
  pendingFile?: File | null;
}

export function ImageUpload({
  currentImage,
  label,
  type,
  onImageSelect,
  showPreview = true,
  compact = false,
  pendingFile,
}: ImageUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(showPreview ? (currentImage || null) : null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update preview when pending file changes (from parent)
  useEffect(() => {
    if (pendingFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(pendingFile);
    } else if (currentImage) {
      setPreviewUrl(currentImage);
    } else {
      setPreviewUrl(null);
    }
  }, [pendingFile, currentImage, showPreview]);

  const handleFileSelect = (file: File) => {
    // Check file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5MB");
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Pass file to parent - will be uploaded on save
    if (onImageSelect) {
      onImageSelect(file);
    }

    toast.info("Image selected. Click Save to upload.");
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    if (onImageSelect) {
      onImageSelect(null as any);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <div className="flex gap-2">
          {previewUrl && !compact && (
            <button
              type="button"
              onClick={handleRemove}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
            >
              <X className="size-3" />
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Compact mode - clickable button */}
      {compact ? (
        <div className="relative">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-muted/40 hover:bg-muted/60 border border-border/50 rounded-lg transition-colors"
          >
            <Upload className="size-4 text-muted-foreground" />
            <span>Change {label.toLowerCase()}</span>
          </button>
        </div>
      ) : (
        /* Full upload area */
        <div className="relative flex items-center justify-center overflow-hidden border-2 border-dashed border-border/50 rounded-lg transition-colors hover:border-primary/30 hover:bg-muted/30">
          {showPreview && previewUrl ? (
            <img
              src={previewUrl}
              alt={label}
              className={`object-cover ${
                type === "avatar" ? "size-16 sm:size-20" : "w-full h-32 sm:h-40"
              }`}
            />
          ) : (
            <label className="flex flex-col items-center gap-2 cursor-pointer py-6">
              <Upload className="size-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Click to upload</span>
              <span className="text-xs text-muted-foreground">
                PNG, JPG, GIF up to 5MB
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
            </label>
          )}
        </div>
      )}

      {/* Help text - only show in non-compact mode */}
      {!compact && (
        <p className="text-xs text-muted-foreground">
          {type === "avatar"
            ? "Your profile picture (recommended: 400x400px)"
            : "Background banner image (recommended: 1200x400px)"}
        </p>
      )}
    </div>
  );
}

