import { Shield, Users } from "lucide-react";
import { useLegionStats } from "@/hooks/useLegionGraph";

interface LegionStatsProps {
  accountId: string;
  variant?: "default" | "compact";
  onFollowersClick?: () => void;
  onFollowingClick?: () => void;
}

/**
 * Display graph stats (followers/following counts)
 * Clickable to show followers/following lists
 */
export function LegionStats({
  accountId,
  variant = "default",
  onFollowersClick,
  onFollowingClick,
}: LegionStatsProps) {
  const { data: stats, isLoading } = useLegionStats(accountId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-4">
        <div className="h-4 w-16 bg-muted/30 animate-pulse rounded" />
        <div className="h-4 w-16 bg-muted/30 animate-pulse rounded" />
      </div>
    );
  }

  const buttonClass = "rounded-lg px-2 py-1 hover:bg-muted/50 transition-colors cursor-pointer";

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-3 text-sm">
        <button
          onClick={onFollowersClick}
          className={`flex items-center gap-1.5 ${buttonClass}`}
        >
          <Shield className="size-3.5 text-primary" />
          <span className="font-semibold text-foreground">{stats?.followers || 0}</span>
          <span className="text-muted-foreground">Followers</span>
        </button>
        <span className="text-muted-foreground">·</span>
        <button
          onClick={onFollowingClick}
          className={`flex items-center gap-1.5 ${buttonClass}`}
        >
          <Users className="size-3.5 text-primary" />
          <span className="font-semibold text-foreground">{stats?.following || 0}</span>
          <span className="text-muted-foreground">Following</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={onFollowersClick}
        className={`flex items-center gap-2 text-sm ${buttonClass}`}
      >
        <Shield className="size-4 text-primary" />
        <span className="font-semibold text-foreground">{stats?.followers || 0}</span>
        <span className="text-muted-foreground">Followers</span>
      </button>
      <button
        onClick={onFollowingClick}
        className={`flex items-center gap-2 text-sm ${buttonClass}`}
      >
        <Users className="size-4 text-primary" />
        <span className="font-semibold text-foreground">{stats?.following || 0}</span>
        <span className="text-muted-foreground">Following</span>
      </button>
    </div>
  );
}
