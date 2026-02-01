import { useState, useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  minimal?: boolean;
}

type ViewMode = "edit" | "preview" | "split";

export const MarkdownEditor = forwardRef<HTMLTextAreaElement, MarkdownEditorProps>(({
  value: externalValue,
  onChange,
  placeholder = "Type '/' for commands...",
  rows = 6,
  minimal = false,
}, ref) => {
  const [localValue, setLocalValue] = useState(externalValue);
  const [viewMode, setViewMode] = useState<ViewMode>("edit");
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Expose textarea ref to parent
  useImperativeHandle(ref, () => textareaRef.current);

  // Sync local value with external value
  useEffect(() => {
    setLocalValue(externalValue);
  }, [externalValue]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const commands = [
    { icon: "📝", label: "Text", description: "Plain text", insert: "" },
    { icon: "📌", label: "Heading 1", description: "Large section heading", insert: "# " },
    { icon: "📎", label: "Heading 2", description: "Medium section heading", insert: "## " },
    { icon: "📎", label: "Heading 3", description: "Small section heading", insert: "### " },
    { icon: "💬", label: "Bullet List", description: "Simple bullet list", insert: "- " },
    { icon: "1️⃣", label: "Numbered List", description: "Numbered list", insert: "1. " },
    { icon: "✅", label: "Checkbox", description: "Task list", insert: "- [ ] " },
    { icon: "💭", label: "Quote", description: "Capture a quote", insert: "> " },
    { icon: "🔗", label: "Link", description: "Insert a link", insert: ["", "](url)"] },
    { icon: "🖼️", label: "Image", description: "Insert an image", insert: ["![alt](", ")"] },
    { icon: "💻", label: "Code", description: "Inline code", insert: ["`", "`"] },
    { icon: "📦", label: "Code Block", description: "Code block", insert: ["```\n", "\n```"] },
    { icon: "➖", label: "Divider", description: "Visual divider", insert: "\n---\n" },
    { icon: "⚠️", label: "Callout", description: "Highlight important info", insert: "> ⚠️ " },
  ];

  const insertText = (before: string, after: string = "", placeholderText: string = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = localValue;
    const selectedText = text.substring(start, end) || placeholderText;

    const newValue = text.substring(0, start) + before + selectedText + after + text.substring(end);
    setLocalValue(newValue);
    onChange(newValue);

    setTimeout(() => {
      textarea.focus();
      const newPosition = start + before.length + selectedText.length;
      textarea.setSelectionRange(newPosition, newPosition);
    }, 0);
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    onChange(newValue);

    // Check for slash command
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newValue.substring(0, cursorPos);
    const lastLineStart = textBeforeCursor.lastIndexOf("\n") + 1;
    const lastLine = textBeforeCursor.substring(lastLineStart);

    console.log("Slash check:", lastLine, lastLine.startsWith("/"));

    if (lastLine.startsWith("/")) {
      setShowSlashMenu(true);
      setSlashQuery(lastLine.slice(1).toLowerCase());
    } else {
      setShowSlashMenu(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSlashMenu) return;

    if (e.key === "Escape") {
      setShowSlashMenu(false);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const filtered = commands.filter((c) =>
        c.label.toLowerCase().includes(slashQuery)
      );
      if (filtered.length > 0) {
        selectCommand(filtered[0]);
      }
      return;
    }
  };

  const selectCommand = (command: (typeof commands)[0]) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = localValue.substring(0, cursorPos);
    const lastLineStart = textBeforeCursor.lastIndexOf("\n") + 1;

    // Remove the slash command
    const before = localValue.substring(0, lastLineStart);
    const after = localValue.substring(cursorPos);

    let newValue: string;
    if (Array.isArray(command.insert)) {
      newValue = before + command.insert[0] + command.insert[1] + after;
    } else {
      newValue = before + command.insert + after;
    }

    setLocalValue(newValue);
    onChange(newValue);
    setShowSlashMenu(false);

    setTimeout(() => {
      if (!textarea) return;
      textarea.focus();
      const newPos = lastLineStart + (Array.isArray(command.insert) ? command.insert[0].length : command.insert.length);
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const filteredCommands = commands.filter((c) =>
    c.label.toLowerCase().includes(slashQuery)
  );

  return (
    <div className="relative">
      {!minimal && (
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setViewMode("edit")}
              title="Edit mode"
              className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
                viewMode === "edit"
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              ✏️
            </button>
            <button
              type="button"
              onClick={() => setViewMode("split")}
              title="Split view"
              className={`px-2 py-1 text-xs font-mono rounded transition-colors hidden sm:block ${
                viewMode === "split"
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              ⎌
            </button>
            <button
              type="button"
              onClick={() => setViewMode("preview")}
              title="Preview mode"
              className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
                viewMode === "preview"
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              👁️
            </button>
          </div>
          <span className="text-xs text-muted-foreground">
            Markdown
          </span>
        </div>
      )}

      <div
        className={`relative border border-border/40 rounded-lg overflow-hidden bg-background ${
          viewMode === "split" ? "grid grid-cols-2 divide-x divide-border/40 sm:grid-cols-2" : ""
        }`}
      >
        {/* Editor */}
        {(viewMode === "edit" || viewMode === "split" || isMobile) && (
          <div className="relative">
            <textarea
              ref={textareaRef}
              id="markdown-textarea"
              value={localValue}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={rows}
              className={`w-full px-3 sm:px-4 py-3 text-sm leading-relaxed outline-none resize-y ${
                viewMode === "split" && !isMobile ? "border-none rounded-none" : ""
              }`}
              style={{
                minHeight: `${rows * 1.5}rem`,
              }}
            />

            {/* Slash command menu */}
            {showSlashMenu && (
              <div className="absolute left-2 right-2 sm:left-4 sm:right-4 mt-1 bg-background border border-border/50 rounded-lg shadow-lg z-50 overflow-hidden max-h-[60vh]">
                <div className="max-h-64 overflow-y-auto">
                  {filteredCommands.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No commands found
                    </div>
                  ) : (
                    filteredCommands.map((cmd, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => selectCommand(cmd)}
                        className="w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors flex items-center gap-3 active:bg-muted/50"
                      >
                        <span className="text-base sm:text-lg shrink-0">{cmd.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground">
                            {cmd.label}
                          </div>
                          <div className="text-xs text-muted-foreground truncate hidden sm:block">
                            {cmd.description}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
                <div className="px-3 py-2 bg-muted/30 border-t border-border/30 text-xs text-muted-foreground hidden sm:block">
                  Use ↑↓ to navigate, Enter to select, Esc to close
                </div>
                <div className="px-3 py-2 bg-muted/30 border-t border-border/30 text-xs text-muted-foreground sm:hidden text-center">
                  Tap to select
                </div>
              </div>
            )}
          </div>
        )}

        {/* Preview - hide on mobile when editing */}
        {(viewMode === "preview" || (viewMode === "split" && !isMobile)) && (
          <div
            className={`p-3 sm:p-4 overflow-auto bg-muted/20 ${
              viewMode === "split" && !isMobile ? "border-none rounded-none" : ""
            }`}
            style={{
              minHeight: `${rows * 1.5}rem`,
            }}
          >
            <Markdown content={localValue || "_Start writing..._"} />
          </div>
        )}
      </div>

      {!minimal && (
        <p className="mt-1.5 text-xs text-muted-foreground px-1">
          Type <kbd className="px-1.5 py-0.5 bg-muted rounded text-muted-foreground text-xs">/</kbd> for commands
        </p>
      )}
    </div>
  );
});

MarkdownEditor.displayName = "MarkdownEditor";
