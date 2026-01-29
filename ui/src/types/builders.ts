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
  isLoading: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  loadMoreError: string | null;
  hasMore: boolean;
  totalCounts: {
    legion: number;
    initiate: number;
  };
  loadedCount: number;
  loadMore: () => void;
  clearLoadMoreError: () => void;
}

// Types are already exported above
