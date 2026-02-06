import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { Social } from "near-social-js";
import { toast } from "sonner";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "../../../components/ui/avatar";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Markdown } from "../../../components/ui/markdown";
import { MarkdownEditor } from "../../../components/ui/markdown-editor";
import { EditModal, ProjectEditModal } from "../../../components/ui/edit-modal";
import { SocialLinksModal } from "../../../components/ui/social-links-modal";
import { Skeleton } from "../../../components/ui/skeleton";
import { Settings, ArrowLeft } from "lucide-react";
import { useProfile, usePoke } from "../../../integrations/near-social-js";
import { useUserRank, useHolderTypes, type RankData, type HolderTypesData } from "../../../hooks";
import { authClient } from "../../../lib/auth-client";
import { sessionQueryOptions } from "../../../lib/session";
import { apiClient } from "../../../utils/orpc";
import { Near } from "near-kit";
import { FollowButton } from "../../../components/ui/follow-button";
import { SocialStats } from "../../../components/ui/social-stats";
import { useFollowers, useFollowing, socialKeys } from "../../../hooks/useSocialGraph";

const PROFILE_KEY = "builder-profile";

interface BuilderProfileData {
  displayName?: string;
  description?: string;
  role?: string;
  tags?: string[];
  projects?: { name: string; description: string; status: string }[];
  socials?: { github?: string; twitter?: string; website?: string; telegram?: string };
}

// Chat state interface (same as in chat-page.tsx)
interface ChatState {
  messages: Array<{ id: string; role: string; content: string; createdAt: string; isStreaming?: boolean }>;
  conversationId: string | null;
  isStreaming: boolean;
}

