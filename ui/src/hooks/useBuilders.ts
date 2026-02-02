/**
 * Hook for fetching Builder data from NEAR NFT collections
 * Uses TanStack Query's useInfiniteQuery for reliable infinite scroll
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import type {
  Builder,
  NearBlocksHolder,
  NearBlocksHoldersResponse,
} from "@/types/builders";
import { useProfiles } from "@/integrations/near-social-js";

// Get API base URL - always use same-origin to avoid CORS issues
function getApiBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

// Configuration constants
const PAGE_SIZE = 25;

// Legion NFT contracts
const ASCENDANT_CONTRACT = "ascendant.nearlegion.near";
const INITIATE_CONTRACT = "initiate.nearlegion.near";
const NEARLEGION_CONTRACT = "nearlegion.nfts.tg";

interface FetchHoldersParams {
  page: number;
  limit: number;
}

/**
 * Fetch all Legion NFT holders in a single API call
 * Returns holders separated by contract type
 */
async function fetchAllLegionHolders({ page, limit }: FetchHoldersParams): Promise<{
  ascendantHolders: string[];
  initiateHolders: string[];
  nearlegionHolders: string[];
  hasMore: boolean;
}> {
  const offset = (page - 1) * limit;
  const response = await fetch(
    `${getApiBaseUrl()}/nfts/ascendant/holders?offset=${offset}&limit=${limit * 3}`
  );

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  const holdersList = data.holders || [];

  // Parse by contract type
  const ascendantHolders: string[] = [];
  const initiateHolders: string[] = [];
  const nearlegionHolders: string[] = [];

  for (const h of holdersList) {
    if (h.contractId === ASCENDANT_CONTRACT) {
      ascendantHolders.push(h.account);
    } else if (h.contractId === INITIATE_CONTRACT) {
      initiateHolders.push(h.account);
    } else if (h.contractId === NEARLEGION_CONTRACT) {
      nearlegionHolders.push(h.account);
    }
  }

  const total = data.total || 0;
  const hasMore = offset + holdersList.length < total;

  return { ascendantHolders, initiateHolders, nearlegionHolders, hasMore };
}

