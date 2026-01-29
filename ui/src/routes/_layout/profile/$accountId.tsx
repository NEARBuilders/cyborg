import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Social } from "near-social-js";
import { toast } from "sonner";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "../../../components/ui/avatar";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { usePoke, useProfile } from "../../../integrations/near-social-js";
import { authClient } from "../../../lib/auth-client";
import { sessionQueryOptions } from "../../../lib/session";
import { apiClient } from "../../../utils/orpc";

const PROFILE_KEY = "builder-profile";

interface BuilderProfileData {
  displayName?: string;
  description?: string;
  role?: string;
  tags?: string[];
  projects?: { name: string; description: string; status: string }[];
  socials?: { github?: string; twitter?: string };
}

export const Route = createFileRoute("/_layout/profile/$accountId")({
  loader: async ({ params }) => {
    const social = new Social({ network: "mainnet" });
    const profile = await social.getProfile(params.accountId);
    return { profile, accountId: params.accountId };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Profile" },
          { name: "description", content: "View NEAR profile" },
        ],
      };
    }
    const { profile, accountId } = loaderData;
    const name = profile?.name || accountId;
    const description =
      profile?.description || `View ${accountId}'s NEAR profile`;

    return {
      meta: [
        { title: `${name} - Profile` },
        { name: "description", content: description },
        { property: "og:title", content: `${name} - Profile` },
        { property: "og:description", content: description },
      ],
    };
  },
  component: ProfilePage,
  notFoundComponent: () => (
    <div className="text-center py-12">
      <h1 className="text-2xl font-bold text-muted-foreground mb-4">
        Profile Not Found
      </h1>
      <p className="text-muted-foreground">
        The requested NEAR account profile could not be found.
      </p>
    </div>
  ),
  pendingComponent: () => (
    <div className="flex justify-center items-center min-h-[400px]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-foreground" />
    </div>
  ),
});

