import { Button } from "./button";
import { UserPlus, UserMinus } from "lucide-react";
import { useIsFollowing, useFollowUnfollow } from "@/hooks/useSocialGraph";

interface FollowButtonProps {
  accountId: string;
  currentUserId: string | undefined;
  variant?: "default" | "outline";
  size?: "default" | "sm" | "lg" | "icon";
  showIcon?: boolean;
  className?: string;
}

export function FollowButton({
  accountId,
  currentUserId,
  variant = "outline",
  size = "default",
  showIcon = true,
  className = "",
}: FollowButtonProps) {
  const isOwnProfile = currentUserId === accountId;
  const { data: isFollowingData, isLoading: isChecking } = useIsFollowing(currentUserId, accountId);
  const { follow, unfollow, isPending } = useFollowUnfollow();

  // Don't show button for own profile
  if (isOwnProfile) {
    return null;
  }

  // Show sign-in prompt if not authenticated
  if (!currentUserId) {
    return (
      <Button variant={variant} size={size} className={className} asChild>
        <a href="/login">Sign in to follow</a>
      </Button>
    );
  }

  const isFollowing = isFollowingData?.isFollowing || false;
  const isLoading = isChecking || isPending;

  const handleClick = () => {
    if (isFollowing) {
      unfollow(accountId);
    } else {
      follow(accountId);
    }
  };

  return (
    <Button
      variant={isFollowing ? "outline" : variant}
      size={size}
      className={className}
      onClick={handleClick}
      disabled={isLoading}
    >
      {showIcon && (
        isFollowing ? (
          <UserMinus className="size-4" />
        ) : (
          <UserPlus className="size-4" />
        )
      )}
      {isLoading ? "Loading..." : isFollowing ? "Following" : "Follow"}
    </Button>
  );
}