function transformToBuilder(
  accountId: string,
  isAscendant: boolean,
  isInitiate: boolean,
  isNearlegion: boolean,
): Builder {
  const displayName = accountId.split(".")[0];

  // Determine role based on highest tier held
  let role = "Member";
  let tags = ["Community Member"];

  if (isAscendant) {
    role = "Ascendant";
    tags = ["NEAR Expert", "Developer", "Community Leader"];
  } else if (isInitiate) {
    role = "Initiate";
    tags = ["Web3 Enthusiast", "NEAR Builder"];
  } else if (isNearlegion) {
    role = "Legion";
    tags = ["NEAR Builder"];
  }

  const githubHandle = accountId
    .replace(".near", "")
    .replace(/[^a-z0-9]/g, "")
    .toLowerCase();

  return {
    id: accountId,
    accountId,
    displayName,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${accountId}`,
    role,
    tags,
    description: `A passionate builder in the NEAR ecosystem. ${
      isAscendant
        ? "As an Ascendant member of the Legion, I contribute to advanced NEAR protocol development."
        : isInitiate
          ? "Currently on an Initiate journey, learning and contributing to the NEAR ecosystem."
          : isNearlegion
          ? "Holding Legion NFTs and building for the future."
          : "Active participant in the NEAR community."
    }`,
    projects: [
      {
        name: isAscendant ? "NEAR Protocol Core" : "NEAR Learning Path",
        description: isAscendant
          ? "Contributing to the core protocol features and improvements."
          : "Exploring and documenting NEAR protocol capabilities.",
        status: isAscendant ? "Active" : "In Development",
      },
      {
        name: "Community Initiatives",
        description: "Organizing and participating in community events and hackathons.",
        status: "Active",
      },
    ],
    socials: {
      github: githubHandle,
      twitter: githubHandle,
    },
    isLegion: isAscendant,
    isInitiate: isInitiate,
    isNearlegion: isNearlegion,
  };
}

export function useBuilders() {
  const query = useInfiniteQuery({
    queryKey: ["builders"],
    queryFn: async ({ pageParam }) => {
      const page = pageParam as number || 1;

      // Fetch all contract types in one call
      const result = await fetchAllLegionHolders({ page, limit: PAGE_SIZE });

      return {
        ...result,
        page,
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      // Continue if there's more data
      if (lastPage.hasMore) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Collect all unique account IDs for profile fetching
  const allAccountIds = (() => {
    const ids = new Set<string>();
    for (const page of query.data?.pages || []) {
      for (const id of [
        ...page.ascendantHolders,
        ...page.initiateHolders,
        ...page.nearlegionHolders,
      ]) {
        ids.add(id);
      }
    }
    return Array.from(ids);
  })();

  // Fetch profiles for all builders
  const { profiles } = useProfiles(allAccountIds);

  // Merge all pages into a single list of builders with profile data
  const builders = (() => {
    const builderMap = new Map<string, Builder>();

    for (const page of query.data?.pages || []) {
      // Process ascendant holders
      for (const accountId of page.ascendantHolders) {
        const existing = builderMap.get(accountId);
        if (existing) {
          builderMap.set(accountId, {
            ...existing,
            isLegion: true,
          });
        } else {
          builderMap.set(accountId, transformToBuilder(accountId, true, false, false));
        }
      }

      // Process initiate holders
      for (const accountId of page.initiateHolders) {
        const existing = builderMap.get(accountId);
        if (existing) {
          builderMap.set(accountId, {
            ...existing,
            isInitiate: true,
          });
        } else {
          builderMap.set(accountId, transformToBuilder(accountId, false, true, false));
        }
      }

      // Process nearlegion holders
      for (const accountId of page.nearlegionHolders) {
        const existing = builderMap.get(accountId);
        if (existing) {
          builderMap.set(accountId, {
            ...existing,
            isNearlegion: true,
          });
        } else {
          builderMap.set(accountId, transformToBuilder(accountId, false, false, true));
        }
      }
    }

    // Enrich with profile data
    const enrichedBuilders: Builder[] = [];
    for (const builder of builderMap.values()) {
      const profile = profiles.get(builder.accountId);
      if (profile) {
        // Build avatar URL from NEAR Social profile (handle IPFS CID)
        const avatarUrl = profile.image?.ipfs_cid
          ? `https://ipfs.near.social/ipfs/${profile.image.ipfs_cid}`
          : profile.image?.url || builder.avatar;

        // Build background image URL from NEAR Social profile (handle IPFS CID)
        const backgroundUrl = profile.backgroundImage?.ipfs_cid
          ? `https://ipfs.near.social/ipfs/${profile.backgroundImage.ipfs_cid}`
          : profile.backgroundImage?.url || builder.backgroundImage;

        // Merge profile data into builder
        enrichedBuilders.push({
          ...builder,
          displayName: profile.name || builder.displayName,
          avatar: avatarUrl,
          backgroundImage: backgroundUrl,
          description: profile.description || builder.description,
          tags: profile.tags
            ? Object.keys(profile.tags).filter(Boolean)
            : builder.tags,
          socials: {
            github: profile.linktree?.github || builder.socials.github,
            twitter: profile.linktree?.twitter || builder.socials.twitter,
            website: profile.linktree?.website || builder.socials.website,
            telegram: profile.linktree?.telegram || builder.socials.telegram,
          },
          nearSocialProfile: profile,
        });
      } else {
        enrichedBuilders.push(builder);
      }
    }

    return enrichedBuilders;
  })();

  // Calculate total counts (sum of all holders across all pages)
  const totalCounts = (() => {
    let ascendantCount = 0;
    let initiateCount = 0;
    let nearlegionCount = 0;

    for (const page of query.data?.pages || []) {
      ascendantCount += page.ascendantHolders.length;
      initiateCount += page.initiateHolders.length;
      nearlegionCount += page.nearlegionHolders.length;
    }

    return { legion: ascendantCount, initiate: initiateCount, nearlegion: nearlegionCount };
  })();

  const loadMoreError = query.error instanceof Error ? query.error.message : null;

  const clearLoadMoreError = () => {
    // Clear error by refetching
    if (query.error) {
      query.refetch();
    }
  };

  return {
    builders,
    totalCounts,
    isLoading: query.isLoading,
    isLoadingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage,
    error: query.error,
    loadMoreError,
    clearLoadMoreError,
    loadMore: () => query.fetchNextPage(),
    loadedCount: builders.length,
  };
}
