import { Skeleton } from "./skeleton";
import { Users, UserCheck } from "lucide-react";
import { useFollowers, useFollowing } from "@/hooks/useSocialGraph";
import { Link } from "@tanstack/react-router";

interface SocialStatsProps {
  accountId: string;
  className?: string;
}

export function SocialStats({ accountId, className = "" }: SocialStatsProps) {
  const { data: followersData, isLoading: isLoadingFollowers } = useFollowers(accountId, 1, 0);
  const { data: followingData, isLoading: isLoadingFollowing } = useFollowing(accountId, 1, 0);

  const followersCount = followersData?.total || 0;
  const followingCount = followingData?.total || 0;
  const isLoading = isLoadingFollowers || isLoadingFollowing;

  if (isLoading) {
    return (
      <div className={`flex items-center gap-4 ${className}`}>
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-20" />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <Link
        to={`/profile/${accountId}`}
        search={{ tab: "followers" }}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Users className="size-4" />
        <span className="font-semibold text-foreground">{followersCount}</span>
        <span>Followers</span>
      </Link>

      <Link
        to={`/profile/${accountId}`}
        search={{ tab: "following" }}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <UserCheck className="size-4" />
        <span className="font-semibold text-foreground">{followingCount}</span>
        <span>Following</span>
      </Link>
    </div>
  );
}
