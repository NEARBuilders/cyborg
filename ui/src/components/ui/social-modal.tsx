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
      const endpoint = type === "followers"
        ? `/social/followers/${accountId}?limit=${limit}&offset=${page * limit}`
        : `/social/following/${accountId}?limit=${limit}&offset=${page * limit}`;

      return fetchApi(endpoint) as Promise<{
        followers?: Array<{ accountId: string }>;
        following?: Array<{ accountId: string }>;
        total: number;
        pagination: { hasMore: boolean };
      }>;
    },
    enabled: isOpen,
  });

  const items = type === "followers" ? data?.followers : data?.following;
  const total = data?.total || 0;
  const hasMore = data?.pagination?.hasMore || false;

  // Reset page when modal opens/closes
  useEffect(() => {
    if (isOpen) setPage(0);
  }, [isOpen, type, accountId]);

  // Filter items based on search
  const filteredItems = items?.filter((item) =>
    item.accountId.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

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
              {filteredItems.map((item) => (
                <div
                  key={item.accountId}
                  onClick={() => handleAccountClick(item.accountId)}
                  className="flex items-center gap-3 px-6 py-4 hover:bg-muted/50 transition-colors cursor-pointer"
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
                </div>
              ))}
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
