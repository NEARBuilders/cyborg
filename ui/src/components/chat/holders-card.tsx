/**
 * HoldersCard Component for Chat
 * Simple grid: NFT image + username + profile link
 */

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface Holder {
  accountId: string;
  displayName: string;
  contractId: string;
  quantity: number;
}

interface HoldersData {
  type: "holders";
  contractId: string;
  count: number;
  data: Holder[];
}

interface HoldersCardProps {
  holders: HoldersData;
}

interface HolderWithNfts extends Holder {
  nftImages?: Array<{
    contractId: string;
    tokens: Array<{ tokenId: string; imageUrl: string }>;
  }>;
}

export function HoldersCard({ holders }: HoldersCardProps) {
  const [holdersWithNfts, setHoldersWithNfts] = useState<HolderWithNfts[]>([]);

  useEffect(() => {
    const fetchAllNftImages = async () => {
      const results = await Promise.allSettled(
        holders.data.map(async (holder) => {
          try {
            const res = await fetch(`/api/nfts/images/${holder.accountId}`);
            const data = await res.json();
            return {
              ...holder,
              nftImages: data.images || [],
            };
          } catch (error) {
            return {
              ...holder,
              nftImages: [],
            };
          }
        })
      );

      const holdersData = results.map((result, index) => {
        if (result.status === "fulfilled") {
          return result.value;
        }
        return {
          ...holders.data[index],
          nftImages: [],
        };
      });

      setHoldersWithNfts(holdersData);
    };

    fetchAllNftImages();
  }, [holders.data]);

  // Show loading skeleton
  if (holdersWithNfts.length === 0) {
    return (
      <div className="my-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {[...Array(holders.count)].map((_, i) => (
          <div key={i} className="aspect-square rounded-lg bg-muted/20 border border-border/30 overflow-hidden">
            <Skeleton className="w-full h-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="my-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {holdersWithNfts.map((holder) => {
        // Get the first NFT image from nearlegion.nfts.tg
        const nftImage = holder.nftImages?.find(
          (c) => c.contractId === "nearlegion.nfts.tg" && c.tokens.length > 0
        )?.tokens[0];

        return (
          <a
            key={holder.accountId}
            href={`https://explorer.oneverse.near.org/accounts/${holder.accountId}?tab=nfts`}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative aspect-square rounded-lg bg-muted/20 border border-border/30 hover:border-primary/50 overflow-hidden transition-all"
          >
            {nftImage ? (
              <img
                src={nftImage.imageUrl}
                alt={holder.displayName}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${holder.accountId}`;
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                <span className="text-4xl">
                  {holder.displayName.slice(0, 1).toUpperCase()}
                </span>
              </div>
            )}

            {/* Username overlay */}
            <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
              <p className="text-xs font-medium text-white truncate text-center">
                {holder.displayName}
              </p>
            </div>

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-xs font-medium">View Profile →</span>
            </div>
          </a>
        );
      })}
    </div>
  );
}
