import { useMutation, useQuery, type UseQueryOptions } from "@tanstack/react-query";
import type { Profile } from "near-social-js";
import { useMemo } from "react";

export const socialKeys = {
  all: ["social"] as const,
  profile: (accountId: string) => [...socialKeys.all, "profile", accountId] as const,
  profiles: (accountIds: string[]) => [...socialKeys.all, "profiles", accountIds.join(",")] as const,
};

/**
 * Fetch a single NEAR Social profile via our API (with KV cache)
 */
export function useProfile(
  accountId: string | undefined,
  options?: Omit<UseQueryOptions<Profile | null>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: socialKeys.profile(accountId ?? ""),
    queryFn: async () => {
      const response = await fetch(`/api/profiles/${accountId}`);
      if (!response.ok) {
        return null;
      }
      return response.json() as Promise<Profile | null>;
    },
    enabled: !!accountId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    ...options,
  });
}

/**
 * Fetch multiple NEAR Social profiles via our API (with KV cache)
 * Uses batch endpoint for efficient fetching
 */
export function useProfiles(accountIds: string[]) {
  const uniqueIds = useMemo(() => {
    const seen = new Set<string>();
    return accountIds.filter((id) => {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [accountIds]);

  // Use batch API endpoint for better performance (POST with body)
  const query = useQuery({
    queryKey: socialKeys.profiles(uniqueIds),
    queryFn: async () => {
      if (uniqueIds.length === 0) {
        return {};
      }
      const response = await fetch(`/api/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: uniqueIds.join(",") }),
      });
      if (!response.ok) {
        return {};
      }
      return response.json() as Promise<Record<string, Profile | null>>;
    },
    enabled: uniqueIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  const profiles = useMemo(() => {
    const map = new Map<string, Profile | null>();
    if (query.data) {
      Object.entries(query.data).forEach(([accountId, profile]) => {
        if (profile) {
          map.set(accountId, profile);
        }
      });
    }
    return map;
  }, [query.data]);

  return { profiles, isLoading: query.isLoading, isError: query.isError };
}

/**
 * Keep the usePoke function for near-social-js functionality
 * This is client-side only and doesn't need caching
 */
export function usePoke() {
  return useMutation({
    mutationFn: async () => {
      // This would require a different implementation for server-side
      // For now, this is a placeholder
      throw new Error("Poke functionality requires client-side NEAR integration");
    },
  });
}

/**
 * Update NEAR Social profile (images and background)
 */
export function useUpdateSocialProfile() {
  return useMutation({
    mutationFn: async (data: { image?: string; backgroundImage?: string }) => {
      const response = await fetch("/api/social/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update profile");
      }

      return response.json();
    },
  });
}
