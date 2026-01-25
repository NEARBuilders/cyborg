/**
 * Rank Badge Component
 * Displays user's NEAR Legion NFT rank
 */

import { useQuery } from '@tanstack/react-query';

interface UserRankResponse {
  rank: 'legendary' | 'epic' | 'rare' | 'common' | null;
  tokenId: string | null;
  hasNft: boolean;
  hasInitiate: boolean;
}

async function fetchUserRank(): Promise<UserRankResponse> {
  const response = await fetch('/api/user/rank', {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch rank: ${response.status}`);
  }

  return response.json();
}

export function RankBadge() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['user', 'rank'],
    queryFn: fetchUserRank,
    staleTime: 1000 * 60 * 60, // 1 hour
    retry: 2,
  });

  // Don't show anything while loading or on error
  if (isLoading || error || !data) {
    return null;
  }

  // Don't show badge if user doesn't have the initiate token
  if (!data.hasInitiate) {
    return null;
  }

  // Determine rank to display
  let displayRank: string;
  let badgeColor: string;

  if (!data.hasNft || !data.rank) {
    // User has Initiate but no skillcapes
    displayRank = 'INITIATE';
    badgeColor = 'bg-muted text-muted-foreground';
  } else {
    // User has earned a skillcape
    switch (data.rank) {
      case 'legendary':
        displayRank = 'MYTHIC';
        badgeColor = 'bg-yellow-500 text-yellow-900 dark:bg-yellow-600 dark:text-yellow-50';
        break;
      case 'epic':
        displayRank = 'PRIME';
        badgeColor = 'bg-purple-500 text-purple-900 dark:bg-purple-600 dark:text-purple-50';
        break;
      case 'rare':
        displayRank = 'VANGUARD';
        badgeColor = 'bg-blue-500 text-blue-900 dark:bg-blue-600 dark:text-blue-50';
        break;
      case 'common':
        displayRank = 'ASCENDANT';
        badgeColor = 'bg-green-500 text-green-900 dark:bg-green-600 dark:text-green-50';
        break;
      default:
        displayRank = 'INITIATE';
        badgeColor = 'bg-muted text-muted-foreground';
    }
  }

  return (
    <div
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${badgeColor}`}
      title="Your NEAR Legion rank"
    >
      🫡 {displayRank}
    </div>
  );
}
