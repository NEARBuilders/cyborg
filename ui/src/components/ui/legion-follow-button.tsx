import { Button } from "./button";
import { Shield, ShieldCheck } from "lucide-react";
import { useLegionFollowers, useLegionFollowUnfollow } from "@/hooks/useLegionGraph";

interface LegionFollowButtonProps {
  accountId: string;
  currentUserId: string | undefined;
  showIcon?: boolean;
  size?: "default" | "sm" | "lg";
}

/**
 * Follow button for the social graph
 * Uses the viewed profile's followers list to check if current user is following them
 * (If current user is in their followers, they're following them)
 */
export function LegionFollowButton({
  accountId,
  currentUserId,
  showIcon = true,
  size = "default",
}: LegionFollowButtonProps) {
  const isOwnProfile = currentUserId === accountId;

  // Fetch the viewed profile's followers list (already loaded for display)
  const { data: followersData } = useLegionFollowers(accountId, 50, 0);

  const { follow, unfollow, isPending } = useLegionFollowUnfollow();

  if (isOwnProfile || !currentUserId) return null;

  // Check if current user is in the viewed profile's followers list
  const isFollowing = followersData?.accounts?.includes(currentUserId) || false;
  const isLoading = isPending;

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
