/**
 * BuilderCard Component for Chat
 * Renders builder data in chat messages with the same styling as the builders page
 */

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Builder } from "@/types/builders";

interface BuilderCardProps {
  builder: Builder;
}

export function BuilderCard({ builder }: BuilderCardProps) {
  return (
    <div className="my-3 border border-primary/30 bg-background rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-3 bg-muted/20 border-b border-border/50 flex items-start gap-3">
        <Avatar className="size-12 border-2 border-primary/60">
          <AvatarImage src={builder.avatar || undefined} />
          <AvatarFallback className="bg-primary/20 text-primary text-xs font-mono font-bold">
            {builder.displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-foreground truncate">
            {builder.displayName}
          </h3>
          <p className="font-mono text-primary text-xs truncate">
            {builder.accountId}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-block text-xs bg-primary/25 text-primary px-2 py-0.5 font-mono font-medium">
              {builder.role}
            </span>
            <a
              href={
                builder.explorerUrl ||
                `https://explorer.oneverse.near.org/accounts/${builder.accountId}?tab=nfts`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:text-primary/80 underline underline-offset-2"
            >
              View NFTs →
            </a>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-3">
        {/* Description */}
        {builder.description && (
          <div className="text-sm text-muted-foreground line-clamp-3">
            {builder.description}
          </div>
        )}

        {/* Skills/Tags */}
        {builder.tags && builder.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {builder.tags.slice(0, 6).map((tag) => (
              <span
                key={tag}
                className="text-xs bg-muted/60 text-foreground px-2 py-1 border border-border/50"
              >
                {tag}
              </span>
            ))}
            {builder.tags.length > 6 && (
              <span className="text-xs text-muted-foreground">
                +{builder.tags.length - 6} more
              </span>
            )}
          </div>
        )}

        {/* Social Links */}
        {builder.socials &&
          (builder.socials.github ||
            builder.socials.twitter ||
            builder.socials.website) && (
            <div className="flex flex-wrap gap-3 text-xs">
              {builder.socials.website && (
                <a
                  href={
                    builder.socials.website.startsWith("http")
                      ? builder.socials.website
                      : `https://${builder.socials.website}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 transition-colors font-mono underline underline-offset-4"
                >
                  Website
                </a>
              )}
              {builder.socials.github && (
                <a
                  href={`https://github.com/${builder.socials.github}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 transition-colors font-mono underline underline-offset-4"
                >
                  GitHub
                </a>
              )}
              {builder.socials.twitter && (
                <a
                  href={`https://twitter.com/${builder.socials.twitter}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 transition-colors font-mono underline underline-offset-4"
                >
                  @{builder.socials.twitter}
                </a>
              )}
            </div>
          )}

        {/* NFT Holdings - show for nearlegion.nfts.tg and ascendant.nearlegion.near */}
        {builder.holdings && builder.holdings.length > 0 && (
          <div className="pt-2 border-t border-border/50">
            <div className="text-xs text-muted-foreground mb-2">NFT Holdings</div>
            <div className="space-y-1.5">
              {builder.holdings.map((holding) => {
                const contractName = holding.contractId
                  .replace('.nearlegion.near', '')
                  .replace('.nfts.tg', '')
                  .replace('near.', '');
                const isNearLegion = holding.contractId === 'nearlegion.nfts.tg';
                const isAscendant = holding.contractId === 'ascendant.nearlegion.near';

                // Only show nearlegion.nfts.tg and ascendant.nearlegion.near
                if (!isNearLegion && !isAscendant) return null;

                return (
                  <div
                    key={holding.contractId}
                    className="flex items-center justify-between text-xs bg-muted/30 px-2 py-1.5 rounded border border-border/50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {contractName}
                      </span>
                      {isAscendant && (
                        <span className="text-orange-500">🔥</span>
                      )}
                      {isNearLegion && (
                        <span className="text-purple-500">💎</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        Qty: {holding.quantity}
                      </span>
                      <a
                        href={`https://explorer.oneverse.near.org/accounts/${builder.accountId}?tab=nfts`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80 transition-colors underline underline-offset-2"
                      >
                        View →
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
