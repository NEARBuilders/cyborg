import { createFileRoute, Link, useParams, Outlet, useMatches } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/ui/markdown";
import { useBuildersWithProfiles, useUserRank, type RankData } from "@/hooks";
import { useProfile } from "@/integrations/near-social-js";
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
  const { builders, isLoading } = useBuildersWithProfiles();
  const matches = useMatches();

  // If builder not in list, fetch their NEAR Social profile directly
  const builderInList = builders.find((b) => b.accountId === builderId);
  const { data: directProfile, isLoading: isLoadingProfile } = useProfile(builderId, {
    enabled: !builderInList && !isLoading,
  });

  const isOnProjectRoute = matches.some(
    (match) => match.routeId === "/_layout/_authenticated/builders/$builderId/$projectSlug"
  );

  // Create a builder object from direct profile if not in list
  const builder: Builder | undefined = builderInList || (directProfile ? {
    id: builderId,
    accountId: builderId,
    displayName: directProfile.name || builderId.split(".")[0],
    avatar: directProfile.image?.ipfs_cid
      ? `https://ipfs.near.social/ipfs/${directProfile.image.ipfs_cid}`
      : directProfile.image?.url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${builderId}`,
    backgroundImage: directProfile.backgroundImage?.ipfs_cid
      ? `https://ipfs.near.social/ipfs/${directProfile.backgroundImage.ipfs_cid}`
      : directProfile.backgroundImage?.url || null,
    role: "Builder",
    tags: directProfile.tags ? Object.keys(directProfile.tags) : ["NEAR Builder"],
    description: directProfile.description || "A builder in the NEAR ecosystem.",
    projects: [],
    socials: {
      github: directProfile.linktree?.github,
      twitter: directProfile.linktree?.twitter,
      website: directProfile.linktree?.website,
      telegram: directProfile.linktree?.telegram,
    },
  } : undefined);

  // Fetch rank data for the builder (shared cache across components)
  const { data: rankData, isLoading: isLoadingRank } = useUserRank(builderId);

  if (isLoading || isLoadingProfile) {
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
            No profile found for {builderId}
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
      {/* Background Image Banner */}
      {builder.backgroundImage && (
        <div className="relative h-32 sm:h-40 overflow-hidden">
          <img
            src={builder.backgroundImage}
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        </div>
      )}

      <div className={`p-4 sm:p-6 space-y-6 ${builder.backgroundImage ? "-mt-12 relative" : ""}`}>
        {/* Header */}
        <BuilderHeader builder={builder} />

        {/* Legion Rank */}
        <LegionRankSection rankData={rankData} isLoading={isLoadingRank} />

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
      <Markdown content={description} />
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
              <div className="text-sm text-muted-foreground line-clamp-2">
                <Markdown content={project.description} />
              </div>
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function LegionRankSection({
  rankData,
  isLoading,
}: {
  rankData?: RankData;
  isLoading: boolean;
}) {
  const getRankStyles = (r: string | null) => {
    switch (r) {
      case "legendary":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/40";
      case "epic":
        return "bg-purple-500/20 text-purple-400 border-purple-500/40";
      case "rare":
        return "bg-blue-500/20 text-blue-400 border-blue-500/40";
      case "common":
        return "bg-gray-500/20 text-gray-400 border-gray-500/40";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
        NEAR Legion Status
      </h3>
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
          Checking NFT holdings...
        </div>
      ) : !rankData ? (
        <p className="text-sm text-muted-foreground">Unable to load rank data</p>
      ) : !rankData.hasNft && !rankData.hasInitiate ? (
        <p className="text-sm text-muted-foreground">
          No NEAR Legion NFTs found.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {rankData.hasNft && rankData.rank && (
            <span
              className={`inline-flex items-center gap-1.5 text-sm px-4 py-2 font-mono font-medium border ${getRankStyles(rankData.rank)}`}
            >
              <span className="text-base">
                {rankData.rank === "legendary" && "🏆"}
                {rankData.rank === "epic" && "💎"}
                {rankData.rank === "rare" && "⭐"}
                {rankData.rank === "common" && "🎖️"}
              </span>
              {rankData.rank.charAt(0).toUpperCase() + rankData.rank.slice(1)} Ascendant
              {rankData.tokenId && (
                <span className="text-xs opacity-60">#{rankData.tokenId}</span>
              )}
            </span>
          )}
          {rankData.hasInitiate && (
            <span className="inline-flex items-center gap-1.5 text-sm bg-emerald-500/20 text-emerald-400 border-emerald-500/40 px-4 py-2 font-mono font-medium border">
              <span className="text-base">🌱</span>
              Initiate
            </span>
          )}
        </div>
      )}
    </div>
  );
}
