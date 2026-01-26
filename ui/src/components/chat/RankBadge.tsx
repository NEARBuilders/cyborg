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
    displayRank = 'INITIATE';
    badgeColor = 'bg-muted/20 text-muted-foreground/50';
  } else {
    switch (data.rank) {
      case 'legendary':
        displayRank = 'MYTHIC';
        badgeColor = 'bg-yellow-500/10 text-yellow-500/80';
        break;
      case 'epic':
        displayRank = 'PRIME';
        badgeColor = 'bg-purple-500/10 text-purple-400/80';
        break;
      case 'rare':
        displayRank = 'VANGUARD';
        badgeColor = 'bg-blue-500/10 text-blue-400/80';
        break;
      case 'common':
        displayRank = 'ASCENDANT';
        badgeColor = 'bg-primary/10 text-primary/80';
        break;
      default:
        displayRank = 'INITIATE';
        badgeColor = 'bg-muted/20 text-muted-foreground/50';
    }
  }

  return (
    <div
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold font-mono uppercase tracking-wide ${badgeColor}`}
      title="Your NEAR Legion rank"
    >
      <span>🫡</span>
      <span>{displayRank}</span>
    </div>
  );
}