function ProfilePage() {
  const { profile: initialProfile, accountId } = Route.useLoaderData();
  const { data: profile } = useProfile(accountId, {
    initialData: initialProfile,
  });
  const { data: session } = useQuery(sessionQueryOptions);
  const nearState = authClient.useNearState();
  const { mutate: poke, isPending: isPoking } = usePoke(accountId);
  const queryClient = useQueryClient();

  // Get current account ID from multiple sources (same as user-nav)
  const currentAccountId =
    nearState?.accountId ||
    (session?.user as any)?.nearAccount?.accountId ||
    session?.user?.name;
  const isOwnProfile = !!currentAccountId && currentAccountId === accountId;

  const [isEditing, setIsEditing] = useState(false);

  // Load user rank from API
  const { data: rankData, isLoading: isLoadingRank } = useQuery({
    queryKey: ["user-rank", accountId],
    queryFn: () => apiClient.getUserRank({ accountId }),
    enabled: !!accountId,
  });

  // Load builder profile from KV store
  const { data: storedProfile } = useQuery({
    queryKey: ["kv", PROFILE_KEY, accountId],
    queryFn: async () => {
      if (!isOwnProfile) return null;
      try {
        const result = await apiClient.getValue({ key: PROFILE_KEY });
        return JSON.parse(result.value) as BuilderProfileData;
      } catch {
        return null;
      }
    },
    enabled: isOwnProfile,
  });

  // Merge NEAR Social profile with stored builder data
  const displayName =
    storedProfile?.displayName || profile?.name || accountId.split(".")[0];
  const description =
    storedProfile?.description ||
    profile?.description ||
    "A passionate builder in the NEAR ecosystem.";
  const role = storedProfile?.role || "Builder";
  const tags =
    storedProfile?.tags ||
    (profile?.tags ? Object.keys(profile.tags) : ["NEAR Builder"]);
  const projects = storedProfile?.projects || [
    {
      name: "NEAR Project",
      description: "Building on the NEAR ecosystem.",
      status: "Active",
    },
  ];
  const socials = storedProfile?.socials || {
    github: profile?.linktree?.github as string | undefined,
    twitter: profile?.linktree?.twitter as string | undefined,
  };

  const avatarUrl = profile?.image?.ipfs_cid
    ? `https://ipfs.near.social/ipfs/${profile.image.ipfs_cid}`
    : profile?.image?.url ||
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${accountId}`;

  const handlePoke = () => {
    poke(undefined, {
      onSuccess: () => {
        toast.success(`Poked ${displayName}!`);
      },
      onError: (error) => {
        const message =
          error instanceof Error ? error.message : "Failed to poke";
        toast.error(message);
      },
    });
  };

  const canPoke = !!currentAccountId && !isOwnProfile;

  return (
    <div className="flex-1 border border-primary/30 bg-background h-full overflow-y-auto">
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header */}
        <ProfileHeader
          accountId={accountId}
          displayName={displayName}
          avatarUrl={avatarUrl}
          role={role}
          isOwnProfile={isOwnProfile}
          isEditing={isEditing}
          onEditToggle={() => setIsEditing(!isEditing)}
        />

        {isEditing && isOwnProfile ? (
          <ProfileEditForm
            initialData={{
              displayName,
              description,
              role,
              tags,
              projects,
              socials,
            }}
            onSave={() => {
              setIsEditing(false);
              queryClient.invalidateQueries({
                queryKey: ["kv", PROFILE_KEY, accountId],
              });
            }}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <>
            {/* NEAR Legion Rank */}
            <LegionRankSection rankData={rankData} isLoading={isLoadingRank} />

            {/* Skills/Tags */}
            <ProfileSkills tags={tags} />

            {/* About */}
            <ProfileAbout description={description} />

            {/* Projects */}
            <ProfileProjects projects={projects} />

            {/* Socials */}
            <ProfileSocials socials={socials} />

            {/* Actions */}
            <div className="pt-4 border-t border-border/50">
              {canPoke ? (
                <Button
                  onClick={handlePoke}
                  disabled={isPoking}
                  variant="outline"
                >
                  {isPoking ? "Poking..." : "Poke"}
                </Button>
              ) : !currentAccountId ? (
                <Link to="/login" search={{ redirect: `/profile/${accountId}` }}>
                  <Button variant="outline">Sign in to interact</Button>
                </Link>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface RankData {
  rank: "legendary" | "epic" | "rare" | "common" | null;
  tokenId: string | null;
  hasNft: boolean;
  hasInitiate: boolean;
}

function ProfileHeader({
  accountId,
  displayName,
  avatarUrl,
  role,
  isOwnProfile,
  isEditing,
  onEditToggle,
}: {
  accountId: string;
  displayName: string;
  avatarUrl: string;
  role: string;
  isOwnProfile: boolean;
  isEditing: boolean;
  onEditToggle: () => void;
}) {
  return (
    <div className="flex items-start gap-4">
      <Avatar className="size-16 sm:size-14 border-2 border-primary/60">
        <AvatarImage src={avatarUrl} />
        <AvatarFallback className="bg-primary/20 text-primary text-lg sm:text-base font-mono font-bold">
          {displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-xl sm:text-xl font-bold text-foreground">
              {displayName}
            </h2>
            <p className="font-mono text-primary text-sm sm:text-sm">
              {accountId}
            </p>
          </div>
          {isOwnProfile && (
            <Button
              variant="outline"
              size="sm"
              onClick={onEditToggle}
              className="shrink-0"
            >
              {isEditing ? "Cancel" : "Edit Profile"}
            </Button>
          )}
        </div>
        <span className="inline-block text-xs bg-primary/25 text-primary px-3 py-1.5 font-mono font-medium">
          {role}
        </span>
      </div>
    </div>
  );
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
          No NEAR Legion NFTs found.{" "}
          <a
            href="https://nearlegion.near"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Join the Legion
          </a>
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

function ProfileSkills({ tags }: { tags: string[] }) {
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

function ProfileAbout({ description }: { description: string }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
        About
      </h3>
      <p className="text-foreground text-base leading-relaxed">{description}</p>
    </div>
  );
}

function ProfileProjects({
  projects,
}: {
  projects: { name: string; description: string; status: string }[];
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
        Building
      </h3>
      <div className="space-y-3">
        {projects.map((project) => (
          <div
            key={project.name}
            className="p-4 border border-border/50 bg-muted/30 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-foreground font-semibold text-base">
                {project.name}
              </span>
              <ProjectStatus status={project.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {project.description}
            </p>
          </div>
        ))}
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
    <span
      className={`text-[10px] px-2 py-0.5 font-mono font-medium border ${statusClass}`}
    >
      {status}
    </span>
  );
}

function ProfileSocials({
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

function ProfileEditForm({
  initialData,
  onSave,
  onCancel,
}: {
  initialData: BuilderProfileData;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState<BuilderProfileData>(initialData);
  const [newTag, setNewTag] = useState("");
  const [newProject, setNewProject] = useState({
    name: "",
    description: "",
    status: "Active",
  });

  const saveMutation = useMutation({
    mutationFn: async (data: BuilderProfileData) => {
      return apiClient.setValue({
        key: PROFILE_KEY,
        value: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast.success("Profile saved!");
      onSave();
    },
    onError: (error) => {
      toast.error(
        `Failed to save: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    },
  });

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags?.includes(newTag.trim())) {
      setFormData((prev) => ({
        ...prev,
        tags: [...(prev.tags || []), newTag.trim()],
      }));
      setNewTag("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags?.filter((t) => t !== tag) || [],
    }));
  };

  const handleAddProject = () => {
    if (newProject.name.trim() && newProject.description.trim()) {
      setFormData((prev) => ({
        ...prev,
        projects: [...(prev.projects || []), newProject],
      }));
      setNewProject({ name: "", description: "", status: "Active" });
    }
  };

  const handleRemoveProject = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      projects: prev.projects?.filter((_, i) => i !== index) || [],
    }));
  };

  return (
    <div className="space-y-6">
      {/* Display Name */}
      <div className="space-y-2">
        <label className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
          Display Name
        </label>
        <Input
          value={formData.displayName || ""}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, displayName: e.target.value }))
          }
          placeholder="Your display name"
        />
      </div>

      {/* Role */}
      <div className="space-y-2">
        <label className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
          Role
        </label>
        <Input
          value={formData.role || ""}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, role: e.target.value }))
          }
          placeholder="e.g., Developer, Designer, Founder"
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
          About
        </label>
        <textarea
          value={formData.description || ""}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, description: e.target.value }))
          }
          placeholder="Tell us about yourself..."
          rows={3}
          className="w-full px-2.5 py-1.5 bg-muted/10 border border-border/40 text-sm font-mono transition-all outline-none focus-visible:border-primary/40 focus-visible:bg-muted/20"
        />
      </div>

      {/* Skills/Tags */}
      <div className="space-y-3">
        <label className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
          Skills
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          {formData.tags?.map((tag) => (
            <span
              key={tag}
              className="text-sm bg-muted/60 text-foreground px-3 py-1.5 border border-border/50 flex items-center gap-2"
            >
              {tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="text-muted-foreground hover:text-destructive"
              >
                x
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="Add a skill..."
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
          />
          <Button type="button" variant="outline" onClick={handleAddTag}>
            Add
          </Button>
        </div>
      </div>

      {/* Projects */}
      <div className="space-y-3">
        <label className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
          Projects
        </label>
        <div className="space-y-3">
          {formData.projects?.map((project, index) => (
            <div
              key={index}
              className="p-4 border border-border/50 bg-muted/30 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-foreground font-semibold text-base">
                  {project.name}
                </span>
                <div className="flex items-center gap-2">
                  <ProjectStatus status={project.status} />
                  <button
                    type="button"
                    onClick={() => handleRemoveProject(index)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {project.description}
              </p>
            </div>
          ))}
        </div>

        {/* Add Project Form */}
        <div className="p-4 border border-dashed border-border/50 space-y-3">
          <Input
            value={newProject.name}
            onChange={(e) =>
              setNewProject((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="Project name"
          />
          <Input
            value={newProject.description}
            onChange={(e) =>
              setNewProject((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder="Project description"
          />
          <div className="flex gap-2">
            <select
              value={newProject.status}
              onChange={(e) =>
                setNewProject((prev) => ({ ...prev, status: e.target.value }))
              }
              className="flex-1 h-8 px-2.5 bg-muted/10 border border-border/40 text-sm font-mono outline-none focus-visible:border-primary/40"
            >
              <option value="Active">Active</option>
              <option value="In Development">In Development</option>
              <option value="Beta">Beta</option>
              <option value="Completed">Completed</option>
            </select>
            <Button type="button" variant="outline" onClick={handleAddProject}>
              Add Project
            </Button>
          </div>
        </div>
      </div>

      {/* Socials */}
      <div className="space-y-3">
        <label className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
          Social Links
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">GitHub</label>
            <Input
              value={formData.socials?.github || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  socials: { ...prev.socials, github: e.target.value },
                }))
              }
              placeholder="username"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Twitter</label>
            <Input
              value={formData.socials?.twitter || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  socials: { ...prev.socials, twitter: e.target.value },
                }))
              }
              placeholder="username"
            />
          </div>
        </div>
      </div>

      {/* Save/Cancel buttons */}
      <div className="flex gap-3 pt-4 border-t border-border/50">
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? "Saving..." : "Save Profile"}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
