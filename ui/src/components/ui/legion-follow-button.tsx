import { Button } from "./button";
import { Shield, ShieldCheck } from "lucide-react";
import { useLegionIsFollowing, useLegionFollowUnfollow } from "@/hooks/useLegionGraph";

interface LegionFollowButtonProps {
  accountId: string;
  currentUserId: string | undefined;
  variant?: "default" | "outline" | "legion";
  showIcon?: boolean;
  size?: "default" | "sm" | "lg";
}

/**
 * Follow button for Legion-exclusive graph
 * Only works if both accounts hold Legion NFTs
 */
export function LegionFollowButton({
  accountId,
  currentUserId,
  variant = "legion",
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

  // Legion-specific styling
  const buttonVariant = variant === "legion" ? (isFollowing ? "outline" : "default") : variant;
  const buttonClass = variant === "legion" && !isFollowing
    ? "bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white border-amber-500"
    : "";

  return (
    <Button
      variant={buttonVariant}
      size={size}
      onClick={() => (isFollowing ? unfollow(accountId) : follow(accountId))}
      disabled={isLoading}
      className={buttonClass}
    >
      {showIcon && (isFollowing ? <ShieldCheck className="size-4" /> : <Shield className="size-4" />)}
      {isLoading ? "Loading..." : isFollowing ? "Following" : "Follow Legion"}
    </Button>
  );
}
