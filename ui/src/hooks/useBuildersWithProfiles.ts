/**
 * Hook that combines builder data with NEAR Social profiles.
 * Enhances builders with real profile data (avatar, name, description) when available.
 */

import { useMemo } from "react";
import { useBuilders } from "./useBuilders";
import { useProfiles } from "@/integrations/near-social-js";
import type { Builder } from "@/types/builders";

export interface EnhancedBuilder extends Builder {
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
    linktree?: {
      github?: string;
      twitter?: string;
      website?: string;
      telegram?: string;
      [key: string]: string | undefined;
    };
    tags?: Record<string, string>;
  } | null;
}

export function useBuildersWithProfiles() {
  const buildersResult = useBuilders();
  const { builders } = buildersResult;

  // Get all account IDs to fetch profiles for
  const accountIds = useMemo(
    () => builders.map((b) => b.accountId),
    [builders]
  );

  // Fetch NEAR Social profiles for all builders
  const { profiles, isLoading: isLoadingProfiles } = useProfiles(accountIds);

  // Enhance builders with NEAR Social data
  const enhancedBuilders = useMemo<EnhancedBuilder[]>(() => {
    return builders.map((builder) => {
      const profile = profiles.get(builder.accountId);

      if (!profile) {
        return builder;
      }

      // Build avatar URL from NEAR Social profile
      const avatarUrl = profile.image?.ipfs_cid
        ? `https://ipfs.near.social/ipfs/${profile.image.ipfs_cid}`
        : profile.image?.url || null;

      // Build background image URL from NEAR Social profile
      const backgroundUrl = profile.backgroundImage?.ipfs_cid
        ? `https://ipfs.near.social/ipfs/${profile.backgroundImage.ipfs_cid}`
        : profile.backgroundImage?.url || null;

      // Merge NEAR Social data, preferring it when available
      return {
        ...builder,
        // Use NEAR Social display name if available
        displayName: profile.name || builder.displayName,
        // Use NEAR Social avatar if available
        avatar: avatarUrl || builder.avatar,
        // Use NEAR Social background image if available
        backgroundImage: backgroundUrl || builder.backgroundImage,
        // Use NEAR Social description if available
        description: profile.description || builder.description,
        // Merge tags from NEAR Social
        tags: profile.tags
          ? [...new Set([...Object.keys(profile.tags), ...builder.tags])]
          : builder.tags,
        // Merge social links from NEAR Social linktree
        socials: {
          github: profile.linktree?.github || builder.socials.github,
          twitter: profile.linktree?.twitter || builder.socials.twitter,
          website: profile.linktree?.website || builder.socials.website,
          telegram: profile.linktree?.telegram || builder.socials.telegram,
        },
        // Store the raw NEAR Social profile for reference
        nearSocialProfile: profile,
      };
    });
  }, [builders, profiles]);

  return {
    ...buildersResult,
    builders: enhancedBuilders,
    isLoadingProfiles,
  };
}
