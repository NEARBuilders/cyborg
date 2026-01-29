import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useBuilders } from "@/hooks";

export const Route = createFileRoute("/_layout/_authenticated/builders/")({
  component: BuildersIndex,
});

function BuildersIndex() {
  const navigate = useNavigate();
  const { builders, isLoading } = useBuilders();

  // Auto-redirect to first builder on desktop
  useEffect(() => {
    if (builders.length > 0 && !isLoading) {
      const isDesktop = window.innerWidth >= 1024;
      if (isDesktop) {
        navigate({
          to: "/builders/$builderId",
          params: { builderId: builders[0].accountId },
          replace: true
        });
      }
    }
  }, [builders, isLoading, navigate]);

  // Show placeholder while loading or on mobile
  if (isLoading) {
    return (
      <div className="flex-1 border border-primary/30 bg-background h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="size-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground font-mono text-sm">Loading builders...</p>
        </div>
      </div>
    );
  }

  // Desktop placeholder (shouldn't normally show due to redirect)
  return (
    <div className="flex-1 border border-primary/30 bg-background h-full flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="text-6xl text-muted-foreground/30">👥</div>
        <h3 className="text-lg font-medium text-foreground">
          Select a builder
        </h3>
        <p className="text-muted-foreground">
          Choose a builder from the list to see their profile and projects
        </p>
      </div>
    </div>
  );
}
