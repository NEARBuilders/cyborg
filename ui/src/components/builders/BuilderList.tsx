/**
 * Builder List Component
 * Left panel showing all builders with loading states and real-time search
 */

import { useState, useMemo, useEffect, useRef } from "react";
import { BuilderListItem } from "./BuilderListItem";
import type { Builder } from "@/types/builders";
import { useUserRank } from "@/hooks";
import { useProfile } from "@/integrations/near-social-js";
import { Search, X, Filter } from "lucide-react";

// Simple hook to connect intersection observer with load more
function useInView(ref: React.RefObject<HTMLDivElement | null>, callback: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          callback();
        }
      },
      { rootMargin: "300px" }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [ref, callback, enabled]);
}

// Debounce hook to prevent too many API calls
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface BuilderListProps {
  builders: Builder[];
  selectedId: string;
  onSelect: (builder: Builder) => void;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  totalCounts?: { legion: number; initiate: number };
  hasMore?: boolean;
  onLoadMore?: () => void;
  onLoadMoreError?: string | null;
  onClearLoadMoreError?: () => void;
  onSearchNavigate?: (accountId: string) => void;
}

function BuilderListItemSkeleton({ index }: { index: number }) {
  return (
    <div className="w-full px-4 py-4">
      <div className="flex gap-4 items-center">
        {/* Avatar skeleton */}
        <div className="size-12 rounded-full border-2 border-primary/20 bg-primary/5 animate-pulse" />
        <div className="flex-1 min-w-0 space-y-2">
          {/* Account ID skeleton */}
          <div
            className="h-4 bg-primary/10 animate-pulse"
            style={{ width: `${60 + (index % 3) * 20}%`, animationDelay: `${index * 100}ms` }}
          />
          {/* Role tag skeleton */}
          <div className="flex gap-1">
            <div
              className="h-5 w-16 bg-primary/10 border border-primary/20 animate-pulse"
              style={{ animationDelay: `${index * 100 + 50}ms` }}
            />
          </div>
        </div>
        {/* Arrow */}
        <span className="text-muted-foreground/20 text-xl">›</span>
      </div>
    </div>
  );
}

function BuilderListSkeleton() {
  return (
    <div className="divide-y divide-border/40">
      {Array.from({ length: 8 }).map((_, i) => (
        <BuilderListItemSkeleton key={i} index={i} />
      ))}
    </div>
  );
}

