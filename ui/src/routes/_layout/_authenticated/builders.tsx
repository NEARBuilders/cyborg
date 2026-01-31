import { useMemo } from "react";
import { createFileRoute, Outlet, useParams, useNavigate } from "@tanstack/react-router";
import { BuilderList, type Builder } from "@/components/builders";
import { useBuildersWithProfiles, useUserRanks } from "@/hooks";

export const Route = createFileRoute("/_layout/_authenticated/builders")({
  component: BuildersLayout,
});

function BuildersLayout() {
  const params = useParams({ strict: false });
  const navigate = useNavigate();
  const builderId = (params as { builderId?: string }).builderId;

  const {
    builders,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    totalCounts,
    sentinelRef,
  } = useBuildersWithProfiles();

  // Prefetch ranks for all loaded builders so they're cached when viewing detail pages
  const builderAccountIds = useMemo(() => builders.map(b => b.accountId), [builders]);
  useUserRanks(builderAccountIds);

  const handleSelectBuilder = (builder: Builder) => {
    navigate({ to: "/builders/$builderId", params: { builderId: builder.accountId } });
  };

  const handleSearchNavigate = (accountId: string) => {
    navigate({ to: "/builders/$builderId", params: { builderId: accountId } });
  };

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

  // Find selected builder for highlighting in list
  const selectedBuilder = builders.find(b => b.accountId === builderId);

  return (
    <div className="h-full flex flex-col lg:flex-row">
      {/* Builder List - Hidden on mobile when builder is selected */}
      <div
        className={`${builderId ? "hidden lg:flex" : "flex"} w-full lg:w-auto h-full`}
      >
        <BuilderList
          builders={builders}
          selectedId={selectedBuilder?.id || ""}
          onSelect={handleSelectBuilder}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          totalCounts={totalCounts}
          hasMore={hasMore}
          sentinelRef={sentinelRef}
          onSearchNavigate={handleSearchNavigate}
        />
      </div>

      {/* Right panel - Outlet for child routes */}
      <div className={`${builderId ? "flex" : "hidden lg:flex"} w-full lg:flex-1 h-full flex-col`}>
        {/* Back button for mobile */}
        {builderId && (
          <div className="lg:hidden px-4 py-3 border-b border-primary/20 bg-primary/5">
            <button
              type="button"
              onClick={() => navigate({ to: "/builders" })}
              className="text-primary hover:text-primary/80 font-mono text-sm flex items-center gap-2"
            >
              <span className="text-xl">‹</span> Back to list
            </button>
          </div>
        )}
        <Outlet />
      </div>
    </div>
  );
}
