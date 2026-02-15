import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Calendar, FolderKanban, ExternalLink, Settings } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useProjectKv, useUpdateProject, type Project } from "@/hooks/useProjects";
import { authClient } from "@/lib/auth-client";
import { useState } from "react";

export const Route = createFileRoute("/_layout/project/$address/$project")({
  component: ProjectPage,
});

// API helper (same as in useProjects.ts)
async function fetchApi(
  endpoint: string,
  options?: RequestInit,
): Promise<Response> {
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  return response;
}

function ProjectPage() {
  const { address, project: projectName } = Route.useParams();
  const navigate = Route.useNavigate();
  const routerState = useRouterState();

  // Check if we came from the builders page using navigation state
  const locationState = routerState.location.state as unknown as { from?: string } | undefined;
  const cameFromBuilders = locationState?.from === "builders";

  // Update project mutation
  const { update: updateProject, isPending: isUpdating } = useUpdateProject();

  // NEAR state hook - must be called before any early returns
  const nearState = authClient.useNearState();

  // Edit modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editData, setEditData] = useState({
    name: "",
    description: "",
    coverImageUrl: "",
    status: "active" as "active" | "completed" | "archived",
  });

  // Fetch project directly by name using the new API endpoint
  const { data: project, isLoading: isLoadingProject, error: projectError } = useQuery({
    queryKey: ["project", address, projectName],
    queryFn: async () => {
      const response = await fetchApi(`/accounts/${address}/projects/by-name/${encodeURIComponent(projectName)}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Project not found");
        }
        throw new Error("Failed to fetch project");
      }
      return response.json() as Promise<Project>;
    },
    retry: false,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Fetch KV entries for the project (only when project is loaded)
  const { data: kvData, isLoading: isLoadingKv } = useProjectKv(
    project?.id,
    100,
  );

  // Show loading state while fetching project
  if (isLoadingProject) {
    return (
      <div className="flex-1 border border-primary/30 bg-background h-full overflow-y-auto">
        <div className="p-6 space-y-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  // Project not found or error
  if (!project || projectError) {
    return (
      <div className="flex-1 border border-primary/30 bg-background h-full overflow-y-auto">
        <div className="p-6 space-y-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (cameFromBuilders) {
                navigate({
                  to: "/builders/$builderId",
                  params: { builderId: address },
                });
              } else {
                navigate({ to: "/profile/$accountId", params: { accountId: address } });
              }
            }}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="size-4" />
            Back to {cameFromBuilders ? "Builder" : "Profile"}
          </Button>

          <div className="text-center py-20">
            <h1 className="text-2xl font-bold text-foreground mb-4">
              Project Not Found
            </h1>
            <p className="text-muted-foreground mb-6">
              The project "{decodeURIComponent(projectName)}" could not be found for {address}.
            </p>
            <Link
              to="/profile/$accountId"
              params={{ accountId: address }}
              search={{ tab: "projects" }}
            >
              <Button variant="outline">View All Projects</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const kvEntries = kvData?.entries ?? [];

  // Check if current user owns this project
  const currentAccountId = nearState?.accountId;
  const isOwnProject = currentAccountId === address;

  return (
    <div className="flex-1 border border-primary/30 bg-background h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-8">
        {/* Header with Back Button and Edit Button */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (cameFromBuilders) {
                navigate({
                  to: "/builders/$builderId",
                  params: { builderId: address },
                });
              } else {
                navigate({ to: "/profile/$accountId", params: { accountId: address } });
              }
            }}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="size-4" />
            Back to {cameFromBuilders ? "Builder" : "Profile"}
          </Button>
          {isOwnProject && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditData({
                  name: project.name,
                  description: project.description || "",
                  coverImageUrl: project.coverImageUrl || "",
                  status: project.status,
                });
                setIsEditModalOpen(true);
              }}
              className="flex items-center gap-2"
            >
              <Settings className="size-4" />
              Edit Project
            </Button>
          )}
        </div>

        {/* Project Header */}
        <div className="space-y-6">
          {/* Title & Status Badge */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <FolderKanban className="size-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
                    {project.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="size-3.5" />
                      Created {new Date(project.createdAt).toLocaleDateString()}
                    </span>
                    <span>•</span>
                    <span>
                      Updated {new Date(project.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <Badge
              variant={
                project.status === "active"
                  ? "default"
                  : project.status === "completed"
                  ? "secondary"
                  : "outline"
              }
              className="capitalize text-sm px-3 py-1"
            >
              {project.status}
            </Badge>
          </div>

          {/* Cover Image */}
          {project.coverImageUrl ? (
            <div className="aspect-[16/2.5] w-full overflow-hidden rounded-xl border border-border/50 shadow-sm">
              <img
                src={project.coverImageUrl}
                alt={project.name}
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          ) : (
            <div className="aspect-[16/2.5] w-full bg-gradient-to-br from-primary/10 via-primary/5 to-background rounded-xl border border-border/50 flex items-center justify-center">
              <div className="text-center space-y-3">
                <span className="text-7xl">📦</span>
                <p className="text-sm text-muted-foreground">No cover image</p>
              </div>
            </div>
          )}

          {/* Description */}
          {project.description ? (
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                <span>About</span>
                <div className="flex-1 h-px bg-border/50" />
              </h2>
              <div className="prose prose-sm max-w-none text-foreground">
                <Markdown content={project.description} />
              </div>
            </div>
          ) : (
            <div className="p-6 bg-muted/30 rounded-xl border border-border/50 text-center">
              <p className="text-muted-foreground">No description provided for this project.</p>
            </div>
          )}
        </div>

        {/* KV Data Section */}
        <div className="space-y-4 pt-6 border-t border-border/50">
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <span>Project Data</span>
            {kvEntries.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {kvEntries.length} {kvEntries.length === 1 ? 'entry' : 'entries'}
              </Badge>
            )}
            <div className="flex-1 h-px bg-border/50" />
          </h2>

          {isLoadingKv ? (
            <div className="grid gap-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : kvEntries.length > 0 ? (
            <div className="grid gap-4">
              {kvEntries.map((entry) => (
                <div
                  key={entry.key}
                  className="group p-4 bg-card hover:bg-card/80 rounded-lg border border-border/50 space-y-3 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-mono text-sm font-medium text-primary flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      {entry.key}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {entry.value && (
                    <div className="text-sm">
                      {entry.value.includes("#") ||
                       entry.value.includes("*") ||
                       entry.value.includes("```") ? (
                        <Markdown content={entry.value} />
                      ) : (
                        <pre className="whitespace-pre-wrap break-words text-foreground bg-muted/30 p-3 rounded-md overflow-x-auto text-xs">
                          {entry.value}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center bg-muted/20 rounded-xl border border-border/50">
              <div className="space-y-3">
                <span className="text-4xl">📭</span>
                <p className="text-muted-foreground">No additional data available for this project.</p>
              </div>
            </div>
          )}
        </div>

        {/* Project Footer */}
        <div className="pt-6 border-t border-border/50">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Project ID: {project.id}</span>
            <Link
              to="/profile/$accountId"
              params={{ accountId: address }}
              search={{ tab: "projects" }}
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              View all projects
              <ExternalLink className="size-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Edit Project Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>
              Update project details. You'll need to approve a transaction to save changes.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateProject(
                {
                  projectId: project.id,
                  data: {
                    name: editData.name,
                    description: editData.description,
                    status: editData.status,
                  },
                },
                {
                  onSuccess: () => {
                    setIsEditModalOpen(false);
                  },
                },
              );
            }}
            className="space-y-4 pt-4"
          >
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Project Name *
              </label>
              <Input
                value={editData.name}
                onChange={(e) =>
                  setEditData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="My Awesome Project"
                required
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Description
              </label>
              <MarkdownEditor
                value={editData.description}
                onChange={(value) =>
                  setEditData((prev) => ({ ...prev, description: value }))
                }
                placeholder="Tell us about your project... Type / for commands"
                rows={8}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Cover Image URL
              </label>
              <Input
                type="url"
                value={editData.coverImageUrl}
                onChange={(e) =>
                  setEditData((prev) => ({ ...prev, coverImageUrl: e.target.value }))
                }
                placeholder="https://example.com/banner.png"
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Status
              </label>
              <select
                value={editData.status}
                onChange={(e) =>
                  setEditData({
                    ...editData,
                    status: e.target.value as "active" | "completed" | "archived",
                  })
                }
                className="w-full h-9 px-3 py-1 text-sm bg-background border border-border/50 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={isUpdating || !editData.name.trim()}
                className="flex-1 h-9 px-6 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUpdating ? "Saving..." : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                disabled={isUpdating}
                className="h-9 px-6 border border-border/50 rounded-md text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
