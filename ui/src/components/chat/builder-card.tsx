/**
 * BuilderCard Component for Chat
 * Renders builder data in chat messages with the same styling as the builders page
 */

import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Markdown } from "@/components/ui/markdown";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { Builder } from "@/types/builders";
import { ExternalLink } from "lucide-react";

interface BuilderCardProps {
  builder: Builder;
}

// Prefetch function for profile data
async function prefetchProfileData(accountId: string) {
  try {
    const response = await fetch(`/api/builders/${accountId}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// Skeleton loader for BuilderCard - highly detailed
export function BuilderCardSkeleton() {
  return (
    <div className="my-3 border border-primary/30 bg-background rounded-lg overflow-hidden animate-in fade-in duration-300">
      {/* Header */}
      <div className="p-3 bg-muted/20 border-b border-border/50 flex items-start gap-3">
        <Skeleton className="size-12 rounded-full border-2 border-primary/30" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-36 rounded-sm" />
            <Skeleton className="h-4 w-4 rounded-full" />
          </div>
          <Skeleton className="h-3 w-40 rounded-sm" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-20 rounded-md" />
            <Skeleton className="h-4 w-16 rounded-sm" />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-3">
        {/* Description */}
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-full rounded-sm" />
          <Skeleton className="h-3.5 w-[95%] rounded-sm" />
          <Skeleton className="h-3.5 w-[80%] rounded-sm" />
        </div>

        {/* Skills Section */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-20 rounded-sm" />
          <div className="flex flex-wrap gap-1.5">
            <Skeleton className="h-6 w-14 rounded-md" />
            <Skeleton className="h-6 w-16 rounded-md" />
            <Skeleton className="h-6 w-12 rounded-md" />
            <Skeleton className="h-6 w-18 rounded-md" />
            <Skeleton className="h-6 w-14 rounded-md" />
          </div>
        </div>

        {/* Social Links */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-16 rounded-sm" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-16 rounded-sm" />
            <Skeleton className="h-4 w-14 rounded-sm" />
            <Skeleton className="h-4 w-20 rounded-sm" />
          </div>
        </div>

        {/* NFT Collection */}
        <div className="pt-2 border-t border-border/50 space-y-2">
          <Skeleton className="h-3 w-32 rounded-sm" />
          <div className="grid grid-cols-5 gap-2">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        </div>

        {/* Holdings */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between p-2 bg-muted/20 border border-primary/20 rounded-lg">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-24 rounded-sm" />
              <Skeleton className="h-4 w-8 rounded-sm" />
            </div>
            <Skeleton className="h-3 w-12 rounded-sm" />
          </div>
          <div className="flex items-center justify-between p-2 bg-muted/20 border border-primary/20 rounded-lg">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-20 rounded-sm" />
              <Skeleton className="h-4 w-8 rounded-sm" />
            </div>
            <Skeleton className="h-3 w-12 rounded-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function BuilderCard({ builder }: BuilderCardProps) {
  const [nftImages, setNftImages] = useState<Array<{ contractId: string; tokens: Array<{ tokenId: string; imageUrl: string; title: string }> }> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!builder.holdings || builder.holdings.length === 0) return;

    const hasNearLegion = builder.holdings.some(h => h.contractId === 'nearlegion.nfts.tg');
    if (!hasNearLegion) return;

    setIsLoading(true);
    fetch(`/api/nfts/images/${builder.accountId}`)
      .then((res) => res.json())
      .then((data) => {
        setNftImages(data.images);
      })
      .catch((error) => {
        console.error('[BuilderCard] Error fetching images:', error);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [builder.accountId, builder.holdings]);

  const hasNearLegion = builder.holdings?.some(h => h.contractId === 'nearlegion.nfts.tg');

  return (
    <div className="my-3 border border-primary/30 bg-background rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-3 bg-muted/20 border-b border-border/50 flex items-start gap-3">
        <Avatar className="size-12 border-2 border-primary/60">
          <AvatarImage src={builder.avatar || undefined} />
          <AvatarFallback className="bg-primary/20 text-primary text-xs font-mono font-bold">
            {builder.displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-foreground truncate">
                {builder.displayName}
              </h3>
              <p className="font-mono text-primary text-xs truncate">
                {builder.accountId}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-block text-xs bg-primary/25 text-primary px-2 py-0.5 font-mono font-medium">
                  {builder.role}
                </span>
              </div>
            </div>
            <Link
              to="/profile/$accountId"
              params={{ accountId: builder.accountId }}
              className="shrink-0"
              onPointerEnter={() => {
                // Prefetch profile data on hover (intent-based loading)
                queryClient.prefetchQuery({
                  queryKey: ["builder-profile", builder.accountId],
                  queryFn: () => prefetchProfileData(builder.accountId),
                  staleTime: 5 * 60 * 1000,
                });
              }}
            >
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs bg-primary/10 border-primary/30 hover:bg-primary/20 hover:border-primary/50"
              >
                View Profile
                <ExternalLink className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-3">
        {/* Description */}
        {builder.description && (
          <div className="text-sm text-muted-foreground line-clamp-3">
            <Markdown content={builder.description} />
          </div>
        )}

        {/* Skills/Tags */}
        {builder.tags && builder.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {builder.tags.slice(0, 6).map((tag) => (
              <span
                key={tag}
                className="text-xs bg-muted/60 text-foreground px-2 py-1 border border-border/50"
              >
                {tag}
              </span>
            ))}
            {builder.tags.length > 6 && (
              <span className="text-xs text-muted-foreground">
                +{builder.tags.length - 6} more
              </span>
            )}
          </div>
        )}

        {/* Social Links */}
        {builder.socials &&
          (builder.socials.github ||
            builder.socials.twitter ||
            builder.socials.website) && (
            <div className="flex flex-wrap gap-3 text-xs">
              {builder.socials.website && (
                <a
                  href={
                    builder.socials.website.startsWith("http")
                      ? builder.socials.website
                      : `https://${builder.socials.website}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 transition-colors font-mono underline underline-offset-4"
                >
                  Website
                </a>
              )}
              {builder.socials.github && (
                <a
                  href={`https://github.com/${builder.socials.github}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 transition-colors font-mono underline underline-offset-4"
                >
                  GitHub
                </a>
              )}
              {builder.socials.twitter && (
                <a
                  href={`https://twitter.com/${builder.socials.twitter}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 transition-colors font-mono underline underline-offset-4"
                >
                  @{builder.socials.twitter}
                </a>
              )}
            </div>
          )}

        {/* NFT Collection Grid - like BuilderDetails */}
        {builder.holdings && builder.holdings.length > 0 && (
          <div className="pt-2 border-t border-border/50">
            <div className="text-xs text-muted-foreground mb-2">NFT Collection</div>

            {/* Show NFT images grid for nearlegion.nfts.tg */}
            {hasNearLegion && (
              <div className="space-y-2">
                {isLoading ? (
                  <>
                    <div className="text-xs text-muted-foreground/80">Loading NFT images...</div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                      {[...Array(10)].map((_, i) => (
                        <Skeleton key={i} className="aspect-square rounded-lg" />
                      ))}
                    </div>
                  </>
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
            {builder.holdings
              .filter(h => h.contractId !== 'nearlegion.nfts.tg')
              .map((holding) => {
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
                    <a
                      href={`https://explorer.oneverse.near.org/accounts/${builder.accountId}?tab=nfts`}
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
        )}
      </div>
    </div>
  );
}
