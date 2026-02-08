/**
 * Builder Details Component
 * Right panel showing selected builder info
 */

import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Markdown } from "@/components/ui/markdown";
import { NearEmailChat, isValidNearAddress } from "@/components/email";
import { LegionFollowButton } from "@/components/ui/legion-follow-button";
import { LegionStats } from "@/components/ui/legion-stats";
import type { Builder } from "@/types/builders";
import { useLegionFollowers, useLegionFollowing } from "@/hooks/useLegionGraph";
import { authClient } from "@/lib/auth-client";
import { useProfiles } from "@/integrations/near-social-js";
import {
  Github,
  Twitter,
  Send,
  Globe,
  MessageCircle,
  Video,
  Linkedin,
  Instagram,
  Youtube,
  ExternalLink
} from "lucide-react";

interface BuilderDetailsProps {
  builder: Builder;
}

export function BuilderDetails({ builder }: BuilderDetailsProps) {
  const nearState = authClient.useNearState();
  const currentAccountId = nearState?.accountId;

  // Tab state (followers/following)
  const [tab, setTab] = useState<"none" | "followers" | "following">("none");

  // Reset tab when changing profiles
  useEffect(() => {
    setTab("none");
  }, [builder.accountId]);

  // Fetch data once for counts - will be cached and reused for list display
  const followersData = useLegionFollowers(builder.accountId, 50, 0);
  const followingData = useLegionFollowing(builder.accountId, 50, 0);

  const followersCount = followersData.data?.accounts?.length ?? 0;
  const followingCount = followingData.data?.accounts?.length ?? 0;

  return (
    <div className="flex-1 min-h-0 border border-primary/30 bg-background overflow-y-auto">
      {/* Background Image Banner */}
      {builder.backgroundImage && (
        <div className="relative h-48 sm:h-56 lg:h-64 overflow-hidden">
          <img
            src={builder.backgroundImage}
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/40 to-background" />
        </div>
      )}

      <div className={`p-4 sm:p-6 space-y-6 ${builder.backgroundImage ? "-mt-16 sm:-mt-20 relative" : ""}`}>
        {/* Header */}
        <BuilderHeader builder={builder} />

        {/* Stats & Follow Button */}
        <div className="flex items-center justify-between gap-4">
          <LegionStatsInline
            followersCount={followersCount}
            followingCount={followingCount}
            onFollowersClick={() => setTab(tab === "followers" ? "none" : "followers")}
            onFollowingClick={() => setTab(tab === "following" ? "none" : "following")}
            activeTab={tab}
          />
          {currentAccountId && currentAccountId !== builder.accountId && (
            <div className="mr-2">
              <LegionFollowButton
                accountId={builder.accountId}
                currentUserId={currentAccountId}
                size="sm"
              />
            </div>
          )}
        </div>

        {/* Followers/Following List - only shown when tab is clicked, uses cached data */}
        {tab !== "none" && (
          <div className="space-y-4 p-3 bg-muted/20 border border-border/50 rounded-lg animate-in fade-in slide-in-from-top-2 duration-200">
            <LegionSocialList
              accountId={builder.accountId}
              type={tab}
              followersData={followersData}
              followingData={followingData}
              onClose={() => setTab("none")}
            />
          </div>
        )}

        {/* Contact via Email */}
        <BuilderContact builder={builder} />

        {/* Skills */}
        <BuilderSkills tags={builder.tags} />

        {/* About */}
        <BuilderAbout description={builder.description} />

        {/* Projects */}
        <BuilderProjects projects={builder.projects} />

        {/* NFT Holdings Grid */}
        {(builder.holdings && builder.holdings.length > 0) && <NFTGrid holdings={builder.holdings} accountId={builder.accountId} />}

        {/* Socials */}
        {builder.socials && <BuilderSocials socials={builder.socials} />}
      </div>
    </div>
  );
}

function BuilderHeader({ builder }: { builder: Builder }) {
  return (
    <div className="flex items-start gap-4">
      <Avatar className="size-16 sm:size-14 border-2 border-primary/60">
        <AvatarImage src={builder.avatar || undefined} />
        <AvatarFallback className="bg-primary/20 text-primary text-lg sm:text-base font-mono font-bold">
          {builder.displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-xl sm:text-xl font-bold text-foreground">
              {builder.displayName}
            </h2>
            <p className="font-mono text-primary text-sm sm:text-sm">{builder.accountId}</p>
          </div>
        </div>
        <span className="inline-block text-xs bg-primary/25 text-primary px-3 py-1.5 font-mono font-medium">
          {builder.role}
        </span>
      </div>
    </div>
  );
}

function BuilderContact({ builder }: { builder: Builder }) {
  if (!isValidNearAddress(builder.accountId)) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
        Contact
      </h3>
      <div className="flex flex-wrap gap-3">
        <NearEmailChat
          recipientAccountId={builder.accountId}
          recipientName={builder.displayName}
          recipientAvatar={builder.avatar || undefined}
          variant="default"
        />
      </div>
    </div>
  );
}