export const Route = createFileRoute("/_layout/profile/$accountId")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      from: (search.from as string | undefined) ?? undefined,
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
          { name: "twitter:image", content: `${window.location.origin}/og.jpg` },
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
  const chatState = routerState.location.state as unknown as ChatState | undefined;

  const showBackToChat = search.from === 'chat';

  // Log when we receive chat state
  console.log('🟡 ProfilePage - Received state:', {
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
    return id.replace(/\.near$/, '').toLowerCase();
  };

  const isOwnProfile = !!currentAccountId && (
    currentAccountId === accountId ||
    normalizeAccountId(currentAccountId) === normalizeAccountId(accountId)
  );

  const [isEditing, setIsEditing] = useState(false);

  // Local state for edits (overrides KV data)
  const [localProfile, setLocalProfile] = useState<BuilderProfileData | null>(null);

  // Modal states
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [isSocialLinksModalOpen, setIsSocialLinksModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProjectIndex, setEditingProjectIndex] = useState<number | null>(null);
  const [isSavingSocialLinks, setIsSavingSocialLinks] = useState(false);

  // Social tab state (followers/following - social media style)
  const [socialTab, setSocialTab] = useState<"none" | "followers" | "following">("none");
  const [editFormData, setEditFormData] = useState<BuilderProfileData>({
    displayName: "",
    description: "",
    role: "",
    tags: [],
    projects: [],
    socials: {},
  });

  // Pending image URLs (on save)
  const [pendingAvatarUrl, setPendingAvatarUrl] = useState<string>("");
  const [pendingBackgroundUrl, setPendingBackgroundUrl] = useState<string>("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Load user rank from API (shared cache across components)
  const { data: rankData, isLoading: isLoadingRank } = useUserRank(accountId);

  // Load holder types (NEW - shows all NFT contracts held)
  const { data: holderTypes, isLoading: isLoadingHolderTypes } = useHolderTypes(accountId);

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
    (sourceProfile?.description?.trim()) ||
    profile?.description ||
    "A passionate builder in the NEAR ecosystem.";
  const role = sourceProfile?.role || "Builder";
  const tags =
    (sourceProfile?.tags?.length ? sourceProfile.tags : null) ||
    (profile?.tags ? Object.keys(profile.tags) : ["NEAR Builder"]);
  const projects = sourceProfile?.projects || [
    {
      name: "NEAR Project",
      description: "Building on the NEAR ecosystem.",
      status: "Active",
    },
  ];
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

  return (
    <div className="flex-1 border border-primary/30 bg-background h-full overflow-y-auto relative">
      {/* Back to Chat button - top left (when no background) */}
      {showBackToChat && chatState && !backgroundUrl && (
        <div className="absolute top-3 left-3 z-10">
          <Link
            to="/chat"
            state={chatState as any}
            onClick={() => {
              console.log('🔴 ProfilePage - Navigating back to chat with state:', {
                messageCount: chatState?.messages?.length ?? 0,
                conversationId: chatState?.conversationId,
              });
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
                  console.log('🔴 ProfilePage - Navigating back to chat with state:', {
                    messageCount: chatState?.messages?.length ?? 0,
                    conversationId: chatState?.conversationId,
                  });
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

      <div className={`p-4 sm:p-6 space-y-6 ${backgroundUrl ? "-mt-12 relative" : ""}`}>
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
                setEditFormData({ displayName, description, role, tags, projects, socials });
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
          <SocialStats accountId={accountId} />
          {!isOwnProfile && (
            <FollowButton
              accountId={accountId}
              currentUserId={currentAccountId}
            />
          )}
        </div>

        {/* Social Media Style: Followers/Following Tabs */}
        {socialTab !== "none" && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 border-b border-border/50">
              <button
                onClick={() => setSocialTab("followers")}
                className={`px-4 py-2 text-sm font-medium transition-colors relative ${
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
                onClick={() => setSocialTab("following")}
                className={`px-4 py-2 text-sm font-medium transition-colors relative ${
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
                onClick={() => setSocialTab("none")}
                className="ml-auto text-sm text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <SocialList accountId={accountId} type={socialTab} />
          </div>
        )}

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
            <LegionRankSection
              rankData={rankData}
              holderTypes={holderTypes}
              isLoading={isLoadingRank || isLoadingHolderTypes}
            />

            {/* About */}
            <ProfileAbout description={description} />

            {/* Skills/Tags */}
            <ProfileSkills tags={tags} />

            {/* Projects */}
            <ProfileProjects
              projects={projects}
              isOwnProfile={isOwnProfile}
              onEditProject={(index) => {
                setEditingProjectIndex(index);
                setIsProjectModalOpen(true);
              }}
              onAddProject={() => {
                setEditingProjectIndex(null);
                setIsProjectModalOpen(true);
              }}
            />

            {/* Socials */}
            <ProfileSocials socials={socials} isOwnProfile={isOwnProfile} onEdit={() => setIsSocialLinksModalOpen(true)} />

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
                      onClick={() => setSocialTab("followers")}
                      variant="outline"
                      size="sm"
                    >
                      View Followers
                    </Button>
                    <Button
                      onClick={() => setSocialTab("following")}
                      variant="outline"
                      size="sm"
                    >
                      View Following
                    </Button>
                  </>
                )}
                {!currentAccountId && (
                  <Link to="/login" search={{ redirect: `/profile/${accountId}` }}>
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
              .functionCall("social.near", "set", {
                data: {
                  [accountId]: {
                    profile: profileData,
                  },
                },
              }, {
                gas: "300 Tgas",
                attachedDeposit: "0 NEAR",
              })
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

            toast.success("Profile updated on NEAR Social!");
          } catch (error) {
            console.error("Save error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to save profile");
          } finally {
            setIsSavingProfile(false);
          }
        }}
      >
        <div className="space-y-6">
          {/* Image URLs */}
          <div className="space-y-4 pb-6 border-b border-border/50">
            <p className="text-sm text-foreground">
              Add image URLs to your profile. Images will be saved to NEAR Social blockchain.
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Profile Picture URL</label>
                <Input
                  value={pendingAvatarUrl}
                  onChange={(e) => setPendingAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.png"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Background Image URL</label>
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

      {/* Project Edit Modal */}
      <ProjectEditModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        initialProject={
          editingProjectIndex !== null
            ? projects[editingProjectIndex]
            : { name: "", description: "", status: "Active" }
        }
        onSave={(project) => {
          // Update local state with the edited/added project
          const updatedProjects =
            editingProjectIndex !== null
              ? [...projects.slice(0, editingProjectIndex), project, ...projects.slice(editingProjectIndex + 1)]
              : [...projects, project];

          setLocalProfile({
            displayName,
            description,
            role,
            tags,
            projects: updatedProjects,
            socials,
          });

          setIsProjectModalOpen(false);
          toast.success(editingProjectIndex !== null ? "Project updated!" : "Project added!");
        }}
      />

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
              .functionCall("social.near", "set", {
                data: {
                  [accountId]: {
                    profile: {
                      linktree,
                    },
                  },
                },
              }, {
                gas: "300 Tgas",
                attachedDeposit: "0 NEAR",
              })
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
            await queryClient.invalidateQueries({ queryKey: ["social", "profile", accountId] });

            toast.success("Social links updated on NEAR Social!");
          } catch (error) {
            console.error("Save error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to save social links");
          } finally {
            setIsSavingSocialLinks(false);
          }
        }}
      />
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
          {children && (
            <div className="flex-shrink-0">
              {children}
            </div>
          )}
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
    if (contractId.includes("ascendant")) {
      return {
        label: `Ascendant ${quantity > 1 ? `(${quantity})` : ""}`,
        className: "bg-purple-500/20 text-purple-400 border-purple-500/40",
        icon: "🏆",
      };
    }
    if (contractId.includes("initiate")) {
      return {
        label: `Initiate ${quantity > 1 ? `(${quantity})` : ""}`,
        className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
        icon: "🌱",
      };
    }
    if (contractId.includes("nearlegion.nfts")) {
      return {
        label: `Legion ${quantity > 1 ? `(${quantity})` : ""}`,
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
      ) : (!rankData && !holderTypes) ? (
        <p className="text-sm text-muted-foreground">Unable to load rank data</p>
      ) : (!rankData?.hasNft && !rankData?.hasInitiate && !holderTypes?.contracts.length) ? (
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
              {rankData.rank.charAt(0).toUpperCase() + rankData.rank.slice(1)} Ascendant
              {rankData.tokenId && (
                <span className="text-xs opacity-60">#{rankData.tokenId}</span>
              )}
            </span>
          )}

          {/* Show all contract types held (NEW) */}
          {holderTypes?.contracts && holderTypes.contracts.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {holderTypes.contracts.map((contract) => {
                const badge = getContractBadge(contract.contractId, contract.quantity);
                if (!badge) return null;
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
      <Markdown content={description} />
    </div>
  );
}

function ProfileProjects({
  projects,
  isOwnProfile,
  onEditProject,
  onAddProject,
}: {
  projects: { name: string; description: string; status: string }[];
  isOwnProfile?: boolean;
  onEditProject?: (index: number) => void;
  onAddProject?: () => void;
}) {
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
          Building
        </h3>
        {isOwnProfile && onAddProject && (
          <button
            type="button"
            onClick={onAddProject}
            className="text-xs text-primary hover:text-primary/80 font-mono underline underline-offset-4"
          >
            + Add Project
          </button>
        )}
      </div>
      <div className="space-y-3">
        {projects.map((project, index) => {
          const isExpanded = expandedProject === project.name;
          return (
            <div
              key={project.name}
              className="group p-4 border border-border/50 bg-muted/30 space-y-2 cursor-pointer hover:border-primary/30 transition-colors"
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
                  {isOwnProfile && onEditProject && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditProject(index);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-xs text-primary hover:text-primary/80 transition-opacity"
                    >
                      Edit
                    </button>
                  )}
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
  socials: { github?: string; twitter?: string; website?: string; telegram?: string };
  isOwnProfile?: boolean;
  onEdit?: () => void;
}) {
  const hasLinks = socials.github || socials.twitter || socials.website || socials.telegram;

  if (!hasLinks && !isOwnProfile) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
          Connect
        </h3>
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
      ) : (
        <p className="text-sm text-muted-foreground italic">No social links added yet</p>
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
    <div className="space-y-8">
      {/* Basic Info */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-foreground">Basic Info</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Display Name</label>
            <Input
              value={formData.displayName || ""}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, displayName: e.target.value }))
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
        <label className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
          About
        </label>
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
        <h4 className="text-sm font-medium text-foreground">Skills</h4>
        <div className="flex flex-wrap gap-2">
          {formData.tags?.map((tag) => (
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
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
            className="h-9"
          />
          <Button type="button" variant="outline" onClick={handleAddTag} className="h-9">
            Add
          </Button>
        </div>
      </div>

      {/* Divider */}
      <div className="border-b border-border/50" />

      {/* Projects */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-foreground">Projects</h4>
        <div className="space-y-2">
          {formData.projects?.map((project, index) => (
            <div
              key={index}
              className="p-3 border border-border/50 bg-muted/20 space-y-2 rounded-lg"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-foreground font-semibold text-sm">
                  {project.name}
                </span>
                <div className="flex items-center gap-2">
                  <ProjectStatus status={project.status} />
                  <button
                    type="button"
                    onClick={() => handleRemoveProject(index)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {project.description}
              </p>
            </div>
          ))}
        </div>

        {/* Add Project Form */}
        <div className="p-4 border border-dashed border-border/50 space-y-4 rounded-lg bg-muted/10">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Add New Project
          </p>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Project name</label>
            <Input
              value={newProject.name}
              onChange={(e) =>
                setNewProject((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="My awesome project"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Description</label>
            <MarkdownEditor
              value={newProject.description}
              onChange={(value) =>
                setNewProject((prev) => ({ ...prev, description: value }))
              }
              placeholder="What are you building?"
              rows={3}
              minimal
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={newProject.status}
              onChange={(e) =>
                setNewProject((prev) => ({ ...prev, status: e.target.value }))
              }
              className="flex-1 h-9 px-2.5 bg-muted/10 border border-border/40 text-sm font-mono outline-none focus-visible:border-primary/40 rounded-md"
            >
              <option value="Active">Active</option>
              <option value="In Development">In Development</option>
              <option value="Beta">Beta</option>
              <option value="Completed">Completed</option>
            </select>
            <Button type="button" variant="outline" onClick={handleAddProject} className="h-9">
              Add Project
            </Button>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-b border-border/50" />

      {/* Socials */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-foreground">Social Links</h4>
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
  const { data, isLoading, isError } =
    type === "followers"
      ? useFollowers(accountId, 50, 0)
      : useFollowing(accountId, 50, 0);

  const items = type === "followers" ? data?.followers : data?.following;
  const total = data?.total || 0;

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
      <div className="p-8 text-center text-muted-foreground">
        No {type} yet
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/50">
      {items.map((item) => (
        <Link
          key={item.accountId}
          to={`/profile/${item.accountId}`}
          className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors block"
        >
          <Avatar className="size-10">
            <AvatarFallback className="bg-primary/20 text-primary text-sm font-mono font-bold">
              {item.accountId.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground truncate">
              {item.accountId.split(".")[0]}
            </p>
            <p className="text-sm text-muted-foreground truncate font-mono">
              {item.accountId}
            </p>
          </div>
        </Link>
      ))}
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
