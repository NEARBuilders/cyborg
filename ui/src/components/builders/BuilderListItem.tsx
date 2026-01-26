/**
 * Builder List Item Component
 * Single builder entry in the list
 */

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export interface Builder {
  id: string;
  accountId: string;
  displayName: string;
  avatar: string | null;
  role: string;
  tags: string[];
  description: string;
  projects: {
    name: string;
    description: string;
    status: string;
  }[];
  socials: {
    github?: string;
    twitter?: string;
  };
}

interface BuilderListItemProps {
  builder: Builder;
  isSelected: boolean;
  onSelect: () => void;
}

export function BuilderListItem({ builder, isSelected, onSelect }: BuilderListItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-4 py-4 transition-colors hover:bg-primary/10 ${
        isSelected
          ? "bg-primary/15 border-l-3 border-l-primary"
          : "hover:border-l-3 hover:border-l-primary/50"
      }`}
    >
      <div className="flex gap-4 items-center">
        <Avatar className="size-12 border-2 border-primary/40">
          <AvatarImage src={builder.avatar || undefined} />
          <AvatarFallback className="bg-primary/10 text-primary text-sm font-mono font-bold">
            {builder.displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 space-y-1.5">
          <span className="font-mono text-base text-foreground font-medium truncate block">
            {builder.accountId}
          </span>
          <div className="flex flex-wrap gap-1">
            <span className="text-xs text-primary/80 bg-primary/10 px-2 py-0.5 border border-primary/20">
              {builder.role}
            </span>
          </div>
        </div>
        <span className="text-muted-foreground/50 text-xl">›</span>
      </div>
    </button>
  );
}
