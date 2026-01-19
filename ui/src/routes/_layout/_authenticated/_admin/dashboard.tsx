/**
 * Admin Dashboard Route
 *
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/utils/orpc";

export const Route = createFileRoute(
  "/_layout/_authenticated/_admin/dashboard"
)({
  component: AdminDashboard,
});

function AdminDashboard() {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => apiClient.adminStats(),
  });

  return (
    <div className="space-y-8">
      <div className="pb-4 border-b border-border/50">
        <h1 className="text-2xl font-medium mb-2">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Admin-only management interface
        </p>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">
            Error loading stats: {error instanceof Error ? error.message : "Unknown error"}
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {/* Stats Cards */}
        <div className="p-6 rounded-xl border border-border/50 bg-gradient-to-br from-primary/5 to-primary/10">
          <div className="space-y-2">
            <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              Conversations
            </h3>
            <p className="text-3xl font-medium">
              {isLoading ? "..." : stats?.conversations ?? 0}
            </p>
          </div>
        </div>

        <div className="p-6 rounded-xl border border-border/50 bg-gradient-to-br from-secondary/5 to-secondary/10">
          <div className="space-y-2">
            <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              Messages
            </h3>
            <p className="text-3xl font-medium">
              {isLoading ? "..." : stats?.messages ?? 0}
            </p>
          </div>
        </div>

        <div className="p-6 rounded-xl border border-border/50 bg-gradient-to-br from-accent/5 to-accent/10">
          <div className="space-y-2">
            <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              KV Entries
            </h3>
            <p className="text-3xl font-medium">
              {isLoading ? "..." : stats?.kvEntries ?? 0}
            </p>
          </div>
        </div>
      </div>

      {/* Admin Actions */}
      <div className="p-6 rounded-xl border border-border/50 bg-muted/20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Admin Actions</h2>
          <span className="text-xs text-muted-foreground font-mono bg-muted/40 px-2 py-1 rounded">
            Template placeholders
          </span>
        </div>
        <div className="space-y-3">
          <button
            disabled
            className="w-full px-4 py-3 text-left text-sm border border-border/50 bg-background rounded-lg opacity-60 cursor-not-allowed"
          >
            <div className="font-medium flex items-center gap-2">
              Manage Users
              <span className="text-xs text-muted-foreground">(coming soon)</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              View and manage user accounts
            </div>
          </button>
          <button
            disabled
            className="w-full px-4 py-3 text-left text-sm border border-border/50 bg-background rounded-lg opacity-60 cursor-not-allowed"
          >
            <div className="font-medium flex items-center gap-2">
              View Logs
              <span className="text-xs text-muted-foreground">(coming soon)</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Access system logs and audit trail
            </div>
          </button>
          <button
            disabled
            className="w-full px-4 py-3 text-left text-sm border border-border/50 bg-background rounded-lg opacity-60 cursor-not-allowed"
          >
            <div className="font-medium flex items-center gap-2">
              System Configuration
              <span className="text-xs text-muted-foreground">(coming soon)</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Configure system settings and parameters
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
