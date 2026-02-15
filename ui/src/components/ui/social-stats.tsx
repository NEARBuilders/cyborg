import { Skeleton } from "./skeleton";
import { Users, UserCheck, Code2 } from "lucide-react";
import { useLegionStats } from "@/hooks/useLegionGraph";
import { Link } from "@tanstack/react-router";
import { useProjects } from "@/hooks/useProjects";

interface SocialStatsProps {
  accountId: string;
  className?: string;
  showProjectsLink?: boolean;
}

export function SocialStats({ accountId, className = "", showProjectsLink = false }: SocialStatsProps) {
  const { data: stats, isLoading } = useLegionStats(accountId);

  const followersCount = stats?.followers || 0;
  const followingCount = stats?.following || 0;

  // Fetch projects count for this account
  const { data: projectsData } = useProjects(undefined, 50, 0, accountId);
  const projectsCount = projectsData?.projects.length || 0;

  if (isLoading) {
    return (
      <div className={`flex items-center gap-4 ${className}`}>
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-20" />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <Link
        to="/profile/$accountId"
        params={{ accountId }}
        search={{ from: undefined, tab: "followers" }}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Users className="size-4" />
        <span className="font-semibold text-foreground">{followersCount}</span>
        <span>Followers</span>
      </Link>

      <Link
        to="/profile/$accountId"
        params={{ accountId }}
        search={{ from: undefined, tab: "following" }}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <UserCheck className="size-4" />
        <span className="font-semibold text-foreground">{followingCount}</span>
        <span>Following</span>
      </Link>

      {showProjectsLink && (
        <Link
          to="/profile/$accountId"
          params={{ accountId }}
          search={{ from: undefined, tab: "projects" }}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Code2 className="size-4" />
          <span className="font-semibold text-foreground">{projectsCount}</span>
          <span>Projects</span>
        </Link>
      )}
    </div>
  );
}
