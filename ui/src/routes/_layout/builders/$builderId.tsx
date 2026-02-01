import { createFileRoute, useParams } from "@tanstack/react-router";
import { BuilderDetails } from "@/components/builders/BuilderDetails";
import { Skeleton } from "@/components/ui/skeleton";
import { useBuildersWithProfiles, useUserRank } from "@/hooks";
import { useProfile } from "@/integrations/near-social-js";
import type { Builder } from "@/types/builders";
import { useMemo, useEffect, useState } from "react";

export const Route = createFileRoute("/_layout/builders/$builderId")({
  component: BuilderDetailPage,
  head: () => {
    return {
      meta: [
        { title: "Builder Profile - Legion Social" },
        { name: "description", content: "View NEAR builder profile" },
        { property: "og:title", content: "NEAR Builder Profile - Legion Social" },
        { property: "og:description", content: "View NEAR builder profile" },
        { property: "og:image", content: `${typeof window !== "undefined" ? window.location.origin : ""}/og.jpg` },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: `${typeof window !== "undefined" ? window.location.origin : ""}/og.jpg` },
      ],
    };
  },
});

function BuilderDetailPage() {
  const { builderId } = useParams({ strict: false });
  const { builders, isLoading: isLoadingBuilders } = useBuildersWithProfiles();

  // Find the builder from the NFT holder list
  const builderFromList = useMemo(
    () => builders.find((b) => b.accountId === builderId),
    [builders, builderId]
  );

  // Fetch NEAR Social profile directly for this account
  const { data: profile, isLoading: isLoadingProfile } = useProfile(builderId);

  // Prefetch rank for this builder
  useUserRank(builderId as string);

  // Create a builder object from NEAR Social profile if not in the list
  const builder = useMemo(() => {
    if (builderFromList) {
      return builderFromList;
    }

    // If not in the list but has a NEAR Social profile, create a builder from it
    if (profile) {
      const avatarUrl = profile.image?.ipfs_cid
        ? `https://ipfs.near.social/ipfs/${profile.image.ipfs_cid}`
        : profile.image?.url;

      const backgroundUrl = profile.backgroundImage?.ipfs_cid
        ? `https://ipfs.near.social/ipfs/${profile.backgroundImage.ipfs_cid}`
        : profile.backgroundImage?.url;

      const displayName = profile.name || builderId.split(".")[0];

      return {
        id: builderId,
        accountId: builderId,
        displayName,
        avatar: avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${builderId}`,
        backgroundImage: backgroundUrl,
        description: profile.description || "A member of the NEAR community.",
        tags: profile.tags ? Object.keys(profile.tags) : ["NEAR Community"],
        socials: {
          github: profile.linktree?.github || builderId.replace(".near", "").toLowerCase(),
          twitter: profile.linktree?.twitter,
          website: profile.linktree?.website,
          telegram: profile.linktree?.telegram,
        },
        projects: [],
        isLegion: false,
        isInitiate: false,
        nearSocialProfile: profile,
      } as Builder;
    }

    return null;
  }, [builderFromList, profile, builderId]);

  const isLoading = isLoadingBuilders || isLoadingProfile;

  // Add minimum duration for smoother transitions
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [minDurationElapsed, setMinDurationElapsed] = useState(false);

  useEffect(() => {
    // Show skeleton for at least 300ms to avoid flash
    const timer = setTimeout(() => {
      setMinDurationElapsed(true);
    }, 300);

    return () => clearTimeout(timer);
  }, [builderId]);

  useEffect(() => {
    if (!isLoading && minDurationElapsed) {
      // Add a small fade-out before showing content
      const timer = setTimeout(() => {
        setShowSkeleton(false);
      }, 100);
      return () => clearTimeout(timer);
    } else if (isLoading) {
      setShowSkeleton(true);
    }
  }, [isLoading, minDurationElapsed]);

  // Show skeleton while loading or during minimum duration
  if (showSkeleton || isLoading) {
    return <BuilderDetailSkeleton />;
  }

  if (!builder) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-4xl text-muted-foreground/20">👤</div>
          <h3 className="text-lg font-medium text-foreground">Profile not found</h3>
          <p className="text-muted-foreground text-sm">
            Could not load NEAR Social profile for {builderId}
          </p>
          <p className="text-muted-foreground text-xs mt-2">
            The account may not have a profile set up on social.near
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-300">
      <BuilderDetails builder={builder} />
    </div>
  );
}

function BuilderDetailSkeleton() {
  return (
    <div className="flex-1 border border-primary/30 bg-background h-full overflow-y-auto">
      {/* Content starts at top - no banner */}
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-start gap-4">
          <Skeleton className="size-16 sm:size-14 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-6 w-24" />
          </div>
        </div>

        {/* Skills Section Skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>

        {/* About Section Skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>

        {/* Projects Section Skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <div className="space-y-3">
            <div className="p-4 border border-border/50 space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-4 w-full" />
            </div>
            <div className="p-4 border border-border/50 space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        </div>

        {/* Socials Section Skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <div className="flex flex-wrap gap-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </div>
    </div>
  );
}
