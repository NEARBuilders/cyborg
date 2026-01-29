/**
 * Builder List Component
 * Left panel showing all builders with loading states
 */

import { BuilderListItem, type Builder } from "./BuilderListItem";

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
}: BuilderListProps) {
  const totalCount = (totalCounts?.legion || 0) + (totalCounts?.initiate || 0);

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
            `${builders.length}${totalCount > builders.length ? ` / ${totalCount}` : ""} Legionnaires`
          )}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <BuilderListSkeleton />
        ) : builders.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <div className="text-4xl text-primary/20">👥</div>
            <p className="text-muted-foreground font-mono text-sm">No builders found</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border/40">
              {builders.map((builder) => (
                <BuilderListItem
                  key={builder.id}
                  builder={builder}
                  isSelected={selectedId === builder.id}
                  onSelect={() => onSelect(builder)}
                />
              ))}
            </div>

            {/* Load More Section */}
            {hasMore && (
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
