import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useProject,
  useProjectKv,
  useUpdateProject,
  useDeleteProject,
  useProjects,
} from "@/hooks/useProjects";

export const Route = createFileRoute("/_layout/_authenticated/projects/$id")({
  component: ProjectDetail,
});

function ProjectDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<
    "active" | "completed" | "archived"
  >("active");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editGithubLinks, setEditGithubLinks] = useState<
    Array<{ url: string; description?: string }>
  >([]);
  const [editTags, setEditTags] = useState<
    Array<{ name: string; target?: string }>
  >([]);

  // Try to get project from cache first (from profile page projects list)
  const cachedProjects = queryClient.getQueryData<{ projects: any[] }>([
    "projects",
  ]);
  const cachedProject = cachedProjects?.projects?.find((p: any) => p.id === id);

  console.log("[ProjectDetail] Cached project:", cachedProject);

  // Fetch project (will use cache if available, otherwise fetch from API)
  const {
    data: project,
    isLoading,
    error,
  } = useProject(id, {
    initialData: cachedProject,
  });

  console.log("[ProjectDetail] Final project data:", project);

  // Fetch KV entries
  const { data: kvData } = useProjectKv(id);

  // Update project mutation
  const { update: updateProject, isPending: isUpdating } = useUpdateProject();

  // Delete project mutation
  const { delete: deleteProject, isPending: isDeleting } = useDeleteProject();

  // Initialize edit form when entering edit mode
  const handleStartEdit = () => {
    if (project) {
      setEditName(project.name);
      setEditDescription(project.description || "");
      setEditStatus(project.status);
      setEditImageUrl(project.coverImageUrl || "");
      setEditGithubLinks(project.githubLinks || []);
      setEditTags(project.tags || []);
    }
    setIsEditing(true);
  };

  const handleUpdate = async () => {
    updateProject({
      projectId: id,
      data: {
        name: editName,
        description: editDescription || undefined,
        status: editStatus,
        coverImageUrl: editImageUrl,
        githubLinks: editGithubLinks,
        tags: editTags,
      },
    });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (
      !confirm(
        "Are you sure you want to delete this project? This cannot be undone.",
      )
    )
      return;
    await deleteProject(id);
    void navigate({ to: "/projects" });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading project...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-6 bg-destructive/10 rounded-lg border border-destructive/20">
        <p className="text-sm text-destructive">
          {error ? "Error loading project" : "Project not found"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border/50">
        <Link
          to="/projects"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
        >
          ← back to projects
        </Link>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <button
                onClick={handleUpdate}
                disabled={isUpdating || !editName.trim()}
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md transition-colors disabled:opacity-50"
              >
                {isUpdating ? "Saving..." : "Save"}
              </button>
              <button
                onClick={handleCancelEdit}
                disabled={isUpdating}
                className="px-3 py-1.5 text-sm bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleStartEdit}
                className="px-3 py-1.5 text-sm bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-3 py-1.5 text-sm bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-md transition-colors disabled:opacity-50"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Project Details */}
      <div className="space-y-6">
        {isEditing ? (
          <div className="space-y-4 p-6 bg-card rounded-lg border border-border/50">
            <div className="space-y-2">
              <label htmlFor="edit-name" className="text-sm font-medium">
                Name *
              </label>
              <input
                id="edit-name"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                maxLength={100}
                className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="edit-description" className="text-sm font-medium">
                Description
              </label>
              <textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                maxLength={1000}
                rows={3}
                className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="edit-imageUrl" className="text-sm font-medium">
                Image URL
              </label>
              <input
                id="edit-imageUrl"
                type="url"
                value={editImageUrl}
                onChange={(e) => setEditImageUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="edit-status" className="text-sm font-medium">
                Status
              </label>
              <select
                id="edit-status"
                value={editStatus}
                onChange={(e) =>
                  setEditStatus(
                    e.target.value as "active" | "completed" | "archived",
                  )
                }
                className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">GitHub Links</label>
              <div className="space-y-2">
                {editGithubLinks.map((link, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="url"
                      value={link.url}
                      onChange={(e) => {
                        const updated = [...editGithubLinks];
                        updated[index].url = e.target.value;
                        setEditGithubLinks(updated);
                      }}
                      placeholder="https://github.com/user/repo"
                      className="flex-1 px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                    <input
                      type="text"
                      value={link.description || ""}
                      onChange={(e) => {
                        const updated = [...editGithubLinks];
                        updated[index].description = e.target.value;
                        setEditGithubLinks(updated);
                      }}
                      placeholder="Description (e.g., Frontend)"
                      className="flex-1 px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const updated = editGithubLinks.filter(
                          (_, i) => i !== index,
                        );
                        setEditGithubLinks(updated);
                      }}
                      className="px-3 py-2 text-sm bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-md transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setEditGithubLinks([
                      ...editGithubLinks,
                      { url: "", description: "" },
                    ])
                  }
                  className="w-full px-3 py-2 text-sm bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
                >
                  + Add GitHub Link
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tags</label>
              <div className="space-y-2">
                {editTags.map((tag, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={tag.name}
                      onChange={(e) => {
                        const updated = [...editTags];
                        updated[index].name = e.target.value;
                        setEditTags(updated);
                      }}
                      placeholder="Tag name (e.g., React)"
                      className="flex-1 px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                    <input
                      type="text"
                      value={tag.target || ""}
                      onChange={(e) => {
                        const updated = [...editTags];
                        updated[index].target = e.target.value;
                        setEditTags(updated);
                      }}
                      placeholder="Target (e.g., frontend)"
                      className="flex-1 px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const updated = editTags.filter((_, i) => i !== index);
                        setEditTags(updated);
                      }}
                      className="px-3 py-2 text-sm bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-md transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setEditTags([...editTags, { name: "", target: "" }])
                  }
                  className="w-full px-3 py-2 text-sm bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
                >
                  + Add Tag
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 bg-card rounded-lg border border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-2xl font-semibold">{project.name}</h1>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  project.status === "active"
                    ? "bg-green-500/10 text-green-600 dark:text-green-400"
                    : project.status === "completed"
                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {project.status}
              </span>
            </div>
            {project.coverImageUrl && (
              <div className="mb-4">
                <img
                  src={project.coverImageUrl}
                  alt={project.name}
                  className="max-w-full h-auto rounded-md border border-border/50"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              </div>
            )}
            {project.description && (
              <p className="text-muted-foreground mb-4">
                {project.description}
              </p>
            )}

            {project.githubLinks && project.githubLinks.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold mb-2">GitHub Links</h3>
                <div className="space-y-2">
                  {project.githubLinks.map((link, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex-1"
                      >
                        {link.description || link.url}
                      </a>
                      <svg
                        className="w-4 h-4 text-muted-foreground"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {project.tags && project.tags.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold mb-2">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {project.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-muted text-muted-foreground text-xs rounded-md"
                    >
                      <span>{tag.name}</span>
                      {tag.target && (
                        <span className="text-muted-foreground/60">
                          → {tag.target}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground font-mono">
              <div>Created: {new Date(project.createdAt).toLocaleString()}</div>
              <div>Updated: {new Date(project.updatedAt).toLocaleString()}</div>
            </div>
          </div>
        )}
      </div>

      {/* KV Data Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Key-Value Data</h2>
        {kvData?.entries.length === 0 ? (
          <div className="text-center py-8 bg-muted/20 rounded-lg border border-border/50">
            <p className="text-sm text-muted-foreground">
              No key-value data yet
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {kvData?.entries.map((entry) => (
              <div
                key={entry.key}
                className="p-3 bg-card rounded-md border border-border/50 font-mono text-sm"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-muted-foreground truncate">
                      {entry.key}
                    </div>
                    <div className="text-xs truncate mt-1">{entry.value}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
