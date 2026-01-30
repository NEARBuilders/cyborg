import { useMutation, useQuery, useQueries, type UseQueryOptions } from "@tanstack/react-query";
import { Social, type Profile } from "near-social-js";
import { useMemo } from "react";
import { authClient } from "../../lib/auth-client";

export const socialKeys = {
  all: ["social"] as const,
  profile: (accountId: string) => [...socialKeys.all, "profile", accountId] as const,
  profiles: (accountIds: string[]) => [...socialKeys.all, "profiles", accountIds.join(",")] as const,
};

export function useSocialInstance() {
  const near = authClient.near.getNearClient();
  return useMemo(
    () =>
      near
        ? new Social({ near: near as any, network: "mainnet" })
        : new Social({ network: "mainnet" }),
    [near]
  );
}

export function useProfile(
  accountId: string | undefined,
  options?: Omit<UseQueryOptions<Profile | null>, "queryKey" | "queryFn">
) {
  const social = useSocialInstance();

  return useQuery({
    queryKey: socialKeys.profile(accountId ?? ""),
    queryFn: () => social.getProfile(accountId!),
    enabled: !!accountId,
    ...options,
  });
}

/**
 * Fetch multiple NEAR Social profiles with proper caching.
 * Each profile is cached individually for optimal cache reuse.
 */
export function useProfiles(accountIds: string[]) {
  const social = useSocialInstance();

  const queries = useQueries({
    queries: accountIds.map((accountId) => ({
      queryKey: socialKeys.profile(accountId),
      queryFn: () => social.getProfile(accountId),
      enabled: !!accountId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes (was cacheTime)
    })),
  });

  const profiles = useMemo(() => {
    const map = new Map<string, Profile | null>();
    accountIds.forEach((accountId, index) => {
      const query = queries[index];
      if (query?.data) {
        map.set(accountId, query.data);
      }
    });
    return map;
  }, [accountIds, queries]);

  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);

  return { profiles, isLoading, isError, queries };
}

export function usePoke(targetAccountId: string) {
  const social = useSocialInstance();

  return useMutation({
    mutationFn: async () => {
      const accountId = authClient.near.getAccountId();
      if (!accountId) {
        throw new Error("Wallet not connected");
      }
      const txBuilder = await social.poke(accountId, targetAccountId);
      return txBuilder.send();
    },
  });
}
