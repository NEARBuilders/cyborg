import { useState, useEffect, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { Social } from "near-social-js";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/ui/markdown";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { EditModal } from "@/components/ui/edit-modal";
import { SocialLinksModal } from "@/components/ui/social-links-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings, ArrowLeft } from "lucide-react";
import {
  useProfile,
  usePoke,
  useProfiles,
} from "@/integrations/near-social-js";
import {
  useUserRank,
  useHolderTypes,
  type RankData,
  type HolderTypesData,
} from "@/hooks";
import { authClient } from "@/lib/auth-client";
import { sessionQueryOptions } from "@/lib/session";
import { apiClient } from "@/utils/orpc";
import { Near } from "near-kit";
import { FollowButton } from "@/components/ui/follow-button";
import { LegionFollowButton } from "@/components/ui/legion-follow-button";
import { SocialStats } from "@/components/ui/social-stats";
import { useLegionFollowers, useLegionFollowing } from "@/hooks/useLegionGraph";
import {
  useProjects,
  useDeleteProject,
  useCreateProject,
  useUpdateProject,
  type Project,
} from "@/hooks/useProjects";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const PROFILE_KEY = "builder-profile";

interface BuilderProfileData {
  displayName?: string;
  description?: string;
  role?: string;
  tags?: string[];
  socials?: Record<string, string>;
  avatarUrl?: string;
  backgroundUrl?: string;
}

// Chat state interface (same as in chat-page.tsx)
interface ChatState {
  messages: Array<{
    id: string;
    role: string;
    content: string;
    createdAt: string;
    isStreaming?: boolean;
  }>;
  conversationId: string | null;
  isStreaming: boolean;
}

export const Route = createFileRoute("/_layout/profile/$accountId")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      from: (search.from as string | undefined) ?? undefined,
      tab:
        (search.tab as "followers" | "following" | "projects" | undefined) ??
        undefined,
    };
  },
  loader: async ({ params }) => {
    const social = new Social({ network: "mainnet" });
    const profile = await social.getProfile(params.accountId);
    return { profile, accountId: params.accountId };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Profile - Legion Social" },
          { name: "description", content: "View NEAR profile" },
          { property: "og:title", content: "NEAR Profile - Legion Social" },
          { property: "og:description", content: "View NEAR profile" },
          { property: "og:image", content: `${window.location.origin}/og.jpg` },
          { property: "og:image:width", content: "1200" },
          { property: "og:image:height", content: "630" },
          { property: "og:type", content: "profile" },
          { name: "twitter:card", content: "summary_large_image" },
          {
            name: "twitter:image",
            content: `${window.location.origin}/og.jpg`,
          },
        ],
      };
    }
    const { profile, accountId } = loaderData;
    const name = profile?.name || accountId;
    const description =
      profile?.description || `View ${accountId}'s NEAR profile`;
    const avatarUrl = profile?.image?.ipfs_cid
      ? `https://ipfs.near.social/ipfs/${profile.image.ipfs_cid}`
      : profile?.image?.url || `${window.location.origin}/og.jpg`;

    return {
      meta: [
        { title: `${name} - Profile` },
        { name: "description", content: description },
        { property: "og:title", content: `${name} - Legion Social` },
        { property: "og:description", content: description },
        { property: "og:image", content: avatarUrl },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: avatarUrl },
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
  pendingComponent: () => <ProfileSkeleton />,
});

