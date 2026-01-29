import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useBuilders } from "@/hooks";
import { ExternalLink, Github, ArrowLeft } from "lucide-react";

export const Route = createFileRoute(
  "/_layout/_authenticated/builders/$builderId/$projectSlug"
)({
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { builderId, projectSlug } = useParams({
    from: "/_layout/_authenticated/builders/$builderId/$projectSlug",
  });
  const { builders, isLoading } = useBuilders();

  const builder = builders.find((b) => b.accountId === builderId);
  const project = builder?.projects.find(
    (p) => (p.slug || slugify(p.name)) === projectSlug
  );

  if (isLoading) {
    return <ProjectDetailSkeleton />;
  }

  if (!builder || !project) {
    return (
      <div className="flex-1 border border-primary/30 bg-background h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-4xl text-muted-foreground/30">🔍</div>
          <h3 className="text-lg font-medium text-foreground">
            Project not found
          </h3>
          <p className="text-muted-foreground">
            This project may no longer exist
          </p>
          <Link
            to="/builders/$builderId"
            params={{ builderId }}
            className="inline-block mt-4 px-4 py-2 bg-primary text-primary-foreground font-mono text-sm"
          >
            Back to builder
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 border border-primary/30 bg-background h-full overflow-y-auto animate-in slide-in-from-right-4 fade-in duration-300">
      {/* Breadcrumb header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/50 px-4 sm:px-6 py-3">
        <Link
          to="/builders/$builderId"
          params={{ builderId }}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
        >
          <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" />
          <Avatar className="size-6 border border-primary/40">
            <AvatarImage src={builder.avatar || undefined} />
            <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-mono font-bold">
              {builder.displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-mono">{builder.displayName}</span>
        </Link>
      </div>

      <div className="p-4 sm:p-6 space-y-6">
        {/* Project Header */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-foreground">
                {project.name}
              </h1>
              <p className="text-muted-foreground">
                {project.description}
              </p>
            </div>
            <ProjectStatus status={project.status} />
          </div>

          {/* Action buttons */}
          {(project.url || project.github) && (
            <div className="flex flex-wrap gap-3">
              {project.url && (
                <a
                  href={project.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-mono text-sm hover:bg-primary/90 transition-colors"
                >
                  <ExternalLink className="size-4" />
                  Visit Project
                </a>
              )}
              {project.github && (
                <a
                  href={
                    project.github.startsWith("http")
                      ? project.github
                      : `https://github.com/${project.github}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 border border-border text-foreground font-mono text-sm hover:border-primary hover:text-primary transition-colors"
                >
                  <Github className="size-4" />
                  Source Code
                </a>
              )}
            </div>
          )}
        </div>

        {/* Project Image */}
        {project.image && (
          <div className="border border-border/50 overflow-hidden">
            <img
              src={project.image}
              alt={project.name}
              className="w-full h-auto object-cover"
            />
          </div>
        )}

        {/* Long Description */}
        {project.longDescription && (
          <div className="space-y-3">
            <h2 className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
              About this project
            </h2>
            <p className="text-foreground text-base leading-relaxed whitespace-pre-wrap">
              {project.longDescription}
            </p>
          </div>
        )}

        {/* Technologies */}
        {project.technologies && project.technologies.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
              Built with
            </h2>
            <div className="flex flex-wrap gap-2">
              {project.technologies.map((tech) => (
                <Badge
                  key={tech}
                  variant="outline"
                  className="text-sm px-3 py-1"
                >
                  {tech}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* More from builder */}
        {builder.projects.length > 1 && (
          <div className="space-y-3 pt-4 border-t border-border/50">
            <h2 className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
              More from {builder.displayName}
            </h2>
            <div className="space-y-2">
              {builder.projects
                .filter((p) => p.name !== project.name)
                .slice(0, 3)
                .map((otherProject) => {
                  const otherSlug = otherProject.slug || slugify(otherProject.name);
                  return (
                    <Link
                      key={otherProject.name}
                      to="/builders/$builderId/$projectSlug"
                      params={{ builderId, projectSlug: otherSlug }}
                      className="group block p-3 border border-border/40 bg-muted/20 hover:border-primary/50 hover:bg-primary/5 transition-all"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-foreground group-hover:text-primary transition-colors">
                          {otherProject.name}
                        </span>
                        <ProjectStatusSmall status={otherProject.status} />
                      </div>
                    </Link>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectDetailSkeleton() {
  return (
    <div className="flex-1 border border-primary/30 bg-background h-full overflow-y-auto">
      <div className="border-b border-border/50 px-4 sm:px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="size-4 bg-primary/10 animate-pulse" />
          <div className="size-6 rounded-full bg-primary/10 animate-pulse" />
          <div className="h-4 w-24 bg-primary/10 animate-pulse" />
        </div>
      </div>
      <div className="p-4 sm:p-6 space-y-6">
        <div className="space-y-4">
          <div className="h-8 w-64 bg-primary/10 animate-pulse" />
          <div className="h-4 w-full bg-muted/30 animate-pulse" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-32 bg-primary/10 animate-pulse" />
          <div className="h-10 w-32 bg-muted/30 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

function ProjectStatus({ status }: { status: string }) {
  const statusClass =
    status === "Active"
      ? "bg-primary/30 text-primary border-primary/40"
      : status === "In Development"
        ? "bg-accent/30 text-accent-foreground border-accent/40"
        : status === "Beta"
          ? "bg-blue-500/30 text-blue-400 border-blue-500/40"
          : "bg-muted text-muted-foreground border-border";

  return (
    <span
      className={`text-xs px-3 py-1 font-mono font-medium border shrink-0 ${statusClass}`}
    >
      {status}
    </span>
  );
}

function ProjectStatusSmall({ status }: { status: string }) {
  const statusClass =
    status === "Active"
      ? "bg-primary/30 text-primary border-primary/40"
      : status === "In Development"
        ? "bg-accent/30 text-accent-foreground border-accent/40"
        : status === "Beta"
          ? "bg-blue-500/30 text-blue-400 border-blue-500/40"
          : "bg-muted text-muted-foreground border-border";

  return (
    <span
      className={`text-[10px] px-2 py-0.5 font-mono font-medium border ${statusClass}`}
    >
      {status}
    </span>
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