export function BuilderList({
  builders,
  selectedId,
  onSelect,
  isLoading,
  isLoadingMore,
  totalCounts,
  hasMore,
  onLoadMore,
  onLoadMoreError,
  onClearLoadMoreError,
  onSearchNavigate,
}: BuilderListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [dbResults, setDbResults] = useState<Builder[]>([]);
  const [isSearchingDb, setIsSearchingDb] = useState(false);
  const [showOnlyWithProfiles, setShowOnlyWithProfiles] = useState(false);
  const totalCount = (totalCounts?.legion || 0) + (totalCounts?.initiate || 0);

  // Validate search input to prevent injection/xss
  const sanitizeSearchInput = (input: string): string => {
    // Only allow alphanumeric, dots, hyphens, underscores, and @
    // Remove any other characters
    return input.replace(/[^a-zA-Z0-9._@-]/g, '').substring(0, 100);
  };

  // Debounced search query for API calls
  const debouncedQuery = useDebounce(searchQuery, 300);

  // Validate search query is safe
  const safeSearchQuery = useMemo(() => {
    if (!searchQuery) return "";
    return sanitizeSearchInput(searchQuery);
  }, [searchQuery]);

  // Search in local list
  const localResults = useMemo(() => {
    if (!safeSearchQuery.trim()) return [];
    const query = safeSearchQuery.toLowerCase();
    return builders.filter(
      (b) =>
        b.accountId.toLowerCase().includes(query) ||
        b.displayName.toLowerCase().includes(query) ||
        b.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }, [builders, safeSearchQuery]);

  // Apply profile filter
  const buildersWithProfileFilter = useMemo(() => {
    if (!showOnlyWithProfiles) return builders;
    return builders.filter((b) => b.hasNearSocialProfile);
  }, [builders, showOnlyWithProfiles]);

  // Filter builders based on search query
  const filteredBuilders = useMemo(() => {
    if (!safeSearchQuery.trim()) {
      return buildersWithProfileFilter;
    }

    // Combine local results + database results
    const allResults = [...localResults];

    // Add database results if any (avoiding duplicates)
    if (dbResults.length > 0) {
      const localIds = new Set(localResults.map(b => b.accountId));
      dbResults.forEach(dbResult => {
        if (!localIds.has(dbResult.accountId)) {
          allResults.push(dbResult);
        }
      });
    }

    return allResults;
  }, [buildersWithProfileFilter, safeSearchQuery, localResults, dbResults]);

  // Search database API when query changes
  useEffect(() => {
    const searchDatabase = async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) {
        setDbResults([]);
        setIsSearchingDb(false);
        return;
      }

      setIsSearchingDb(true);

      try {
        const response = await fetch(`/api/profiles/search?q=${encodeURIComponent(debouncedQuery)}`, {
          method: "GET",
        });

        if (response.ok) {
          const data = await response.json();
          // Convert profile data to Builder objects
          const results = Object.entries(data).map(([accountId, profile]: [string, any]) => {
            if (!profile) return null;

            // Use NFT avatar URL if available, otherwise fall back to profile image
            const avatarUrl = profile.nftAvatarUrl ||
              (profile.image?.ipfs_cid
                ? `https://ipfs.near.social/ipfs/${profile.image.ipfs_cid}`
                : profile.image?.url) ||
              `https://api.dicebear.com/7.x/avataaars/svg?seed=${accountId}`;

            const displayName = profile.name || accountId.split(".")[0];

            // Check if they have a custom avatar
            const defaultAvatarPattern = /^https:\/\/api\.dicebear\.com\/7\.x\/avataaars\/svg/;
            const hasCustomAvatar = avatarUrl && !defaultAvatarPattern.test(avatarUrl);

            return {
              id: accountId,
              accountId,
              displayName,
              avatar: avatarUrl,
              description: profile.description || "A member of the NEAR community.",
              tags: profile.tags ? Object.keys(profile.tags) : [],
              role: "member",
              projects: [],
              isLegion: false,
              isInitiate: false,
              isNearlegion: false,
              nearSocialProfile: profile,
              hasCustomProfile: hasCustomAvatar,
              hasNearSocialProfile: true,
              socials: {
                github: profile.linktree?.github || accountId.replace(".near", "").toLowerCase(),
                twitter: profile.linktree?.twitter,
                website: profile.linktree?.website,
                telegram: profile.linktree?.telegram,
              },
            } as Builder;
          }).filter((b): b is Builder => b !== null);

          setDbResults(results);
        }
      } catch (error) {
        console.error("[BuilderList] Database search error:", error);
      } finally {
        setIsSearchingDb(false);
      }
    };

    // Reset db results when query is empty
    if (!debouncedQuery) {
      setDbResults([]);
      setIsSearchingDb(false);
    } else {
      searchDatabase();
    }
  }, [debouncedQuery]);

  // Check if search looks like a NEAR account ID
  const isValidNearAccount = (query: string) => {
    const trimmed = query.trim().toLowerCase();
    return trimmed.endsWith(".near") || trimmed.endsWith(".tg") || trimmed.includes(".");
  };

  // Prefetch rank and profile when searching for an account not in the list
  const searchAccountId = searchQuery.trim().toLowerCase();
  const shouldPrefetch = filteredBuilders.length === 0 && isValidNearAccount(searchQuery);

  // These hooks will prefetch data in the background so it's ready when navigating
  useUserRank(shouldPrefetch ? searchAccountId : undefined);
  useProfile(shouldPrefetch ? searchAccountId : undefined);

  // Set up intersection observer for infinite scroll
  const internalSentinelRef = useRef<HTMLDivElement>(null);
  useInView(internalSentinelRef, () => onLoadMore?.(), Boolean(hasMore && !searchQuery && !isLoadingMore));

  // List of common NEAR account extensions to try
  const NEAR_EXTENSIONS = [".near", ".tg", ".testnet", ".betanet"];

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      const rawQuery = searchQuery.trim();
      const queryLower = rawQuery.toLowerCase();

      // First try the exact input (even without extension)
      if (rawQuery) {
        const found = builders.find(b =>
          b.accountId === queryLower ||
          b.accountId.startsWith(`${queryLower}.`) ||
          b.displayName.toLowerCase().includes(queryLower)
        );

        if (found) {
          // Found with exact search, use it
          if (isValidNearAccount(found.accountId)) {
            onSearchNavigate(found.accountId);
          } else {
            onSelect(found);
          }
          return;
        }

        // Try navigating to exact input (might exist but not in our list)
        if (isValidNearAccount(queryLower) && onSearchNavigate) {
          setSearchQuery(queryLower);
          onSearchNavigate(queryLower);
          return;
        }
      }

      // No exact match and no extension - try adding extensions
      if (!queryLower.includes(".")) {
        const tryExtensions = async (extensions: string[]) => {
          for (const ext of extensions) {
            const testAccount = `${queryLower}${ext}`;

            // Check if this account exists in our list
            const inList = builders.some(b => b.accountId === testAccount);

            if (inList) {
              setSearchQuery(testAccount);
              onSearchNavigate(testAccount);
              return true;
            }

            // Try navigating even if not in our list
            // The profile page will fetch from NEAR Social and save to DB
            setSearchQuery(testAccount);
            onSearchNavigate(testAccount);
            return true;
          }
          return false;
        };

        tryExtensions(NEAR_EXTENSIONS);
        return;
      }

      // Has extension but not found - nothing we can do
      if (queryLower.includes(".")) {
        // Show not found message
      }
    }
  };

  return (
    <div className="w-full lg:w-[350px] shrink-0 border border-primary/30 bg-background flex flex-col h-full">
      <div className="px-4 py-3 border-b border-primary/20 bg-primary/5 shrink-0">
        <span className="text-sm text-primary font-mono uppercase tracking-wider font-medium">
          {isLoading ? (
            <span className="inline-flex items-center gap-2">
              <span className="size-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              Loading...
            </span>
          ) : (
            `${filteredBuilders.length}${searchQuery ? "" : totalCount > builders.length ? ` / ${totalCount}` : ""} Legionnaires`
          )}
        </span>
      </div>

      {/* Search Input */}
      <div className="px-3 py-2 border-b border-border/40 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            value={safeSearchQuery}
            onChange={(e) => {
              // Sanitize input on change
              const sanitized = sanitizeSearchInput(e.target.value);
              setSearchQuery(sanitized);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search or enter account ID..."
            className="w-full pl-9 pr-8 py-2 bg-muted/30 border border-border/40 text-sm font-mono placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:bg-muted/50 transition-colors"
          />
          {safeSearchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        {safeSearchQuery && filteredBuilders.length === 0 && isValidNearAccount(safeSearchQuery) && (
          <button
            type="button"
            onClick={() => onSearchNavigate?.(safeSearchQuery.trim().toLowerCase())}
            className="mt-2 w-full py-2 text-xs text-primary hover:bg-primary/10 font-mono border border-primary/30 transition-colors"
          >
            Go to {safeSearchQuery.trim().toLowerCase()}
          </button>
        )}
      </div>

      {/* Profile Filter Toggle */}
      <div className="px-3 py-2 border-b border-border/40 shrink-0">
        <button
          type="button"
          onClick={() => setShowOnlyWithProfiles(!showOnlyWithProfiles)}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-mono border transition-colors ${
            showOnlyWithProfiles
              ? "bg-primary/20 text-primary border-primary/50"
              : "bg-muted/20 text-muted-foreground hover:text-foreground border-border/40"
          }`}
        >
          <span className="flex items-center gap-2">
            <Filter className="size-3.5" />
            <span>Has Profile</span>
          </span>
          <span className="text-[10px] opacity-60">
            {showOnlyWithProfiles
              ? builders.filter((b) => b.hasNearSocialProfile).length
              : builders.length}
          </span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <BuilderListSkeleton />
        ) : filteredBuilders.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <div className="text-4xl text-primary/20">👥</div>
            <p className="text-muted-foreground font-mono text-sm">
              {searchQuery ? "No matches found" : "No builders found"}
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border/40">
              {filteredBuilders.map((builder) => (
                <BuilderListItem
                  key={builder.accountId}
                  builder={builder}
                  isSelected={selectedId === builder.accountId}
                  onSelect={() => onSelect(builder)}
                />
              ))}
            </div>

            {/* Load More Section - Only show when not searching */}
            {hasMore && !searchQuery && (
              <div className="p-4 border-t border-primary/20">
                {onLoadMoreError ? (
                  <div className="text-center space-y-2">
                    <p className="text-sm text-destructive font-mono">{onLoadMoreError}</p>
                    <button
                      type="button"
                      onClick={onClearLoadMoreError}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                ) : (
                  <div className="text-center">
                    {isLoadingMore ? (
                      <div className="flex items-center justify-center gap-2 py-2">
                        <span className="size-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        <span className="text-sm text-muted-foreground font-mono">Loading...</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground font-mono">
                        {builders.length} loaded • Scroll for more
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Sentinel element for infinite scroll intersection observer */}
            {hasMore && !searchQuery && (
              <div ref={internalSentinelRef} className="h-1" aria-hidden="true" />
            )}
          </>
        )}
      </div>
    </div>
  );
}
