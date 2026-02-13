import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useProjects, useDeleteProject } from "@/hooks/useProjects";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_layout/_authenticated/projects/")({
  component: ProjectsList,
  pendingComponent: () => <ProjectsListSkeleton />,
  beforeLoad: async () => {
    const nearState = authClient.useNearState();
    if (nearState?.accountId) {
      throw redirect({
        to: `/profile/${nearState.accountId}?tab=projects`,
      });
    }
  },
});

function ProjectsList() {
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed" | "archived">("all");

  const { data, isLoading, error } = useProjects(undefined);

  const filteredProjects = data?.projects.filter(project => {
    if (statusFilter === "all") return true;
    return project.status === statusFilter;
  }) ?? [];

  const { delete: deleteProject, isPending: isDeleting } = useDeleteProject();

  const handleDelete = async (projectId: string) => {
    if (!confirm("Are you sure you want to delete this project?")) return;
    await deleteProject(projectId);
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your projects and their data
          </p>
        </div>

        <p className="text-sm text-muted-foreground">
          Manage your projects from your{" "}
          <Link
            to="/profile"
            search={{ tab: "projects" }}
            className="text-primary hover:underline"
          >
            profile page
          </Link>
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              statusFilter === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setStatusFilter("active")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              statusFilter === "active"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setStatusFilter("completed")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              statusFilter === "completed"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Completed
          </button>
          <button
            onClick={() => setStatusFilter("archived")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              statusFilter === "archived"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Archived
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading projects...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-destructive/10 rounded-lg border border-destructive/20">
          <p className="text-sm text-destructive">
            Error loading projects
          </p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-12 bg-muted/20 rounded-lg border border-border/50">
          <p className="text-muted-foreground mb-4">No projects yet</p>
          <Link
            to="/projects/create"
            className="text-primary hover:underline text-sm"
          >
            Create your first project →
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              className="overflow-hidden bg-card rounded-lg border border-border/50 hover:border-border transition-colors"
            >
              {/* Cover Image Banner */}
              {project.coverImageUrl ? (
                <div className="aspect-video w-full overflow-hidden">
                  <img
                    src={project.coverImageUrl}
                    alt={project.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Hide image on error
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              ) : (
                <div className="aspect-video w-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                  <span className="text-4xl text-primary/40">📦</span>
                </div>
              )}
              <div className="flex items-start justify-between gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium">{project.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      project.status === "active"
                        ? "bg-green-500/10 text-green-600 dark:text-green-400"
                        : project.status === "completed"
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {project.status}
                    </span>
                  </div>
                  {project.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {project.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Updated {new Date(project.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    to="/projects/$id"
                    params={{ id: project.id }}
                    className="px-3 py-1.5 text-sm bg-muted hover:bg-muted/80 rounded-md transition-colors"
                  >
                    View
                  </Link>
                  <button
                    onClick={() => handleDelete(project.id)}
                    disabled={isDeleting}
                    className="px-3 py-1.5 text-sm bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-md transition-colors disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectsListSkeleton() {
  return (
    <div className="space-y-8 max-w-5xl">
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
      <div className="grid gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    </div>
  );
}