function ProfilePage() {
  const { profile: initialProfile, accountId } = Route.useLoaderData();
  const search = Route.useSearch();
  const { data: profile } = useProfile(accountId, {
    initialData: initialProfile,
  });
  const { data: session } = useQuery(sessionQueryOptions);
  const nearState = authClient.useNearState();
  const { mutate: poke, isPending: isPoking } = usePoke(accountId);
  const queryClient = useQueryClient();
  const routerState = useRouterState();
  const chatState = routerState.location.state as unknown as
    | ChatState
    | undefined;
  const navigate = Route.useNavigate();

  const showBackToChat = search.from === "chat";

  // Map URL tab to socialTab state
  const urlTabToSocialTab = (
    tab: typeof search.tab,
  ): "none" | "followers" | "following" | "projects" => {
    if (tab === "followers") return "followers";
    if (tab === "following") return "following";
    if (tab === "projects") return "projects";
    return "none";
  };

  // Social tab state (followers/following/projects - social media style)
  const [socialTab, setSocialTab] = useState<
    "none" | "followers" | "following" | "projects"
  >(() => urlTabToSocialTab(search.tab));

  // Update URL when socialTab changes
  const handleSetSocialTab = useCallback(
    (tab: "none" | "followers" | "following" | "projects") => {
      setSocialTab(tab);
      // Update URL search params
      if (tab === "none") {
        navigate({ search: { from: search.from } });
      } else {
        navigate({ search: { ...search, tab: tab } });
      }
    },
    [navigate, search.from, search.tab],
  );

  // Sync socialTab with URL changes
  useEffect(() => {
    setSocialTab(urlTabToSocialTab(search.tab));
  }, [search.tab]);

  // Log when we receive chat state
  console.log("🟡 ProfilePage - Received state:", {
    showBackToChat,
    hasState: !!chatState,
    messageCount: chatState?.messages?.length ?? 0,
    conversationId: chatState?.conversationId,
  });

  // Get current account ID from multiple sources (same as user-nav)
  const currentAccountId =
    nearState?.accountId ||
    (session?.user as any)?.nearAccount?.accountId ||
    session?.user?.name;

  // Check own profile by comparing current account ID with the profile's account ID
  // The URL param (accountId) might be a slug like "Jean" but the actual account is "jemartel.near"
  // We need to normalize the comparison to handle cases like:
  // - jemartel.near vs jemartel
  // - jemartel.near vs Jean (if that's the profile name)
  const normalizeAccountId = (id: string) => {
    // Remove .near suffix if present
    return id.replace(/\.near$/, "").toLowerCase();
  };

  const isOwnProfile =
    !!currentAccountId &&
    (currentAccountId === accountId ||
      normalizeAccountId(currentAccountId) === normalizeAccountId(accountId));

  // Fetch projects for this account using useProjects hook (same as /projects page)
  const {
    data: projectsData,
    isLoading: isLoadingProjects,
    error: projectsError,
  } = useProjects(undefined, 50, 0, accountId);
  const projects = projectsData?.projects ?? [];

  const [isEditing, setIsEditing] = useState(false);

  // Local state for edits (overrides KV data)
  const [localProfile, setLocalProfile] = useState<BuilderProfileData | null>(
    null,
  );

  // Modal states
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [isSocialLinksModalOpen, setIsSocialLinksModalOpen] = useState(false);
  const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);
  const [isSavingSocialLinks, setIsSavingSocialLinks] = useState(false);
  const [isSavingTags, setIsSavingTags] = useState(false);

  // Status filter for projects (when viewing profile's projects tab)
  const [projectStatusFilter, setProjectStatusFilter] = useState<
    "all" | "active" | "completed" | "archived"
  >("all");

  // Reset social tab when navigating to different profile
  useEffect(() => {
    setSocialTab("none");
    // Clear local profile to prevent data from previous profile persisting
    setLocalProfile(null);
    // Clear tab from URL
    if (search.tab) {
      navigate({ search: { from: search.from } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const [editFormData, setEditFormData] = useState<BuilderProfileData>({
    displayName: "",
    description: "",
    role: "",
    tags: [],
    socials: {},
  });

  // Pending image URLs (on save)
  const [pendingAvatarUrl, setPendingAvatarUrl] = useState<string>("");
  const [pendingBackgroundUrl, setPendingBackgroundUrl] = useState<string>("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Load user rank from API (shared cache across components)
  const { data: rankData, isLoading: isLoadingRank } = useUserRank(accountId);

  // Load holder types (NEW - shows all NFT contracts held)
  const { data: holderTypes, isLoading: isLoadingHolderTypes } =
    useHolderTypes(accountId);

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
  // Prefer local edits first, then stored data, then NEAR Social
  const sourceProfile = localProfile || storedProfile;
  const displayName =
    sourceProfile?.displayName || profile?.name || accountId.split(".")[0];
  const description =
    sourceProfile?.description?.trim() ||
    profile?.description ||
    "A passionate builder in the NEAR ecosystem.";
  const role = sourceProfile?.role || "Builder";
  const tags =
    (sourceProfile?.tags?.length ? sourceProfile.tags : null) ||
    (profile?.tags ? Object.keys(profile.tags) : ["NEAR Builder"]);
  const socials = sourceProfile?.socials || {
    github: profile?.linktree?.github as string | undefined,
    twitter: profile?.linktree?.twitter as string | undefined,
    website: profile?.linktree?.website as string | undefined,
    telegram: profile?.linktree?.telegram as string | undefined,
  };

  const avatarUrl = profile?.image?.ipfs_cid
    ? `https://ipfs.near.social/ipfs/${profile.image.ipfs_cid}`
    : profile?.image?.url ||
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${accountId}`;

  const backgroundUrl = profile?.backgroundImage?.ipfs_cid
    ? `https://ipfs.near.social/ipfs/${profile.backgroundImage.ipfs_cid}`
    : profile?.backgroundImage?.url || null;

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

  // Delete project mutation (for own profile only)
  const { delete: deleteProject, isPending: isDeletingProject } =
    useDeleteProject();

  // Create project mutation (for own profile only)
  const { create: createProject, isPending: isCreatingProject } =
    useCreateProject();

  // Update project mutation (for own profile only)
  const { update: updateProject, isPending: isUpdatingProject } =
    useUpdateProject();

  // Create project modal state
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] =
    useState(false);
  const [newProjectData, setNewProjectData] = useState<{
    name: string;
    description: string;
    coverImageUrl: string;
    status: "active" | "completed" | "archived";
    githubLinks: Array<{ url: string; description?: string }>;
    tags: Array<{ name: string; target?: string }>;
  }>({
    name: "",
    description: "",
    coverImageUrl: "",
    status: "active",
    githubLinks: [],
    tags: [],
  });

  // Edit project modal state
  const [isEditProjectModalOpen, setIsEditProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editProjectData, setEditProjectData] = useState<{
    name: string;
    description: string;
    coverImageUrl: string;
    status: "active" | "completed" | "archived";
    githubLinks: Array<{ url: string; description?: string }>;
    tags: Array<{ name: string; target?: string }>;
  }>({
    name: "",
    description: "",
    coverImageUrl: "",
    status: "active",
    githubLinks: [],
    tags: [],
  });

  return (
    <div className="flex-1 border border-primary/30 bg-background h-full overflow-y-auto relative">
      {/* Back to Chat button - top left (when no background) */}
      {showBackToChat && chatState && !backgroundUrl && (
        <div className="absolute top-3 left-3 z-10">
          <Link
            to="/chat"
            state={chatState as any}
            onClick={() => {
              console.log(
                "🔴 ProfilePage - Navigating back to chat with state:",
                {
                  messageCount: chatState?.messages?.length ?? 0,
                  conversationId: chatState?.conversationId,
                },
              );
            }}
          >
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-1.5 text-xs bg-background/80 backdrop-blur-sm hover:bg-background/90 text-foreground border border-border/50"
            >
              <ArrowLeft className="size-3.5" />
              Back to Chat
            </Button>
          </Link>
        </div>
      )}

      {/* Background Image Banner */}
      {backgroundUrl && (
        <div className="relative h-32 sm:h-40 overflow-hidden">
          <img
            src={backgroundUrl}
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          {/* Back to Chat button - top left */}
          {showBackToChat && chatState && (
            <div className="absolute top-3 left-3 z-10">
              <Link
                to="/chat"
                state={chatState as any}
                onClick={() => {
                  console.log(
                    "🔴 ProfilePage - Navigating back to chat with state:",
                    {
                      messageCount: chatState?.messages?.length ?? 0,
                      conversationId: chatState?.conversationId,
                    },
                  );
                }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1.5 text-xs bg-background/80 backdrop-blur-sm hover:bg-background/90 text-foreground border border-border/50"
                >
                  <ArrowLeft className="size-3.5" />
                  Back to Chat
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}

      <div
        className={`p-4 sm:p-6 space-y-6 ${backgroundUrl ? "-mt-12 relative" : ""}`}
      >
        {/* Header */}
        <ProfileHeader
          accountId={accountId}
          displayName={displayName}
          avatarUrl={avatarUrl}
          role={role}
          isOwnProfile={isOwnProfile}
        >
          {isOwnProfile && (
            <button
              onClick={() => {
                setEditFormData({
                  displayName,
                  description,
                  role,
                  tags,
                  projects,
                  socials,
                });
                setIsEditProfileModalOpen(true);
              }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-lg hover:bg-muted/50 font-medium"
            >
              <Settings className="size-3.5" />
              Edit
            </button>
          )}
        </ProfileHeader>

        {/* Social Stats & Follow Button */}
        <div className="flex items-center justify-between gap-4">
          <SocialStats accountId={accountId} showProjectsLink={true} />
          {!isOwnProfile && (
            <LegionFollowButton
              accountId={accountId}
              currentUserId={currentAccountId}
            />
          )}
        </div>

        {/* Social Media Style: Followers/Following/Projects Tabs */}
        {socialTab !== "none" && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 border-b border-border/50">
              <button
                onClick={() => handleSetSocialTab("followers")}
                className={`px-4 py-2 text-base font-medium transition-colors relative ${
                  socialTab === "followers"
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Followers
                {socialTab === "followers" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
              <button
                onClick={() => handleSetSocialTab("following")}
                className={`px-4 py-2 text-base font-medium transition-colors relative ${
                  socialTab === "following"
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Following
                {socialTab === "following" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
              <button
                onClick={() => handleSetSocialTab("projects")}
                className={`px-4 py-2 text-base font-medium transition-colors relative ${
                  socialTab === "projects"
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Projects
                {socialTab === "projects" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
              <button
                onClick={() => handleSetSocialTab("none")}
                className="ml-auto text-sm text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            {socialTab === "projects" ? (
              <ProfileProjects
                projects={projects}
                isLoadingProjects={isLoadingProjects}
                statusFilter={projectStatusFilter}
                onStatusFilterChange={setProjectStatusFilter}
                isOwnProfile={isOwnProfile}
                onDeleteProject={
                  isOwnProfile
                    ? async (projectId) => {
                        if (
                          confirm(
                            "Are you sure you want to delete this project?",
                          )
                        ) {
                          await deleteProject(projectId);
                        }
                      }
                    : undefined
                }
                onEditProject={
                  isOwnProfile
                    ? (project) => {
                        setEditingProject(project);
                        setEditProjectData({
                          name: project.name,
                          description: project.description || "",
                          coverImageUrl: project.coverImageUrl || "",
                          status: project.status,
                          githubLinks: project.githubLinks || [],
                          tags: project.tags || [],
                        });
                        setIsEditProjectModalOpen(true);
                      }
                    : undefined
                }
                isCreatingProject={isCreatingProject}
                onCreateProject={() => setIsCreateProjectModalOpen(true)}
                accountId={accountId}
              />
            ) : (
              <SocialList accountId={accountId} type={socialTab} />
            )}
          </div>
        )}

        {isEditing && isOwnProfile ? (
          <ProfileEditForm
            initialData={{
              displayName,
              description,
              role,
              tags,
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
            <LegionRankSection
              rankData={rankData}
              holderTypes={holderTypes}
              isLoading={isLoadingRank || isLoadingHolderTypes}
            />

            {/* About */}
            <ProfileAbout description={description} />

            {/* Skills/Tags */}
            <ProfileSkills
              tags={tags}
              isOwnProfile={isOwnProfile}
              onEdit={() => setIsTagsModalOpen(true)}
            />

            {/* Socials */}
            <ProfileSocials
              socials={socials}
              isOwnProfile={isOwnProfile}
              onEdit={() => setIsSocialLinksModalOpen(true)}
            />

            {/* Actions */}
            <div className="pt-4 border-t border-border/50">
              <div className="flex flex-wrap gap-2">
                {canPoke ? (
                  <Button
                    onClick={handlePoke}
                    disabled={isPoking}
                    variant="outline"
                  >
                    {isPoking ? "Poking..." : "Poke"}
                  </Button>
                ) : null}
                {currentAccountId && !isOwnProfile && (
                  <>
                    <Button
                      onClick={() => handleSetSocialTab("followers")}
                      variant="outline"
                      size="sm"
                    >
                      View Followers
                    </Button>
                    <Button
                      onClick={() => handleSetSocialTab("following")}
                      variant="outline"
                      size="sm"
                    >
                      View Following
                    </Button>
                  </>
                )}
                {!currentAccountId && (
                  <Link
                    to="/login"
                    search={{ redirect: `/profile/${accountId}` }}
                  >
                    <Button variant="outline">Sign in to interact</Button>
                  </Link>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Edit Profile Modal */}
      <EditModal
        isOpen={isEditProfileModalOpen}
        onClose={() => {
          setIsEditProfileModalOpen(false);
          // Clear pending URLs on close
          setPendingAvatarUrl("");
          setPendingBackgroundUrl("");
        }}
        title="Edit Profile"
        isSaving={isSavingProfile}
        onSave={async () => {
          setIsSavingProfile(true);
          try {
            const nearAuth = authClient.near;
            if (!nearAuth) {
              throw new Error("No NEAR wallet connected");
            }

            const walletAccountId = nearAuth.getAccountId();
            if (!walletAccountId) {
              throw new Error("Please connect your NEAR wallet first");
            }

            // Build profile data with description AND images
            const profileData: any = {};

            // Always include description if it changed
            if (editFormData.description !== description) {
              profileData.description = editFormData.description;
            }

            if (pendingAvatarUrl) {
              profileData.image = { url: pendingAvatarUrl };
            }

            if (pendingBackgroundUrl) {
              profileData.backgroundImage = { url: pendingBackgroundUrl };
            }

            // If nothing to save to NEAR Social, just update locally
            if (Object.keys(profileData).length === 0) {
              setIsEditProfileModalOpen(false);
              toast.info("No changes to save");
              return;
            }

            toast.info("Updating profile... please approve transaction");

            // Use near-kit to update profile (URLs need minimal storage)
            const near = nearAuth.getNearClient();
            await near
              .transaction(walletAccountId)
              .functionCall(
                "social.near",
                "set",
                {
                  data: {
                    [accountId]: {
                      profile: profileData,
                    },
                  },
                },
                {
                  gas: "300 Tgas",
                  attachedDeposit: "0 NEAR",
                },
              )
              .send();

            console.log("Profile updated successfully");

            setIsEditProfileModalOpen(false);
            setPendingAvatarUrl("");
            setPendingBackgroundUrl("");

            // Update local profile with new values (no network call needed)
            setLocalProfile({
              displayName,
              description: editFormData.description,
              role,
              tags,
              projects,
              socials,
            });

            // Update KV database with image URLs
            try {
              const updatedProfile: BuilderProfileData = {
                displayName,
                description: editFormData.description,
                role,
                tags,
                socials,
                // Store image URLs in KV database for persistence
                ...(pendingAvatarUrl && { avatarUrl: pendingAvatarUrl }),
                ...(pendingBackgroundUrl && {
                  backgroundUrl: pendingBackgroundUrl,
                }),
              };

              await apiClient.setValue({
                key: PROFILE_KEY,
                value: JSON.stringify(updatedProfile),
              });

              console.log("Profile image URLs saved to database");
            } catch (dbError) {
              console.error("Failed to save to database:", dbError);
              // Don't fail the entire operation if database save fails
              // Profile is already saved to NEAR Social
            }

            toast.success("Profile updated on NEAR Social!");
          } catch (error) {
            console.error("Save error:", error);
            toast.error(
              error instanceof Error ? error.message : "Failed to save profile",
            );
          } finally {
            setIsSavingProfile(false);
          }
        }}
      >
        <div className="space-y-6">
          {/* Image URLs */}
          <div className="space-y-4 pb-6 border-b border-border/50">
            <p className="text-sm text-foreground">
              Add image URLs to your profile. Images will be saved to NEAR
              Social blockchain.
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  Profile Picture URL
                </label>
                <Input
                  value={pendingAvatarUrl}
                  onChange={(e) => setPendingAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.png"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  Background Image URL
                </label>
                <Input
                  value={pendingBackgroundUrl}
                  onChange={(e) => setPendingBackgroundUrl(e.target.value)}
                  placeholder="https://example.com/background.png"
                  className="h-9"
                />
              </div>
            </div>
          </div>

          {/* About Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">About</label>
            <MarkdownEditor
              value={editFormData.description || ""}
              onChange={(value) =>
                setEditFormData((prev) => ({ ...prev, description: value }))
              }
              placeholder="Tell us about yourself... Type / for commands"
              rows={10}
            />
          </div>
        </div>
      </EditModal>

      {/* Social Links Edit Modal */}
      <SocialLinksModal
        isOpen={isSocialLinksModalOpen}
        onClose={() => {
          setIsSocialLinksModalOpen(false);
        }}
        initialLinks={socials}
        isSaving={isSavingSocialLinks}
        onSave={async (links) => {
          setIsSavingSocialLinks(true);
          try {
            const nearAuth = authClient.near;
            if (!nearAuth) {
              throw new Error("No NEAR wallet connected");
            }

            const walletAccountId = nearAuth.getAccountId();
            if (!walletAccountId) {
              throw new Error("Please connect your NEAR wallet first");
            }

            // Build linktree data
            const linktree: any = {};
            if (links.website) linktree.website = links.website;
            if (links.github) linktree.github = links.github;
            if (links.twitter) linktree.twitter = links.twitter;
            if (links.telegram) linktree.telegram = links.telegram;

            toast.info("Updating social links... please approve transaction");

            // Use near-kit to update profile
            const near = nearAuth.getNearClient();
            await near
              .transaction(walletAccountId)
              .functionCall(
                "social.near",
                "set",
                {
                  data: {
                    [accountId]: {
                      profile: {
                        linktree,
                      },
                    },
                  },
                },
                {
                  gas: "300 Tgas",
                  attachedDeposit: "0 NEAR",
                },
              )
              .send();

            console.log("Social links updated successfully");

            // Update local state
            setLocalProfile({
              displayName,
              description,
              role,
              tags,
              projects,
              socials: links,
            });

            setIsSocialLinksModalOpen(false);

            // Invalidate profile to fetch updated data
            await queryClient.invalidateQueries({
              queryKey: ["social", "profile", accountId],
            });

            toast.success("Social links updated on NEAR Social!");
          } catch (error) {
            console.error("Save error:", error);
            toast.error(
              error instanceof Error
                ? error.message
                : "Failed to save social links",
            );
          } finally {
            setIsSavingSocialLinks(false);
          }
        }}
      />

      {/* Tags Edit Modal */}
      <EditModal
        isOpen={isTagsModalOpen}
        onClose={() => setIsTagsModalOpen(false)}
        title="Edit Skills"
        isSaving={isSavingTags}
        onSave={async () => {
          setIsSavingTags(true);
          try {
            const nearAuth = authClient.near;
            if (!nearAuth) {
              throw new Error("No NEAR wallet connected");
            }

            const walletAccountId = nearAuth.getAccountId();
            if (!walletAccountId) {
              throw new Error("Please connect your NEAR wallet first");
            }

            // Get the tags being edited (from localProfile if set, otherwise from source)
            const currentTags = localProfile?.tags || tags;

            // Filter out default tags from what will be saved
            const filteredTags = currentTags.filter(
              (tag) =>
                !["NEAR Expert", "Developer", "Community Leader"].includes(tag),
            );

            // Build tags object for NEAR Social (each tag as a key with empty string value)
            const tagsObject: Record<string, string> = {};
            filteredTags.forEach((tag) => {
              tagsObject[tag] = "";
            });

            // Calculate storage deposit: ~10KB of data per 100 tags, so ~0.01 NEAR per 100 tags
            // Adding a buffer for safety
            const storageCost = Math.max(
              0.01,
              filteredTags.length * 0.0001,
            ).toFixed(4);

            toast.info("Updating profile... please approve transaction");

            // Use near-kit to update profile tags on NEAR Social
            const near = nearAuth.getNearClient();
            await near
              .transaction(walletAccountId)
              .functionCall(
                "social.near",
                "set",
                {
                  data: {
                    [accountId]: {
                      profile: {
                        tags: tagsObject,
                      },
                    },
                  },
                },
                {
                  gas: "300 Tgas",
                  attachedDeposit: `${storageCost} NEAR`,
                },
              )
              .send();

            console.log("Tags updated successfully on NEAR Social");

            setIsTagsModalOpen(false);

            // Update local profile with new tags
            setLocalProfile((prev) => ({
              ...prev,
              tags: filteredTags,
            }));

            // Invalidate profile to fetch updated data
            await queryClient.invalidateQueries({
              queryKey: ["social", "profile", accountId],
            });

            toast.success("Skills updated on NEAR Social!");
          } catch (error) {
            console.error("Save error:", error);
            toast.error(
              error instanceof Error ? error.message : "Failed to save skills",
            );
          } finally {
            setIsSavingTags(false);
          }
        }}
      >
        <TagsEditContent
          initialTags={localProfile?.tags || tags}
          onChange={(newTags) => {
            setLocalProfile((prev) => ({
              ...prev,
              tags: newTags,
            }));
          }}
        />
      </EditModal>

      {/* Create Project Modal */}
      <Dialog
        open={isCreateProjectModalOpen}
        onOpenChange={setIsCreateProjectModalOpen}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Add a new project to your profile. You'll need to approve a
              transaction to save it.
            </DialogDescription>
          </DialogHeader>
          <form
            id="create-project-form"
            onSubmit={(e) => {
              e.preventDefault();
              createProject(newProjectData, {
                onSuccess: () => {
                  setIsCreateProjectModalOpen(false);
                  setNewProjectData({
                    name: "",
                    description: "",
                    coverImageUrl: "",
                    status: "active",
                    githubLinks: [],
                    tags: [],
                  });
                },
              });
            }}
            className="space-y-3 px-6 overflow-y-auto flex-1"
          >
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Project Name *
              </label>
              <Input
                value={newProjectData.name}
                onChange={(e) =>
                  setNewProjectData({ ...newProjectData, name: e.target.value })
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
                value={newProjectData.description}
                onChange={(value) =>
                  setNewProjectData({ ...newProjectData, description: value })
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
                value={newProjectData.coverImageUrl}
                onChange={(e) =>
                  setNewProjectData({
                    ...newProjectData,
                    coverImageUrl: e.target.value,
                  })
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
                value={newProjectData.status}
                onChange={(e) =>
                  setNewProjectData({
                    ...newProjectData,
                    status: e.target.value as
                      | "active"
                      | "completed"
                      | "archived",
                  })
                }
                className="w-full h-9 px-3 py-1 text-sm bg-background border border-border/50 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                GitHub Links
              </label>
              <div className="space-y-2">
                {newProjectData.githubLinks.map((link, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      type="url"
                      value={link.url}
                      onChange={(e) => {
                        const updated = [...newProjectData.githubLinks];
                        updated[index].url = e.target.value;
                        setNewProjectData({
                          ...newProjectData,
                          githubLinks: updated,
                        });
                      }}
                      placeholder="https://github.com/user/repo"
                      className="flex-1 h-9"
                    />
                    <Input
                      type="text"
                      value={link.description || ""}
                      onChange={(e) => {
                        const updated = [...newProjectData.githubLinks];
                        updated[index].description = e.target.value;
                        setNewProjectData({
                          ...newProjectData,
                          githubLinks: updated,
                        });
                      }}
                      placeholder="Description (e.g., Frontend)"
                      className="flex-1 h-9"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const updated = newProjectData.githubLinks.filter(
                          (_, i) => i !== index,
                        );
                        setNewProjectData({
                          ...newProjectData,
                          githubLinks: updated,
                        });
                      }}
                      className="h-9 px-3"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setNewProjectData({
                      ...newProjectData,
                      githubLinks: [
                        ...newProjectData.githubLinks,
                        { url: "", description: "" },
                      ],
                    })
                  }
                  className="w-full"
                >
                  + Add GitHub Link
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Tags
              </label>
              <div className="space-y-2">
                {newProjectData.tags.map((tag, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      type="text"
                      value={tag.name}
                      onChange={(e) => {
                        const updated = [...newProjectData.tags];
                        updated[index].name = e.target.value;
                        setNewProjectData({
                          ...newProjectData,
                          tags: updated,
                        });
                      }}
                      placeholder="Tag name (e.g., React)"
                      className="flex-1 h-9"
                    />
                    <Input
                      type="text"
                      value={tag.target || ""}
                      onChange={(e) => {
                        const updated = [...newProjectData.tags];
                        updated[index].target = e.target.value;
                        setNewProjectData({
                          ...newProjectData,
                          tags: updated,
                        });
                      }}
                      placeholder="Target (e.g., frontend)"
                      className="flex-1 h-9"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const updated = newProjectData.tags.filter(
                          (_, i) => i !== index,
                        );
                        setNewProjectData({
                          ...newProjectData,
                          tags: updated,
                        });
                      }}
                      className="h-9 px-3"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setNewProjectData({
                      ...newProjectData,
                      tags: [...newProjectData.tags, { name: "", target: "" }],
                    })
                  }
                  className="w-full"
                >
                  + Add Tag
                </Button>
              </div>
            </div>
          </form>

          <div className="flex gap-3 px-6 pb-6 pt-2 border-t border-border/50">
            <button
              type="submit"
              form="create-project-form"
              disabled={isCreatingProject || !newProjectData.name.trim()}
              className="flex-1 h-10 px-6 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={(e) => {
                e.preventDefault();
                const form = document.getElementById(
                  "create-project-form",
                ) as HTMLFormElement;
                if (form) form.requestSubmit();
              }}
            >
              {isCreatingProject ? "Creating..." : "Create Project"}
            </button>
            <button
              type="button"
              onClick={() => setIsCreateProjectModalOpen(false)}
              disabled={isCreatingProject}
              className="h-10 px-6 border border-border/50 rounded-md text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Project Modal */}
      <Dialog
        open={isEditProjectModalOpen}
        onOpenChange={setIsEditProjectModalOpen}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>
              Update project details. You'll need to approve a transaction to
              save changes.
            </DialogDescription>
          </DialogHeader>
          <form
            id="edit-project-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingProject) return;
              console.log("[Edit Project Form] Submitting with data:", {
                ...editProjectData,
                coverImageUrlValue: editProjectData.coverImageUrl,
                coverImageUrlType: typeof editProjectData.coverImageUrl,
              });
              updateProject(
                {
                  projectId: editingProject.id,
                  data: {
                    name: editProjectData.name,
                    description: editProjectData.description,
                    status: editProjectData.status,
                    coverImageUrl: editProjectData.coverImageUrl,
                    githubLinks: editProjectData.githubLinks,
                    tags: editProjectData.tags,
                  },
                },
                {
                  onSuccess: () => {
                    setIsEditProjectModalOpen(false);
                    setEditingProject(null);
                  },
                },
              );
            }}
            className="space-y-3 px-6 overflow-y-auto flex-1"
          >
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Project Name *
              </label>
              <Input
                value={editProjectData.name}
                onChange={(e) =>
                  setEditProjectData((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
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
                value={editProjectData.description}
                onChange={(value) =>
                  setEditProjectData((prev) => ({
                    ...prev,
                    description: value,
                  }))
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
                value={editProjectData.coverImageUrl}
                onChange={(e) =>
                  setEditProjectData((prev) => ({
                    ...prev,
                    coverImageUrl: e.target.value,
                  }))
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
                value={editProjectData.status}
                onChange={(e) =>
                  setEditProjectData({
                    ...editProjectData,
                    status: e.target.value as
                      | "active"
                      | "completed"
                      | "archived",
                  })
                }
                className="w-full h-9 px-3 py-1 text-sm bg-background border border-border/50 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                GitHub Links
              </label>
              <div className="space-y-2">
                {editProjectData.githubLinks.map((link, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      type="url"
                      value={link.url}
                      onChange={(e) => {
                        const updated = [...editProjectData.githubLinks];
                        updated[index].url = e.target.value;
                        setEditProjectData((prev) => ({
                          ...prev,
                          githubLinks: updated,
                        }));
                      }}
                      placeholder="https://github.com/user/repo"
                      className="flex-1 h-9"
                    />
                    <Input
                      type="text"
                      value={link.description || ""}
                      onChange={(e) => {
                        const updated = [...editProjectData.githubLinks];
                        updated[index].description = e.target.value;
                        setEditProjectData((prev) => ({
                          ...prev,
                          githubLinks: updated,
                        }));
                      }}
                      placeholder="Description (e.g., Frontend)"
                      className="flex-1 h-9"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const updated = editProjectData.githubLinks.filter(
                          (_, i) => i !== index,
                        );
                        setEditProjectData((prev) => ({
                          ...prev,
                          githubLinks: updated,
                        }));
                      }}
                      className="h-9 px-3"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEditProjectData((prev) => ({
                      ...prev,
                      githubLinks: [
                        ...prev.githubLinks,
                        { url: "", description: "" },
                      ],
                    }))
                  }
                  className="w-full"
                >
                  + Add GitHub Link
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Tags
              </label>
              <div className="space-y-2">
                {editProjectData.tags.map((tag, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      type="text"
                      value={tag.name}
                      onChange={(e) => {
                        const updated = [...editProjectData.tags];
                        updated[index].name = e.target.value;
                        setEditProjectData((prev) => ({
                          ...prev,
                          tags: updated,
                        }));
                      }}
                      placeholder="Tag name (e.g., React)"
                      className="flex-1 h-9"
                    />
                    <Input
                      type="text"
                      value={tag.target || ""}
                      onChange={(e) => {
                        const updated = [...editProjectData.tags];
                        updated[index].target = e.target.value;
                        setEditProjectData((prev) => ({
                          ...prev,
                          tags: updated,
                        }));
                      }}
                      placeholder="Target (e.g., frontend)"
                      className="flex-1 h-9"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const updated = editProjectData.tags.filter(
                          (_, i) => i !== index,
                        );
                        setEditProjectData((prev) => ({
                          ...prev,
                          tags: updated,
                        }));
                      }}
                      className="h-9 px-3"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEditProjectData((prev) => ({
                      ...prev,
                      tags: [...prev.tags, { name: "", target: "" }],
                    }))
                  }
                  className="w-full"
                >
                  + Add Tag
                </Button>
              </div>
            </div>
          </form>

          <div className="flex gap-3 px-6 pb-6 pt-2 border-t border-border/50">
            <button
              type="submit"
              form="edit-project-form"
              disabled={isUpdatingProject || !editProjectData.name.trim()}
              className="flex-1 h-10 px-6 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={(e) => {
                e.preventDefault();
                const form = document.getElementById(
                  "edit-project-form",
                ) as HTMLFormElement;
                if (form) form.requestSubmit();
              }}
            >
              {isUpdatingProject ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => setIsEditProjectModalOpen(false)}
              disabled={isUpdatingProject}
              className="h-10 px-6 border border-border/50 rounded-md text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Tags Edit Content Component
function TagsEditContent({
  initialTags,
  onChange,
}: {
  initialTags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [newTag, setNewTag] = useState("");
  const [editingTags, setEditingTags] = useState(initialTags);

  // Update editing tags when initialTags changes (modal opens)
  useEffect(() => {
    setEditingTags(initialTags);
  }, [initialTags]);

  // Filter out default NEAR tags from display
  const filteredTags = editingTags.filter(
    (tag) => !["NEAR Expert", "Developer", "Community Leader"].includes(tag),
  );

  const handleAddTag = () => {
    if (newTag.trim() && !filteredTags.includes(newTag.trim())) {
      const updated = [...editingTags, newTag.trim()];
      setEditingTags(updated);
      onChange(updated);
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const updated = editingTags.filter((t) => t !== tagToRemove);
    setEditingTags(updated);
    onChange(updated);
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Add or remove skills from your profile. These will be displayed on your
        profile page.
      </p>

      {/* Current Tags */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          Current Skills
        </label>
        <div className="flex flex-wrap gap-2">
          {filteredTags.length > 0 ? (
            filteredTags.map((tag) => (
              <span
                key={tag}
                className="text-sm bg-muted/60 text-foreground px-3 py-1.5 border border-border/50 flex items-center gap-2 rounded-md"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="text-muted-foreground hover:text-destructive text-xs"
                >
                  ✕
                </button>
              </span>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No skills added yet</p>
          )}
        </div>
      </div>

      {/* Add New Tag */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">Add Skill</label>
        <div className="flex gap-2">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="e.g., React, TypeScript, Design..."
            onKeyDown={(e) =>
              e.key === "Enter" && (e.preventDefault(), handleAddTag())
            }
            className="flex-1"
          />
          <Button
            type="button"
            onClick={handleAddTag}
            disabled={!newTag.trim()}
          >
            Add
          </Button>
        </div>
      </div>

      {/* Keyboard hint */}
      <div className="text-xs text-muted-foreground text-center py-2">
        Press{" "}
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-muted-foreground font-mono">
          Enter
        </kbd>{" "}
        to add
      </div>
    </div>
  );
}

function ProfileHeader({
  accountId,
  displayName,
  avatarUrl,
  role,
  isOwnProfile,
  children,
}: {
  accountId: string;
  displayName: string;
  avatarUrl: string;
  role: string;
  isOwnProfile: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 sm:gap-4">
      <Avatar className="size-14 sm:size-16 border-2 border-primary/60">
        <AvatarImage src={avatarUrl} />
        <AvatarFallback className="bg-primary/20 text-primary text-lg sm:text-base font-mono font-bold">
          {displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-1.5 sm:space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-foreground">
              {displayName}
            </h2>
            <p className="font-mono text-primary text-xs sm:text-sm">
              {accountId}
            </p>
          </div>
          {children && <div className="flex-shrink-0">{children}</div>}
        </div>
        <span className="inline-block text-xs bg-primary/25 text-primary px-2.5 py-1 sm:px-3 sm:py-1.5 font-mono font-medium">
          {role}
        </span>
      </div>
    </div>
  );
}

function LegionRankSection({
  rankData,
  holderTypes,
  isLoading,
}: {
  rankData?: RankData;
  holderTypes?: HolderTypesData;
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

  const getContractBadge = (contractId: string, quantity: number) => {
    // Match exact contract IDs
    if (contractId === "ascendant.nearlegion.near") {
      return {
        label: `Ascendant ${quantity > 1 ? `(${quantity})` : ""}`,
        className: "bg-purple-500/20 text-purple-400 border-purple-500/40",
        icon: "🏆",
      };
    }
    if (contractId === "initiate.nearlegion.near") {
      return {
        label: `Initiate ${quantity > 1 ? `(${quantity})` : ""}`,
        className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
        icon: "🌱",
      };
    }
    if (contractId === "nearlegion.nfts.tg") {
      return {
        label: `Legion ${quantity > 1 ? `(${quantity})` : ""}`,
        className: "bg-orange-500/20 text-orange-400 border-orange-500/40",
        icon: "⚔️",
      };
    }
    // Fallback for any other Legion contracts
    if (contractId.includes("nearlegion")) {
      const name =
        contractId.replace(".near", "").replace(".tg", "").split(".").pop() ||
        "Legion";
      return {
        label: `${name.charAt(0).toUpperCase() + name.slice(1)} ${quantity > 1 ? `(${quantity})` : ""}`,
        className: "bg-orange-500/20 text-orange-400 border-orange-500/40",
        icon: "⚔️",
      };
    }
    return null;
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
        NEAR Legion Status
      </h3>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-48" />
        </div>
      ) : !rankData && !holderTypes ? (
        <p className="text-sm text-muted-foreground">
          Unable to load rank data
        </p>
      ) : !rankData?.hasNft &&
        !rankData?.hasInitiate &&
        !holderTypes?.contracts.length ? (
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
        <div className="space-y-3">
          {/* Show rank badge if available (for backward compatibility) */}
          {rankData?.hasNft && rankData.rank && (
            <span
              className={`inline-flex items-center gap-1.5 text-sm px-4 py-2 font-mono font-medium border ${getRankStyles(rankData.rank)}`}
            >
              <span className="text-base">
                {rankData.rank === "legendary" && "🏆"}
                {rankData.rank === "epic" && "💎"}
                {rankData.rank === "rare" && "⭐"}
                {rankData.rank === "common" && "🎖️"}
              </span>
              {rankData.rank.charAt(0).toUpperCase() + rankData.rank.slice(1)}{" "}
              Ascendant
              {rankData.tokenId && (
                <span className="text-xs opacity-60">#{rankData.tokenId}</span>
              )}
            </span>
          )}

          {/* Show all contract types held (NEW) */}
          {holderTypes?.contracts && holderTypes.contracts.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {holderTypes.contracts.map((contract) => {
                const badge = getContractBadge(
                  contract.contractId,
                  contract.quantity,
                );
                if (!badge) {
                  // Unknown contract - show generic badge
                  return (
                    <span
                      key={contract.contractId}
                      className="inline-flex items-center gap-1.5 text-sm px-4 py-2 font-mono font-medium border bg-muted text-muted-foreground border-border"
                    >
                      <span className="text-base">🎴</span>
                      {contract.contractId} ({contract.quantity})
                    </span>
                  );
                }
                return (
                  <span
                    key={contract.contractId}
                    className={`inline-flex items-center gap-1.5 text-sm px-4 py-2 font-mono font-medium border ${badge.className}`}
                  >
                    <span className="text-base">{badge.icon}</span>
                    {badge.label}
                  </span>
                );
              })}
            </div>
          )}

          {/* Debug info: Show if we have data but no contracts matched */}
          {process.env.NODE_ENV === "development" && holderTypes && (
            <div className="text-xs text-muted-foreground font-mono">
              Debug: {holderTypes.contracts.length} contracts, isAscendant:{" "}
              {String(holderTypes.isAscendant)}, isInitiate:{" "}
              {String(holderTypes.isInitiate)}, isNearlegion:{" "}
              {String(holderTypes.isNearlegion)}
            </div>
          )}

          {/* Legacy initiate badge (for backward compatibility with old data) */}
          {rankData?.hasInitiate && !holderTypes?.isInitiate && (
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

function ProfileSkills({
  tags,
  isOwnProfile,
  onEdit,
}: {
  tags: string[];
  isOwnProfile: boolean;
  onEdit?: () => void;
}) {
  // Filter out default NEAR tags
  const filteredTags = tags.filter(
    (tag) => !["NEAR Expert", "Developer", "Community Leader"].includes(tag),
  );

  if (filteredTags.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Skills</h3>
        {isOwnProfile && onEdit && (
          <button
            type="button"
            className="text-xs text-primary hover:text-primary/80 transition-colors"
            onClick={onEdit}
          >
            Edit
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {filteredTags.map((tag) => (
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
      <h3 className="text-lg font-semibold text-foreground">About</h3>
      <Markdown content={description} />
    </div>
  );
}

function ProfileProjects({
  projects,
  isLoadingProjects,
  statusFilter,
  onStatusFilterChange,
  isOwnProfile,
  onDeleteProject,
  onEditProject,
  isCreatingProject,
  onCreateProject,
  accountId,
}: {
  projects: Project[];
  isLoadingProjects: boolean;
  statusFilter: "all" | "active" | "completed" | "archived";
  onStatusFilterChange: (
    filter: "all" | "active" | "completed" | "archived",
  ) => void;
  isOwnProfile?: boolean;
  onDeleteProject?: (projectId: string) => void;
  onEditProject?: (project: Project) => void;
  isCreatingProject?: boolean;
  onCreateProject?: () => void;
  accountId: string;
}) {
  // Filter projects client-side based on status
  const filteredProjects = projects.filter((project) => {
    if (statusFilter === "all") return true;
    return project.status === statusFilter;
  });

  return (
    <div className="space-y-4">
      {/* Header with Status Filter and Create button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-border/50">
        <h3 className="text-xl font-semibold text-foreground">Projects</h3>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="flex overflow-x-auto gap-2 pb-2 sm:pb-0 -mx-4 px-4 sm:mx-0 scrollbar-hide">
            <button
              onClick={() => onStatusFilterChange("all")}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap ${
                statusFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              All
            </button>
            <button
              onClick={() => onStatusFilterChange("active")}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap ${
                statusFilter === "active"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Active
            </button>
            <button
              onClick={() => onStatusFilterChange("completed")}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap ${
                statusFilter === "completed"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Completed
            </button>
            <button
              onClick={() => onStatusFilterChange("archived")}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap ${
                statusFilter === "archived"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Archived
            </button>
          </div>
          {isOwnProfile && (
            <button
              onClick={() => onCreateProject?.()}
              disabled={isCreatingProject}
              className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {isCreatingProject ? "Creating..." : "Create"}
            </button>
          )}
        </div>
      </div>

      {/* Projects List */}
      {isLoadingProjects ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">Loading projects...</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-8 bg-muted/20 rounded-lg border border-border/50">
          <p className="text-sm text-muted-foreground mb-3">
            No projects found
          </p>
          {isOwnProfile && (
            <button
              onClick={() => onCreateProject?.()}
              className="text-primary hover:underline text-xs"
            >
              Create your first project →
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <Link
              key={project.id}
              to="/project/$address/$project"
              params={{
                address: accountId,
                project: project.name,
              }}
              className="group relative bg-card rounded-lg border border-border/50 hover:border-border transition-colors overflow-hidden flex flex-col"
            >
              {/* Cover Image Banner - smaller like GitHub */}
              {project.coverImageUrl ? (
                <div className="aspect-[2/1] w-full overflow-hidden bg-muted/20">
                  <img
                    src={project.coverImageUrl}
                    alt={project.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    onError={(e) => {
                      // Hide image on error
                      (e.currentTarget as HTMLImageElement).style.display =
                        "none";
                    }}
                  />
                </div>
              ) : (
                <div className="aspect-[2/1] w-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                  <span className="text-3xl text-primary/30">📦</span>
                </div>
              )}

              {/* Content */}
              <div className="p-3 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors line-clamp-1">
                    {project.name}
                  </h3>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
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

                {/* Description - trimmed */}
                {project.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2 flex-1">
                    {project.description}
                  </p>
                )}

                {/* Footer with updated date */}
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <p className="text-[10px] text-muted-foreground">
                    Updated {new Date(project.updatedAt).toLocaleDateString()}
                  </p>
                  {/* Action buttons - stop propagation to prevent navigation */}
                  {isOwnProfile && (
                    <div className="flex gap-2">
                      {onEditProject && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onEditProject(project);
                          }}
                          className="text-[10px] text-primary hover:text-primary/80 px-2 py-1 rounded hover:bg-primary/10 transition-colors"
                        >
                          Edit
                        </button>
                      )}
                      {onDeleteProject && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (
                              confirm(
                                "Are you sure you want to delete this project?",
                              )
                            ) {
                              onDeleteProject(project.id);
                            }
                          }}
                          className="text-[10px] text-destructive hover:text-destructive/80 px-2 py-1 rounded hover:bg-destructive/10 transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
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
  isOwnProfile,
  onEdit,
}: {
  socials: Record<string, string>;
  isOwnProfile?: boolean;
  onEdit?: () => void;
}) {
  const linkEntries = Object.entries(socials || {})
    .filter(([_, url]) => url && typeof url === "string")
    .map(([platform, url]) => [platform, url as string]);

  const hasLinks = linkEntries.length > 0;

  if (!hasLinks && !isOwnProfile) return null;

  // Build proper URL based on platform
  const buildUrl = (platform: string, url: string): string => {
    const lowerPlatform = platform.toLowerCase();
    const cleanUrl = url.trim();

    // If already has protocol, return as is
    if (cleanUrl.match(/^https?:\/\//i)) {
      return cleanUrl;
    }

    // Platform-specific URL construction
    if (lowerPlatform.includes("github")) {
      if (!cleanUrl.includes("/") && !cleanUrl.includes(".")) {
        return `https://github.com/${cleanUrl}`;
      }
      return `https://${cleanUrl}`;
    }
    if (lowerPlatform.includes("twitter") || lowerPlatform.includes("x.com")) {
      if (!cleanUrl.includes("/") && !cleanUrl.includes(".")) {
        return `https://twitter.com/${cleanUrl}`;
      }
      return `https://${cleanUrl}`;
    }
    if (lowerPlatform.includes("linkedin")) {
      if (!cleanUrl.includes("linkedin.com/")) {
        return `https://linkedin.com/in/${cleanUrl}`;
      }
      return `https://${cleanUrl}`;
    }
    if (lowerPlatform.includes("telegram")) {
      if (!cleanUrl.includes("t.me/")) {
        return `https://t.me/${cleanUrl}`;
      }
      return `https://${cleanUrl}`;
    }
    if (lowerPlatform.includes("discord")) {
      if (
        !cleanUrl.includes("discord.gg") &&
        !cleanUrl.includes("discord.com")
      ) {
        return `https://discord.gg/${cleanUrl}`;
      }
      return `https://${cleanUrl}`;
    }
    if (lowerPlatform.includes("youtube")) {
      if (
        !cleanUrl.includes("youtube.com/") &&
        !cleanUrl.includes("youtu.be/")
      ) {
        return `https://youtube.com/@${cleanUrl}`;
      }
      return `https://${cleanUrl}`;
    }

    // Default: add https:// if not present
    return `https://${cleanUrl}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Connect</h3>
        {isOwnProfile && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-xs text-primary hover:text-primary/80 font-mono underline underline-offset-4"
          >
            Edit
          </button>
        )}
      </div>
      {hasLinks ? (
        <div className="flex flex-wrap gap-4">
          {linkEntries.map(([platform, url]) => {
            const href = buildUrl(platform, url);

            return (
              <a
                key={platform}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:text-primary/80 transition-colors font-mono underline underline-offset-4"
              >
                {platform}
              </a>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          No social links added yet
        </p>
      )}
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
        `Failed to save: ${error instanceof Error ? error.message : "Unknown error"}`,
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

  return (
    <div className="space-y-8">
      {/* Basic Info */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Basic Info</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Display Name
            </label>
            <Input
              value={formData.displayName || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  displayName: e.target.value,
                }))
              }
              placeholder="Your display name"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Role</label>
            <Input
              value={formData.role || ""}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, role: e.target.value }))
              }
              placeholder="e.g., Developer, Designer"
              className="h-9"
            />
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-b border-border/50" />

      {/* Description */}
      <div className="space-y-2">
        <label className="text-lg font-semibold text-foreground">About</label>
        <MarkdownEditor
          value={formData.description || ""}
          onChange={(value) =>
            setFormData((prev) => ({ ...prev, description: value }))
          }
          placeholder="Tell us about yourself..."
          rows={5}
        />
      </div>

      {/* Skills/Tags */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Skills</h3>
        <div className="flex flex-wrap gap-2">
          {formData.tags
            ?.filter(
              (tag) =>
                !["NEAR Expert", "Developer", "Community Leader"].includes(tag),
            )
            .map((tag) => (
              <span
                key={tag}
                className="text-sm bg-muted/60 text-foreground px-3 py-1.5 border border-border/50 flex items-center gap-2 rounded-md"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="text-muted-foreground hover:text-destructive text-xs"
                >
                  ✕
                </button>
              </span>
            ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="Type a skill and press Enter..."
            onKeyDown={(e) =>
              e.key === "Enter" && (e.preventDefault(), handleAddTag())
            }
            className="h-9"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleAddTag}
            className="h-9"
          >
            Add
          </Button>
        </div>
      </div>

      {/* Divider */}
      <div className="border-b border-border/50" />

      {/* Socials */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Social Links</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Website</label>
            <Input
              value={formData.socials?.website || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  socials: { ...prev.socials, website: e.target.value },
                }))
              }
              placeholder="https://yoursite.com"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
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
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
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
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Telegram</label>
            <Input
              value={formData.socials?.telegram || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  socials: { ...prev.socials, telegram: e.target.value },
                }))
              }
              placeholder="username"
            />
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-b border-border/50" />

      {/* Save/Cancel buttons */}
      <div className="flex gap-3">
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="h-9 px-6"
        >
          {saveMutation.isPending ? "Saving..." : "Save Profile"}
        </Button>
        <Button variant="outline" onClick={onCancel} className="h-9 px-6">
          Cancel
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// SOCIAL LIST COMPONENT (Inline, Social Media Style)
// =============================================================================

interface SocialListProps {
  accountId: string;
  type: "followers" | "following";
}

function SocialList({ accountId, type }: SocialListProps) {
  // Call both hooks unconditionally (React hooks rule)
  const followersData = useLegionFollowers(accountId, 50, 0);
  const followingData = useLegionFollowing(accountId, 50, 0);

  const { data, isLoading, isError } =
    type === "followers" ? followersData : followingData;
  // FastData API returns accounts as string[] (not objects)
  const items = data?.accounts;

  // Fetch profiles for all accounts to get proper names and images
  const accountIds = items || [];
  const { profiles } = useProfiles(accountIds);

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Failed to load {type}. Please try again.
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">No {type} yet</div>
    );
  }

  return (
    <div className="divide-y divide-border/50">
      {items.map((accountId) => {
        const profile = profiles.get(accountId);
        const displayName = profile?.name || accountId.split(".")[0];
        const avatarUrl = profile?.image?.ipfs_cid
          ? `https://ipfs.near.social/ipfs/${profile.image.ipfs_cid}`
          : profile?.image?.url ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${accountId}`;

        return (
          <Link
            key={accountId}
            to={`/profile/${accountId}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors block"
          >
            <Avatar className="size-10">
              <AvatarImage src={avatarUrl} />
              <AvatarFallback className="bg-primary/20 text-primary text-sm font-mono font-bold">
                {displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">
                {displayName}
              </p>
              {profile?.name && (
                <p className="text-sm text-muted-foreground truncate font-mono">
                  {accountId}
                </p>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex-1 border border-primary/30 bg-background h-full overflow-y-auto">
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-start gap-4">
          <Skeleton className="size-16 sm:size-14 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-6 w-24" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>

        {/* Rank Section Skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-48" />
        </div>

        {/* Skills Section Skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>

        {/* About Section Skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>

        {/* Projects Section Skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <div className="space-y-3">
            <div className="p-4 border border-border/50 space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-4 w-full" />
            </div>
            <div className="p-4 border border-border/50 space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        </div>

        {/* Socials Section Skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <div className="flex flex-wrap gap-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>

        {/* Actions Skeleton */}
        <div className="pt-4 border-t border-border/50">
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
    </div>
  );
}
