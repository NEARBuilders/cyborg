import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Social } from "near-social-js";
import { toast } from "sonner";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "../../../components/ui/avatar";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../../components/ui/card";
import { usePoke, useProfile } from "../../../integrations/near-social-js";
import { sessionQueryOptions } from "../../../lib/session";

export const Route = createFileRoute("/_layout/profile/$accountId")({
  loader: async ({ params }) => {
    const social = new Social({ network: "mainnet" });
    const profile = await social.getProfile(params.accountId);
    return { profile, accountId: params.accountId };
  },
  head: ({ loaderData }) => {
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
  const { mutate: poke, isPending: isPoking } = usePoke(accountId);

  const currentAccountId = session?.user?.id;
  const isOwnProfile = currentAccountId === accountId;
  const canPoke = !!currentAccountId && !isOwnProfile;

  const handlePoke = () => {
    poke(undefined, {
      onSuccess: () => {
        toast.success(`Poked ${profile?.name || accountId}!`);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to poke");
      },
    });
  };

  const avatarUrl = profile?.image?.ipfs_cid
    ? `https://ipfs.near.social/ipfs/${profile.image.ipfs_cid}`
    : profile?.image?.url;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-4">
        <Avatar className="h-20 w-20">
          {avatarUrl && (
            <AvatarImage src={avatarUrl} alt={profile?.name || accountId} />
          )}
          <AvatarFallback className="text-2xl">
            {(profile?.name || accountId).slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{profile?.name || accountId}</h1>
          <p className="text-sm text-muted-foreground font-mono">{accountId}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {profile?.description && (
          <p className="text-muted-foreground">{profile.description}</p>
        )}

        {profile?.linktree && Object.keys(profile.linktree).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(profile.linktree).map(([key, value]) => (
              <a
                key={key}
                href={
                  key === "twitter"
                    ? `https://twitter.com/${value}`
                    : key === "github"
                      ? `https://github.com/${value}`
                      : String(value)
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground font-mono"
              >
                {key}: {String(value)}
              </a>
            ))}
          </div>
        )}

        {profile?.tags && Object.keys(profile.tags).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.keys(profile.tags).map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 text-xs rounded-full bg-muted text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="pt-4 border-t">
          {canPoke ? (
            <Button onClick={handlePoke} disabled={isPoking} variant="outline">
              {isPoking ? "Poking..." : "👉 Poke"}
            </Button>
          ) : !currentAccountId ? (
            <Link to="/login" search={{ redirect: `/profile/${accountId}` }}>
              <Button variant="outline">Sign in to poke</Button>
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
