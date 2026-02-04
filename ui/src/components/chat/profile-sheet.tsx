/**
 * ProfileSheet Component
 * Slide-over panel on the right showing detailed profile information
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Github, Twitter, Globe, Send } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";

interface ProfileSheetProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
}

interface ProfileData {
  id: string;
  accountId: string;
  displayName: string;
  avatar: string;
  backgroundImage: string | null;
  description: string;
  tags: string[];
  role: string;
  projects: Array<{ name: string; description: string; status: string }>;
  socials: {
    github?: string;
    twitter?: string;
    website?: string;
    telegram?: string;
  };
  isLegion: boolean;
  isInitiate: boolean;
  isNearlegion: boolean;
  holdings: Array<{ contractId: string; quantity: number }>;
  hasCustomProfile: boolean;
  hasNearSocialProfile: boolean;
  nftAvatarUrl?: string;
}

// Fetch profile data from the builder API
async function fetchProfileData(accountId: string): Promise<ProfileData | null> {
  try {
    const response = await fetch(`/api/builders/${accountId}`);
    if (!response.ok) return null;
    const profile = await response.json();

    // Fetch NFT images to get Legion avatar
    try {
      const nftRes = await fetch(`/api/nfts/images/${accountId}`);
      const nftData = await nftRes.json();

      // Find the first Legion NFT to use as avatar
      const legionNft = nftData.images?.find(
        (img: any) => img.contractId === "nearlegion.nfts.tg" && img.tokens?.length > 0
      );

      if (legionNft) {
        profile.nftAvatarUrl = legionNft.tokens[0].imageUrl;
      }
    } catch {
      // If NFT fetch fails, continue with profile avatar
    }

    return profile;
  } catch {
    return null;
  }
}

export function ProfileSheet({ isOpen, onClose, accountId }: ProfileSheetProps) {
  const { data: profile, isLoading, error } = useQuery({
    queryKey: ["builder-profile", accountId],
    queryFn: () => fetchProfileData(accountId),
    enabled: isOpen && !!accountId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (error) {
    return (
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent side="right" className="w-full sm:max-w-md pl-6 pr-6">
          <SheetHeader>
            <SheetTitle>Profile Not Found</SheetTitle>
            <SheetDescription>
              Unable to load profile for {accountId}
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto pl-6 pr-6">
        {isLoading ? (
          <ProfileSheetSkeleton />
        ) : profile ? (
          <div className="space-y-4">
            {/* Header with background and avatar */}
            <div className="relative">
              {/* Background */}
              {profile.backgroundImage && (
                <div className="h-32 w-full overflow-hidden rounded-lg">
                  <img
                    src={profile.backgroundImage}
                    alt="Background"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {/* Avatar */}
              <div className={profile.backgroundImage ? "-mt-12" : ""}>
                <Avatar className="size-24 border-4 border-background">
                  <AvatarImage src={profile.nftAvatarUrl || profile.avatar || undefined} />
                  <AvatarFallback className="bg-primary/20 text-primary text-lg font-mono font-bold">
                    {profile.displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                {/* Name and role */}
                <div className="mt-3">
                  <h2 className="text-xl font-bold text-foreground">
                    {profile.displayName}
                  </h2>
                  <p className="text-sm font-mono text-muted-foreground">
                    {profile.accountId}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="inline-block text-xs bg-primary/25 text-primary px-2 py-0.5 font-mono font-medium">
                      {profile.role}
                    </span>
                    {profile.hasNearSocialProfile && (
                      <span className="inline-block text-xs bg-green-500/20 text-green-600 dark:text-green-400 px-2 py-0.5 font-mono text-xs">
                        ✓ Verified
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Description */}
            {profile.description && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">About</h3>
                <div className="text-sm text-muted-foreground">
                  <Markdown content={profile.description} />
                </div>
              </div>
            )}

            {/* Tags/Interests */}
            {profile.tags && profile.tags.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Interests & Skills</h3>
                <div className="flex flex-wrap gap-1.5">
                  {profile.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs bg-muted/60 text-foreground px-2 py-1 border border-border/50"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Projects */}
            {profile.projects && profile.projects.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Projects</h3>
                <div className="space-y-2">
                  {profile.projects.map((project, index) => (
                    <div key={index} className="p-3 bg-muted/20 border border-border/50 rounded-lg">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-foreground">{project.name}</h4>
                          {project.description && (
                            <p className="text-xs text-muted-foreground mt-1">{project.description}</p>
                          )}
                        </div>
                        {project.status && (
                          <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full whitespace-nowrap">
                            {project.status}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Social Links */}
            {(profile.socials.github || profile.socials.twitter || profile.socials.website || profile.socials.telegram) && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Social Links</h3>
                <div className="space-y-2">
                  {profile.socials.website && (
                    <a
                      href={
                        profile.socials.website.startsWith("http")
                          ? profile.socials.website
                          : `https://${profile.socials.website}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                    >
                      <Globe className="h-4 w-4" />
                      Website
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {profile.socials.github && (
                    <a
                      href={`https://github.com/${profile.socials.github}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                    >
                      <Github className="h-4 w-4" />
                      {profile.socials.github}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {profile.socials.twitter && (
                    <a
                      href={`https://twitter.com/${profile.socials.twitter}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                    >
                      <Twitter className="h-4 w-4" />
                      @{profile.socials.twitter}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {profile.socials.telegram && (
                    <a
                      href={`https://t.me/${profile.socials.telegram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                    >
                      <Send className="h-4 w-4" />
                      {profile.socials.telegram}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* NFT Holdings */}
            {profile.holdings && profile.holdings.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">NFT Holdings</h3>
                <div className="space-y-2">
                  {profile.holdings.map((holding) => {
                    const contractName = holding.contractId
                      .replace('.nearlegion.near', '')
                      .replace('.nfts.tg', '')
                      .replace('near.', '');

                    const isAscendant = holding.contractId === 'ascendant.nearlegion.near';
                    const isInitiate = holding.contractId === 'initiate.nearlegion.near';

                    return (
                      <div key={holding.contractId} className="flex items-center justify-between p-2 bg-muted/20 border border-primary/20 rounded-lg">
                        <div className="flex items-center gap-2">
                          {isAscendant && <span>🏆</span>}
                          {isInitiate && <span>🌱</span>}
                          <div>
                            <span className="text-sm font-medium">{contractName}</span>
                            <span className="text-xs text-muted-foreground ml-2">×{holding.quantity}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <a
                  href={`https://explorer.oneverse.near.org/accounts/${profile.accountId}?tab=nfts`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:text-primary/80 font-mono underline underline-offset-2"
                >
                  View all on NEAR Explorer →
                </a>
              </div>
            )}

            {/* View Full Profile Button */}
            <div className="pt-4 border-t border-border/50">
              <Button
                variant="default"
                className="w-full"
                asChild
                onClick={onClose}
              >
                <Link to="/profile/$accountId" params={{ accountId: profile.accountId }}>
                  View Full Profile
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No profile data available</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ProfileSheetSkeleton() {
  return (
    <div className="space-y-4">
      {/* Background */}
      <Skeleton className="h-32 w-full rounded-lg" />

      {/* Avatar section */}
      <div className="-mt-12">
        <div className="flex items-start gap-4">
          <Skeleton className="size-20 rounded-full border-4 border-background" />
          <div className="flex-1 space-y-2 mt-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-36" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>

      {/* Tags/Interests */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-16 rounded-md" />
          <Skeleton className="h-6 w-20 rounded-md" />
          <Skeleton className="h-6 w-14 rounded-md" />
          <Skeleton className="h-6 w-18 rounded-md" />
        </div>
      </div>

      {/* Projects */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <div className="space-y-2">
          <div className="p-3 bg-muted/20 border border-border/50 rounded-lg">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <Skeleton className="h-4 w-32 mb-1" />
                <Skeleton className="h-3 w-full" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </div>
          <div className="p-3 bg-muted/20 border border-border/50 rounded-lg">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <Skeleton className="h-4 w-28 mb-1" />
                <Skeleton className="h-3 w-3/4" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Social Links */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>

      {/* NFT Holdings */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 bg-muted/20 border border-primary/20 rounded-lg">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-8" />
            </div>
          </div>
          <div className="flex items-center justify-between p-2 bg-muted/20 border border-primary/20 rounded-lg">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-8" />
            </div>
          </div>
        </div>
      </div>

      {/* View Full Profile Button */}
      <div className="pt-4 border-t border-border/50">
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    </div>
  );
}
