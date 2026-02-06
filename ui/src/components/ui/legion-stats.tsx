import { Shield, Users } from "lucide-react";
import { useLegionStats } from "@/hooks/useLegionGraph";

interface LegionStatsProps {
  accountId: string;
  variant?: "default" | "compact";
}

/**
 * Display Legion graph stats (followers/following counts)
 * Only shows counts for the Legion-exclusive graph
 */
export function LegionStats({ accountId, variant = "default" }: LegionStatsProps) {
  const { data: stats, isLoading } = useLegionStats(accountId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-4">
        <div className="h-4 w-16 bg-muted/30 animate-pulse rounded" />
        <div className="h-4 w-16 bg-muted/30 animate-pulse rounded" />
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-1.5">
          <Shield className="size-3.5 text-amber-500" />
          <span className="font-semibold text-foreground">{stats?.followers || 0}</span>
          <span className="text-muted-foreground">Legion followers</span>
        </div>
        <span className="text-muted-foreground">·</span>
        <div className="flex items-center gap-1.5">
          <Users className="size-3.5 text-orange-500" />
          <span className="font-semibold text-foreground">{stats?.following || 0}</span>
          <span className="text-muted-foreground">following</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2 text-sm">
        <Shield className="size-4 text-amber-500" />
        <span className="font-semibold text-foreground">{stats?.followers || 0}</span>
        <span className="text-muted-foreground">Legion Followers</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Users className="size-4 text-orange-500" />
        <span className="font-semibold text-foreground">{stats?.following || 0}</span>
        <span className="text-muted-foreground">Legion Following</span>
      </div>
    </div>
  );
}
