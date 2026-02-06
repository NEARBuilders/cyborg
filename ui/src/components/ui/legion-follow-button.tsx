import { Button } from "./button";
import { Shield, ShieldCheck } from "lucide-react";
import { useLegionIsFollowing, useLegionFollowUnfollow } from "@/hooks/useLegionGraph";

interface LegionFollowButtonProps {
  accountId: string;
  currentUserId: string | undefined;
  showIcon?: boolean;
  size?: "default" | "sm" | "lg";
}

/**
 * Follow button for the social graph
 */
export function LegionFollowButton({
  accountId,
  currentUserId,
  showIcon = true,
  size = "default",
}: LegionFollowButtonProps) {
  const isOwnProfile = currentUserId === accountId;
  const { data: isFollowingData, isLoading: isChecking } = useLegionIsFollowing(
    currentUserId,
    accountId
  );
  const { follow, unfollow, isPending } = useLegionFollowUnfollow();

  if (isOwnProfile || !currentUserId) return null;

  const isFollowing = isFollowingData?.isFollowing || false;
  const isLoading = isChecking || isPending;

  return (
    <Button
      variant={isFollowing ? "outline" : "default"}
      size={size}
      onClick={() => (isFollowing ? unfollow(accountId) : follow(accountId))}
      disabled={isLoading}
    >
      {showIcon && (isFollowing ? <ShieldCheck className="size-4" /> : <Shield className="size-4" />)}
      {isLoading ? "Loading..." : isFollowing ? "Following" : "Follow"}
    </Button>
  );
}
