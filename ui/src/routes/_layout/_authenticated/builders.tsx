import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BuilderList,
  BuilderDetails,
  type Builder,
} from "@/components/builders";
import { useBuilders } from "@/hooks";

export const Route = createFileRoute("/_layout/_authenticated/builders")({
  component: BuildersPage,
});

function BuildersPage() {
  const [selectedBuilderId, setSelectedBuilderId] = useState<string>("");
  const {
    builders,
    isLoading,
    isLoadingMore,
    error,
    loadMoreError,
    hasMore,
    totalCounts,
    loadMore,
    clearLoadMoreError,
  } = useBuilders();

  // Auto-select first builder when builders load (desktop only)
  useEffect(() => {
    if (builders.length > 0 && !selectedBuilderId) {
      // Only auto-select on desktop (lg breakpoint is 1024px)
      const isDesktop = window.innerWidth >= 1024;
      if (isDesktop) {
        setSelectedBuilderId(builders[0].id);
      }
    }
  }, [builders, selectedBuilderId]);

  const handleSelectBuilder = (builder: Builder) => {
    setSelectedBuilderId(builder.id);
  };

  const selectedBuilder = builders.find((b) => b.id === selectedBuilderId);

  // Error state
  if (error && builders.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h3 className="text-lg font-medium text-destructive mb-2">
            Failed to load builders
          </h3>
          <p className="text-muted-foreground">{error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col lg:flex-row">
      {/* Builder List - Hidden on mobile when builder is selected */}
      <div
        className={`${selectedBuilder ? "hidden lg:flex" : "flex"} w-full lg:w-auto h-full`}
      >
        <BuilderList
          builders={builders}
          selectedId={selectedBuilderId}
          onSelect={handleSelectBuilder}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          totalCounts={totalCounts}
          hasMore={hasMore}
          onLoadMore={loadMore}
          onLoadMoreError={loadMoreError}
          onClearLoadMoreError={clearLoadMoreError}
        />
      </div>

      {/* Builder Details - Hidden on mobile when no builder selected */}
      {selectedBuilder ? (
        <div
          className={`${selectedBuilder ? "flex" : "hidden lg:flex"} w-full lg:flex-1 h-full flex-col`}
        >
          {/* Back button for mobile */}
          <div className="lg:hidden px-4 py-3 border-b border-primary/20 bg-primary/5">
            <button
              type="button"
              onClick={() => setSelectedBuilderId("")}
              className="text-primary hover:text-primary/80 font-mono text-sm flex items-center gap-2"
            >
              <span className="text-xl">‹</span> Back to list
            </button>
          </div>
          <BuilderDetails builder={selectedBuilder} />
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center border border-primary/30 bg-background">
          <div className="text-center space-y-3">
            <div className="text-6xl text-muted-foreground/30">👥</div>
            <h3 className="text-lg font-medium text-foreground">
              Select a builder to view details
            </h3>
            <p className="text-muted-foreground">
              Choose a builder from list to see their profile, projects, and
              skills
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