function BuilderSkills({ tags }: { tags: string[] }) {
  // Filter out default NEAR tags
  const filteredTags = tags.filter(tag =>
    !["NEAR Expert", "Developer", "Community Leader"].includes(tag)
  );

  if (filteredTags.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
        Skills
      </h3>
      <div className="flex flex-wrap gap-2">
        {filteredTags.map((tag) => (
          <span
            key={tag}
            className="text-sm bg-muted/60 text-foreground px-3 py-1.5 border border-border/50"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

function BuilderAbout({ description }: { description: string }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
        About
      </h3>
      <Markdown content={description} />
    </div>
  );
}

function BuilderProjects({
  projects,
}: {
  projects: { name: string; description: string; status: string }[];
}) {
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  if (projects.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
        Building
      </h3>
      <div className="space-y-3">
        {projects.map((project) => {
          const isExpanded = expandedProject === project.name;
          return (
            <div
              key={project.name}
              className="p-4 border border-border/50 bg-muted/30 space-y-2 cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => setExpandedProject(isExpanded ? null : project.name)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-foreground font-semibold text-base">
                  {project.name}
                </span>
                <div className="flex items-center gap-2">
                  <ProjectStatus status={project.status} />
                  <span className="text-muted-foreground text-xs">
                    {isExpanded ? "▼" : "▶"}
                  </span>
                </div>
              </div>
              {isExpanded && (
                <div className="pt-2 border-t border-border/30 mt-2">
                  <div className="text-sm text-muted-foreground">
                    <Markdown content={project.description} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProjectStatus({ status }: { status: string }) {
  const statusClass =
    status === "Active"
      ? "bg-primary/30 text-primary border-primary/40"
      : status === "In Development"
        ? "bg-accent/30 text-accent border-accent/40"
        : status === "Beta"
          ? "bg-blue-500/30 text-blue-400 border-blue-500/40"
          : "bg-muted text-muted-foreground border-border";

  return (
    <span className={`text-[10px] px-2 py-0.5 font-mono font-medium border ${statusClass}`}>
      {status}
    </span>
  );
}

function BuilderSocials({
  socials,
}: {
  socials: Record<string, string>;
}) {
  const linkEntries = Object.entries(socials || {})
    .filter(([_, url]) => url && typeof url === "string")
    .map(([platform, url]) => [platform, url.trim() as string]);

  if (linkEntries.length === 0) return null;

  // Icon mapping for common platforms
  const getIcon = (platform: string) => {
    const lowerPlatform = platform.toLowerCase();

    if (lowerPlatform.includes("github")) return <Github className="size-4" />;
    if (lowerPlatform.includes("twitter") || lowerPlatform.includes("x.com")) return <Twitter className="size-4" />;
    if (lowerPlatform.includes("telegram")) return <Send className="size-4" />;
    if (lowerPlatform.includes("discord")) return <MessageCircle className="size-4" />;
    if (lowerPlatform.includes("youtube")) return <Youtube className="size-4" />;
    if (lowerPlatform.includes("linkedin")) return <Linkedin className="size-4" />;
    if (lowerPlatform.includes("instagram")) return <Instagram className="size-4" />;
    if (lowerPlatform.includes("website") || lowerPlatform.includes("web")) return <Globe className="size-4" />;
    if (lowerPlatform.includes("video") || lowerPlatform.includes("zoom") || lowerPlatform.includes("meet")) return <Video className="size-4" />;

    return <ExternalLink className="size-4" />;
  };

  // Build proper URL based on platform
  const buildUrl = (platform: string, url: string): string => {
    const lowerPlatform = platform.toLowerCase();
    const cleanUrl = url.trim();

    // If already has protocol, return as is
    if (cleanUrl.match(/^https?:\/\//i)) {
      return cleanUrl;
    }

    // Platform-specific URL construction
    if (lowerPlatform.includes("github")) {
      // If it's just a username, construct GitHub URL
      if (!cleanUrl.includes("/") && !cleanUrl.includes(".")) {
        return `https://github.com/${cleanUrl}`;
      }
    }
    if (lowerPlatform.includes("twitter") || lowerPlatform.includes("x.com")) {
      if (!cleanUrl.includes("/") && !cleanUrl.includes(".")) {
        return `https://twitter.com/${cleanUrl}`;
      }
    }
    if (lowerPlatform.includes("linkedin")) {
      if (!cleanUrl.includes("linkedin.com/")) {
        return `https://linkedin.com/in/${cleanUrl}`;
      }
    }
    if (lowerPlatform.includes("telegram")) {
      if (!cleanUrl.includes("t.me/")) {
        return `https://t.me/${cleanUrl}`;
      }
    }
    if (lowerPlatform.includes("discord")) {
      if (!cleanUrl.includes("discord.gg") && !cleanUrl.includes("discord.com")) {
        return `https://discord.gg/${cleanUrl}`;
      }
    }
    if (lowerPlatform.includes("youtube")) {
      if (!cleanUrl.includes("youtube.com/") && !cleanUrl.includes("youtu.be/")) {
        return `https://youtube.com/@${cleanUrl}`;
      }
    }

    // Default: add https:// if not present
    return `https://${cleanUrl}`;
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
        Connect
      </h3>
      <div className="flex flex-wrap gap-4">
        {linkEntries.map(([platform, url]) => {
          const href = buildUrl(platform, url);

          return (
            <a
              key={platform}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:text-primary/80 transition-colors font-mono underline underline-offset-4 inline-flex items-center gap-1.5"
            >
              {getIcon(platform)}
              {platform}
            </a>
          );
        })}
      </div>
    </div>
  );
}

function NFTGrid({ holdings, accountId }: { holdings: Array<{ contractId: string; quantity: number }>; accountId: string }) {
  const [nftImages, setNftImages] = useState<Array<{ contractId: string; tokens: Array<{ tokenId: string; imageUrl: string; title: string }> }> | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (holdings.length === 0) return;

    // Check if user has nearlegion.nfts.tg holdings
    const hasNearLegion = holdings.some(h => h.contractId === 'nearlegion.nfts.tg');
    if (!hasNearLegion) return;

    setIsLoading(true);
    fetch(`/api/nfts/images/${accountId}`)
      .then((res) => res.json())
      .then((data) => {
        setNftImages(data.images);
      })
      .catch((error) => {
        console.error('[NFTGrid] Error fetching images:', error);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [accountId, holdings]);

  if (holdings.length === 0) {
    return null;
  }

  const hasNearLegion = holdings.some(h => h.contractId === 'nearlegion.nfts.tg');

  return (
    <div className="space-y-4">
      <h3 className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
        NFT Collection
      </h3>

      {/* Show NFT images grid for nearlegion.nfts.tg */}
      {hasNearLegion && (
        <div className="space-y-2">
          {isLoading ? (
            <div className="text-xs text-muted-foreground">Loading NFT images...</div>
          ) : nftImages && nftImages.length > 0 ? (
            nftImages.map((contract) => (
              contract.contractId === 'nearlegion.nfts.tg' && contract.tokens.length > 0 && (
                <div key={contract.contractId} className="space-y-2">
                  <div className="text-xs text-muted-foreground/80">
                    Legion Collection ({contract.tokens.length} items)
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                    {contract.tokens.slice(0, 20).map((token) => (
                      <div
                        key={token.tokenId}
                        className="aspect-square rounded-lg bg-muted/30 border border-primary/30 overflow-hidden relative group"
                      >
                        <img
                          src={token.imageUrl}
                          alt={`Legion NFT #${token.tokenId}`}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${token.tokenId}`;
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    ))}
                  </div>
                </div>
              )
            ))
          ) : (
            <div className="text-xs text-muted-foreground">No NFT images available</div>
          )}
        </div>
      )}

      {/* Other holdings without images - just show count */}
      {holdings
        .filter(h => h.contractId !== 'nearlegion.nfts.tg')
        .map((holding) => {
          const contractName = holding.contractId
            .replace('.nearlegion.near', '')
            .replace('.nfts.tg', '')
            .replace('near.', '');

          const isAscendant = holding.contractId === 'ascendant.nearlegion.near';
          const isInitiate = holding.contractId === 'initiate.nearlegion.near';

          return (
            <div key={holding.contractId} className="flex items-center justify-between p-3 bg-muted/20 border border-primary/20 rounded-lg">
              <div className="flex items-center gap-3">
                {isAscendant && <span className="text-lg">🏆</span>}
                {isInitiate && <span className="text-lg">🌱</span>}
                <div>
                  <span className="text-sm font-medium">{contractName}</span>
                  <span className="text-xs text-muted-foreground ml-2">×{holding.quantity}</span>
                </div>
              </div>
              <a
                href={`https://explorer.oneverse.near.org/accounts/${accountId}?tab=nfts`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:text-primary/80 font-mono underline underline-offset-2"
              >
                View →
              </a>
            </div>
          );
        })}
    </div>
  );
}

// =============================================================================
// LEGION STATS INLINE COMPONENT (displays counts without fetching)
// =============================================================================

interface LegionStatsInlineProps {
  followersCount: number;
  followingCount: number;
  onFollowersClick: () => void;
  onFollowingClick: () => void;
  activeTab: "none" | "followers" | "following";
}

function LegionStatsInline({ followersCount, followingCount, onFollowersClick, onFollowingClick, activeTab }: LegionStatsInlineProps) {
  const isFollowersActive = activeTab === "followers";
  const isFollowingActive = activeTab === "following";

  return (
    <div className="flex items-center gap-4 text-sm">
      <button
        onClick={onFollowersClick}
        className={`hover:text-primary transition-colors cursor-pointer ${isFollowersActive ? "text-primary font-semibold" : ""}`}
      >
        <span>{followersCount || (isFollowersActive ? "0" : "")}</span>
        <span className="text-muted-foreground ml-1">followers</span>
      </button>
      <span className="text-muted-foreground">·</span>
      <button
        onClick={onFollowingClick}
        className={`hover:text-primary transition-colors cursor-pointer ${isFollowingActive ? "text-primary font-semibold" : ""}`}
      >
        <span>{followingCount || (isFollowingActive ? "0" : "")}</span>
        <span className="text-muted-foreground ml-1">following</span>
      </button>
    </div>
  );
}

// =============================================================================
// LEGION SOCIAL LIST COMPONENT
// =============================================================================

interface LegionSocialListProps {
  accountId: string;
  type: "followers" | "following";
  followersData: ReturnType<typeof useLegionFollowers>;
  followingData: ReturnType<typeof useLegionFollowing>;
  onClose: () => void;
}

function LegionSocialList({ accountId, type, followersData, followingData, onClose }: LegionSocialListProps) {
  // Use passed data (already fetched for counts)
  const { data, isLoading, isError } =
    type === "followers" ? followersData : followingData;
  // FastData API returns accounts as string[] (not objects)
  const items = data?.accounts;

  // Fetch profiles for all accounts to get proper names and images
  const accountIds = items || [];
  const { profiles } = useProfiles(accountIds);

  // Get counts for both tabs
  const followersCount = followersData.data?.accounts?.length ?? 0;
  const followingCount = followingData.data?.accounts?.length ?? 0;

  if (isLoading) {
    return (
      <div className="p-3 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2">
            <Skeleton className="size-10 rounded-full bg-muted/30" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24 bg-muted/30" />
              <Skeleton className="h-3 w-32 bg-muted/30" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-muted-foreground mb-2">Failed to load {type}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-xs text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p className="text-sm">No {type} yet</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-muted/50 z-10"
        aria-label="Close"
      >
        ✕
      </button>
      <div className="divide-y divide-border/50">
        {items.map((accountId, index) => {
          const profile = profiles.get(accountId);
          const displayName = profile?.name || accountId.split(".")[0];
          const avatarUrl = profile?.image?.ipfs_cid
            ? `https://ipfs.near.social/ipfs/${profile.image.ipfs_cid}`
            : profile?.image?.url || undefined;

          return (
            <Link
              key={accountId}
              to="/builders/$builderId"
              params={{ builderId: accountId }}
              className="flex items-start gap-4 px-4 py-3 hover:bg-muted/50 transition-colors block animate-in fade-in slide-in-from-left-2 duration-200"
              style={{ animationDelay: `${Math.min(index * 30, 200)}ms` }}
            >
              <Avatar className="size-10">
                <AvatarImage src={avatarUrl} />
                <AvatarFallback className="bg-primary/20 text-primary text-sm font-mono font-bold">
                  {displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">
                  {displayName}
                </p>
                {profile?.name && (
                  <p className="text-sm text-muted-foreground truncate font-mono">
                    {accountId}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
