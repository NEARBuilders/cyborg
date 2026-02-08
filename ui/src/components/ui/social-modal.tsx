import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Users, UserCheck } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { Skeleton } from "./skeleton";
import { socialKeys } from "@/hooks/useSocialGraph";
import { fetchApi } from "@/hooks/useSocialGraph";
import { useNavigate } from "@tanstack/react-router";
import { useProfiles } from "@/integrations/near-social-js";

interface SocialModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  type: "followers" | "following";
  title?: string;
}

export function SocialModal({
  isOpen,
  onClose,
  accountId,
  type,
  title,
}: SocialModalProps) {
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const limit = 50;

  const queryKey = type === "followers"
    ? socialKeys.followers(accountId)
    : socialKeys.following(accountId);

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKey.concat(page, limit),
    queryFn: async () => {
      // FastData API format: /social/followers?account_id=xxx&contract_id=contextual.near
      const endpoint = type === "followers"
        ? `/social/followers?account_id=${accountId}&contract_id=contextual.near&limit=${limit}&offset=${page * limit}`
        : `/social/following?account_id=${accountId}&contract_id=contextual.near&limit=${limit}&offset=${page * limit}`;

      return fetchApi(endpoint) as Promise<{
        accounts: string[];
        count: number;
        meta: { has_more: boolean; next_cursor?: string };
      }>;
    },
    enabled: isOpen,
  });

  // FastData API returns accounts as string[] (not objects)
  const items = data?.accounts;
  const total = data?.count || 0;
  const hasMore = data?.meta?.has_more || false;

  // Fetch profiles for all accounts to get proper names and images
  const accountIds = items || [];
  const { profiles } = useProfiles(accountIds);

  // Reset page when modal opens/closes
  useEffect(() => {
    if (isOpen) setPage(0);
  }, [isOpen, type, accountId]);

  // Filter items based on search - search both accountId and profile name
  const filteredItems = items?.filter((accountId) => {
    const profile = profiles.get(accountId);
    const name = profile?.name?.toLowerCase() || "";
    const id = accountId.toLowerCase();
    const query = searchQuery.toLowerCase();
    return id.includes(query) || name.includes(query);
  }) || [];

  // Handle account click
  const handleAccountClick = (targetAccountId: string) => {
    onClose();
    navigate({ to: `/profile/${targetAccountId}` });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-background shadow-2xl w-full max-w-2xl max-h-[90vh] rounded-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            {type === "followers" ? (
              <Users className="size-5 text-muted-foreground" />
            ) : (
              <UserCheck className="size-5 text-muted-foreground" />
            )}
            <h2 className="text-lg font-semibold text-foreground">
              {title || (type === "followers" ? "Followers" : "Following")}
            </h2>
            <span className="text-sm text-muted-foreground">({total})</span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-4 border-b border-border/50">
          <Input
            placeholder="Search accounts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-muted-foreground">
              Failed to load {type}. Please try again.
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {searchQuery ? "No accounts found" : `No ${type} yet`}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filteredItems.map((accountId) => {
                const profile = profiles.get(accountId);
                const displayName = profile?.name || accountId.split(".")[0];
                const avatarUrl = profile?.image?.ipfs_cid
                  ? `https://ipfs.near.social/ipfs/${profile.image.ipfs_cid}`
                  : profile?.image?.url || undefined;

                return (
                  <div
                    key={accountId}
                    onClick={() => handleAccountClick(accountId)}
                    className="flex items-center gap-3 px-6 py-4 hover:bg-muted/50 transition-colors cursor-pointer"
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
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {hasMore && !searchQuery && (
          <div className="px-6 py-4 border-t border-border/50 flex justify-center">
            <Button
              variant="outline"
              onClick={() => setPage((p) => p + 1)}
              disabled={isLoading}
            >
              Load More
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
