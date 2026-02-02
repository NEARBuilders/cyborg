/**
 * Builder List Item Component
 * Single builder entry in the list
 */

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Builder } from "@/types/builders";

interface BuilderListItemProps {
  builder: Builder;
  isSelected: boolean;
  onSelect: () => void;
}

export function BuilderListItem({ builder, isSelected, onSelect }: BuilderListItemProps) {
  // Determine which NFT badges to show
  const badges = [];
  if (builder.isLegion) {
    badges.push({ label: "Ascendant", className: "bg-purple-500/20 text-purple-400 border-purple-500/40", icon: "🏆" });
  }
  if (builder.isInitiate) {
    badges.push({ label: "Initiate", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40", icon: "🌱" });
  }
  if (builder.isNearlegion) {
    badges.push({ label: "Legion", className: "bg-orange-500/20 text-orange-400 border-orange-500/40", icon: "⚔️" });
  }

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
        <div className="flex-1 min-w-0 space-y-1">
          <span className="font-mono text-base text-foreground font-medium truncate block">
            {builder.displayName}
          </span>
          {builder.displayName !== builder.accountId && (
            <span className="font-mono text-xs text-muted-foreground truncate block">
              {builder.accountId}
            </span>
          )}
          {/* Show NFT type badges */}
          {badges.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {badges.map((badge) => (
                <span
                  key={badge.label}
                  className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 font-mono font-medium border ${badge.className}`}
                  title={`Holds ${badge.label} NFT${badge.label === "Ascendant" ? "" : "s"}`}
                >
                  <span>{badge.icon}</span>
                  {badge.label}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className="text-muted-foreground/50 text-xl">›</span>
      </div>
    </button>
  );
}
