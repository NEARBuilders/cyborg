/**
 * Builder List Component
 * Left panel showing all builders with loading states and search
 */

import { useState, useMemo } from "react";
import { BuilderListItem, type Builder } from "./BuilderListItem";
import { useUserRank } from "@/hooks";
import { useProfile } from "@/integrations/near-social-js";
import { Search, X } from "lucide-react";

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
  const totalCount = (totalCounts?.legion || 0) + (totalCounts?.initiate || 0);

  // Filter builders based on search query
  const filteredBuilders = useMemo(() => {
    if (!searchQuery.trim()) return builders;
    const query = searchQuery.toLowerCase();
    return builders.filter(
      (b) =>
        b.accountId.toLowerCase().includes(query) ||
        b.displayName.toLowerCase().includes(query) ||
        b.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }, [builders, searchQuery]);

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

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      // If no results but looks like a valid account, try navigating directly
      if (filteredBuilders.length === 0 && isValidNearAccount(searchQuery) && onSearchNavigate) {
        onSearchNavigate(searchQuery.trim().toLowerCase());
      } else if (filteredBuilders.length === 1) {
        // If exactly one result, select it
        onSelect(filteredBuilders[0]);
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
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search or enter account ID..."
            className="w-full pl-9 pr-8 py-2 bg-muted/30 border border-border/40 text-sm font-mono placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:bg-muted/50 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        {searchQuery && filteredBuilders.length === 0 && isValidNearAccount(searchQuery) && (
          <button
            type="button"
            onClick={() => onSearchNavigate?.(searchQuery.trim().toLowerCase())}
            className="mt-2 w-full py-2 text-xs text-primary hover:bg-primary/10 font-mono border border-primary/30 transition-colors"
          >
            Go to {searchQuery.trim().toLowerCase()}
          </button>
        )}
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
                  key={builder.id}
                  builder={builder}
                  isSelected={selectedId === builder.id}
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
                  <button
                    type="button"
                    onClick={onLoadMore}
                    disabled={isLoadingMore}
                    className="w-full py-2.5 text-sm text-primary hover:bg-primary/10 font-mono font-medium border border-primary/30 transition-colors disabled:opacity-50"
                  >
                    {isLoadingMore ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="size-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        Loading...
                      </span>
                    ) : (
                      "Load more"
                    )}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
