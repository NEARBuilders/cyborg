/**
 * Types for Builder data from NEAR NFT collections
 */

export interface Project {
  name: string;
  slug?: string;
  description: string;
  longDescription?: string;
  status: string;
  url?: string;
  github?: string;
  technologies?: string[];
  image?: string;
}

export interface Builder {
  id: string;
  accountId: string;
  displayName: string;
  avatar: string | null;
  backgroundImage?: string | null;
  role: string;
  tags: string[];
  description: string;
  projects: Project[];
  socials: {
    github?: string;
    twitter?: string;
    website?: string;
    telegram?: string;
  };
  isLegion?: boolean;
  isInitiate?: boolean;
  isNearlegion?: boolean; // NEW: holds nearlegion.nfts.tg
  nearSocialProfile?: {
    name?: string;
    description?: string;
    image?: {
      ipfs_cid?: string;
      url?: string;
    };
    backgroundImage?: {
      ipfs_cid?: string;
      url?: string;
    };
    linktree?: Record<string, string>;
    tags?: Record<string, string>;
  } | null;
  hasCustomProfile?: boolean; // true if they have a custom NEAR Social avatar, false if using default dicebear
  hasNearSocialProfile?: boolean; // true if they have ANY profile data on NEAR Social, even without custom avatar
}

export interface NearBlocksHolder {
  account: string;
  count: string;
  last_update_timestamp: string;
}

export interface NearBlocksHoldersResponse {
  holders: NearBlocksHolder[];
}

export interface NearBlocksCountResponse {
  holders: Array<{ count: string }>;
}

export interface UseBuildersResult {
  builders: Builder[];
  totalCounts: {
    legion: number;
    initiate: number;
  };
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: Error | null;
  loadMore: () => void;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  loadedCount: number;
}

// Types are already exported above
