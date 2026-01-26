import { useMutation, useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { Social, type Profile } from "near-social-js";
import { useMemo } from "react";
import { authClient } from "../../lib/auth-client";

export const socialKeys = {
  all: ["social"] as const,
  profile: (accountId: string) => [...socialKeys.all, "profile", accountId] as const,
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
  accountId: string,
  options?: Omit<UseQueryOptions<Profile | null>, "queryKey" | "queryFn">
) {
  const social = useSocialInstance();

  return useQuery({
    queryKey: socialKeys.profile(accountId),
    queryFn: () => social.getProfile(accountId),
    enabled: !!accountId,
    ...options,
  });
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
