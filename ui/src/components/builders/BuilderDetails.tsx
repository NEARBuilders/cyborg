/**
 * Builder Details Component
 * Right panel showing selected builder info
 */

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Markdown } from "@/components/ui/markdown";
import type { Builder } from "./BuilderListItem";

interface BuilderDetailsProps {
  builder: Builder;
}

export function BuilderDetails({ builder }: BuilderDetailsProps) {
  return (
    <div className="flex-1 border border-primary/30 bg-background h-full overflow-y-auto">
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header */}
        <BuilderHeader builder={builder} />

        {/* Skills */}
        <BuilderSkills tags={builder.tags} />

        {/* About */}
        <BuilderAbout description={builder.description} />

        {/* Projects */}
        <BuilderProjects projects={builder.projects} />

        {/* Socials */}
        {builder.socials && <BuilderSocials socials={builder.socials} />}
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
        <p className="font-mono text-primary text-sm sm:text-sm">{builder.accountId}</p>
        <span className="inline-block text-xs bg-primary/25 text-primary px-3 py-1.5 font-mono font-medium">
          {builder.role}
        </span>
      </div>
    </div>
  );
}

function BuilderSkills({ tags }: { tags: string[] }) {
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
  return (
    <div className="space-y-3">
      <h3 className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
        About
      </h3>
      <Markdown content={description} />
    </div>
  );
}

function BuilderProjects({
  projects,
}: {
  projects: { name: string; description: string; status: string }[];
}) {
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <h3 className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
        Building
      </h3>
      <div className="space-y-3">
        {projects.map((project) => {
          const isExpanded = expandedProject === project.name;
          return (
            <div
              key={project.name}
              className="p-4 border border-border/50 bg-muted/30 space-y-2 cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => setExpandedProject(isExpanded ? null : project.name)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-foreground font-semibold text-base">
                  {project.name}
                </span>
                <div className="flex items-center gap-2">
                  <ProjectStatus status={project.status} />
                  <span className="text-muted-foreground text-xs">
                    {isExpanded ? "▼" : "▶"}
                  </span>
                </div>
              </div>
              {isExpanded && (
                <div className="pt-2 border-t border-border/30 mt-2">
                  <div className="text-sm text-muted-foreground">
                    <Markdown content={project.description} />
                  </div>
                </div>
              )}
            </div>
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
        ? "bg-accent/30 text-accent border-accent/40"
        : status === "Beta"
          ? "bg-blue-500/30 text-blue-400 border-blue-500/40"
          : "bg-muted text-muted-foreground border-border";

  return (
    <span className={`text-[10px] px-2 py-0.5 font-mono font-medium border ${statusClass}`}>
      {status}
    </span>
  );
}

function BuilderSocials({
  socials,
}: {
  socials: { github?: string; twitter?: string; website?: string; telegram?: string };
}) {
  if (!socials.github && !socials.twitter && !socials.website && !socials.telegram) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
        Connect
      </h3>
      <div className="flex flex-wrap gap-4">
        {socials.website && (
          <a
            href={socials.website.startsWith("http") ? socials.website : `https://${socials.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:text-primary/80 transition-colors font-mono underline underline-offset-4"
          >
            {socials.website.replace(/^https?:\/\//, "")}
          </a>
        )}
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
        {socials.telegram && (
          <a
            href={`https://t.me/${socials.telegram}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:text-primary/80 transition-colors font-mono underline underline-offset-4"
          >
            t.me/{socials.telegram}
          </a>
        )}
      </div>
    </div>
  );
}
