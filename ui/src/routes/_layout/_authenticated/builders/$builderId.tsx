import { createFileRoute, Link, useParams, Outlet, useMatches } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useBuilders } from "@/hooks";
import type { Builder, Project } from "@/types/builders";

export const Route = createFileRoute(
  "/_layout/_authenticated/builders/$builderId"
)({
  component: BuilderDetailPage,
});

function BuilderDetailPage() {
  const { builderId } = useParams({
    from: "/_layout/_authenticated/builders/$builderId",
  });
  const { builders, isLoading } = useBuilders();
  const matches = useMatches();

  const isOnProjectRoute = matches.some(
    (match) => match.routeId === "/_layout/_authenticated/builders/$builderId/$projectSlug"
  );

  const builder = builders.find((b) => b.accountId === builderId);

  if (isLoading) {
    return <BuilderDetailSkeleton />;
  }

  if (!builder) {
    return (
      <div className="flex-1 border border-primary/30 bg-background h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-4xl text-muted-foreground/30">🔍</div>
          <h3 className="text-lg font-medium text-foreground">
            Builder not found
          </h3>
          <p className="text-muted-foreground">
            This builder may no longer exist
          </p>
          <Link
            to="/builders"
            className="inline-block mt-4 px-4 py-2 bg-primary text-primary-foreground font-mono text-sm"
          >
            Back to builders
          </Link>
        </div>
      </div>
    );
  }

  if (isOnProjectRoute) {
    return <Outlet />;
  }

  return (
    <div className="flex-1 border border-primary/30 bg-background h-full overflow-y-auto animate-in fade-in duration-200">
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header */}
        <BuilderHeader builder={builder} />

        {/* Skills */}
        <BuilderSkills tags={builder.tags} />

        {/* About */}
        <BuilderAbout description={builder.description} />

        {/* Projects - Clickable */}
        <BuilderProjects projects={builder.projects} accountId={builder.accountId} />

        {/* Socials */}
        {builder.socials && <BuilderSocials socials={builder.socials} />}
      </div>
    </div>
  );
}

function BuilderDetailSkeleton() {
  return (
    <div className="flex-1 border border-primary/30 bg-background h-full overflow-y-auto">
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex items-start gap-4">
          <div className="size-16 rounded-full bg-primary/10 animate-pulse" />
          <div className="space-y-2 flex-1">
            <div className="h-6 w-40 bg-primary/10 animate-pulse" />
            <div className="h-4 w-32 bg-primary/10 animate-pulse" />
            <div className="h-6 w-20 bg-primary/10 animate-pulse" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-4 w-16 bg-primary/10 animate-pulse" />
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 w-20 bg-muted/50 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BuilderHeader({ builder }: { builder: Builder }) {
  return (
    <div className="flex items-start gap-4">
      <Avatar className="size-16 sm:size-14 border-2 border-primary/60">
        <AvatarImage src={builder.avatar || undefined} />
        <AvatarFallback className="bg-primary/20 text-primary text-lg sm:text-base font-mono font-bold">
          {builder.displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="space-y-2">
        <h2 className="text-xl sm:text-xl font-bold text-foreground">
          {builder.displayName}
        </h2>
        <p className="font-mono text-primary text-sm sm:text-sm">
          {builder.accountId}
        </p>
        <span className="inline-block text-xs bg-primary/25 text-primary px-3 py-1.5 font-mono font-medium">
          {builder.role}
        </span>
      </div>
    </div>
  );
}

function BuilderSkills({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="space-y-3">
      <h3 className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
        Skills
      </h3>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="text-sm bg-muted/60 text-foreground px-3 py-1.5 border border-border/50"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

function BuilderAbout({ description }: { description: string }) {
  if (!description) return null;
  return (
    <div className="space-y-3">
      <h3 className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
        About
      </h3>
      <p className="text-foreground text-base leading-relaxed">{description}</p>
    </div>
  );
}

function BuilderProjects({
  projects,
  accountId,
}: {
  projects: Project[];
  accountId: string;
}) {
  if (!projects.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
        Projects
      </h3>
      <div className="space-y-3">
        {projects.map((project) => {
          const projectSlug = project.slug || slugify(project.name);
          return (
            <Link
              key={project.name}
              to="/builders/$builderId/$projectSlug"
              params={{ builderId: accountId, projectSlug }}
              className="group block p-4 border border-border/50 bg-muted/30 space-y-2 hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-foreground font-semibold text-base group-hover:text-primary transition-colors">
                  {project.name}
                </span>
                <ProjectStatus status={project.status} />
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {project.description}
              </p>
              {project.technologies && project.technologies.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {project.technologies.slice(0, 3).map((tech) => (
                    <Badge key={tech} variant="secondary">
                      {tech}
                    </Badge>
                  ))}
                  {project.technologies.length > 3 && (
                    <Badge variant="secondary">
                      +{project.technologies.length - 3}
                    </Badge>
                  )}
                </div>
              )}
            </Link>
          );
        })}
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
      className={`text-[10px] px-2 py-0.5 font-mono font-medium border ${statusClass}`}
    >
      {status}
    </span>
  );
}

function BuilderSocials({
  socials,
}: {
  socials: { github?: string; twitter?: string };
}) {
  if (!socials.github && !socials.twitter) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
        Connect
      </h3>
      <div className="flex flex-wrap gap-4">
        {socials.github && (
          <a
            href={`https://github.com/${socials.github}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:text-primary/80 transition-colors font-mono underline underline-offset-4"
          >
            github/{socials.github}
          </a>
        )}
        {socials.twitter && (
          <a
            href={`https://twitter.com/${socials.twitter}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:text-primary/80 transition-colors font-mono underline underline-offset-4"
          >
            @{socials.twitter}
          </a>
        )}
      </div>
    </div>
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
