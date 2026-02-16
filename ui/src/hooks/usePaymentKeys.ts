import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

// =============================================================================
// TYPES
// =============================================================================

export interface PaymentKeyBalance {
  initialBalance: string;
  spent: string;
  available: string;
  availableUsd: string;
}

export interface PaymentKey {
  id: string;
  nonce: number;
  isActive: boolean;
  initialBalance: string;
  spent: string;
  available: string;
  availableUsd: string;
  createdAt: string;
  isIncomplete: boolean;
}

export interface PaymentKeysStatus {
  keys: PaymentKey[];
}

export interface CreatePaymentKeyResponse {
  transactions: Array<{
    contractId: string;
    methodName: string;
    args: Record<string, any>;
    gas: string;
    deposit: string;
  }>;
  nonce: number;
  secret: string;
  paymentKey: string;
  instructions: string[];
}

// =============================================================================
// QUERY KEYS
// =============================================================================

export const paymentKeyKeys = {
  all: ["paymentKeys"] as const,
  status: () => [...paymentKeyKeys.all, "status"] as const,
};

// =============================================================================
// API HELPERS
// =============================================================================

async function fetchApi(endpoint: string, options?: RequestInit) {
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  return response.json();
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Get all payment keys for current user
 */
export function usePaymentKeys() {
  return useQuery({
    queryKey: paymentKeyKeys.status(),
    queryFn: async () => {
      return fetchApi("/payment-keys/status") as Promise<PaymentKeysStatus>;
    },
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Create a new payment key
 */
export function useCreatePaymentKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      initialDeposit: string,
    ): Promise<CreatePaymentKeyResponse> => {
      return fetchApi("/payment-keys/create", {
        method: "POST",
        body: JSON.stringify({ initialDeposit }),
      });
    },
    onSuccess: async () => {
      // Don't show success here - the component will handle success after transactions are signed
      // Just invalidate status query
      await queryClient.invalidateQueries({
        queryKey: paymentKeyKeys.status(),
      });
    },
    onError: (error) => {
      console.error("Create payment key error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create payment key",
      );
    },
  });
}

/**
 * Store payment key after user completes setup
 */
export function useStorePaymentKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      nonce: number;
      secret: string;
      initialBalance: string;
    }) => {
      return fetchApi("/payment-keys/store", {
        method: "POST",
        body: JSON.stringify(params),
      });
    },
    onSuccess: async () => {
      toast.success("Payment key stored successfully!");

      // Invalidate status query
      await queryClient.invalidateQueries({
        queryKey: paymentKeyKeys.status(),
      });
    },
    onError: (error) => {
      console.error("Store payment key error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to store payment key",
      );
    },
  });
}

/**
 * Top up payment key balance
 * Returns transaction that needs to be signed by the user
 */
export function useTopUpPaymentKey() {
  return useMutation({
    mutationFn: async (amount: string) => {
      console.log("[useTopUpPaymentKey] Calling API with amount:", amount);
      const result = await fetchApi("/payment-keys/topup", {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      console.log("[useTopUpPaymentKey] API result:", result);

      // Backend returns { transaction: { contractId, methodName, args, gas, deposit } }
      return result;
    },
    onSuccess: async () => {
      toast.info(
        "Please sign the transaction to add funds to your payment key",
      );
    },
    onError: (error) => {
      console.error("Top up payment key error:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to prepare top-up transaction",
      );
    },
  });
}

/**
 * Delete a specific payment key
 */
export function useDeletePaymentKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (keyId: string) => {
      return fetchApi(`/payment-keys/${keyId}`, {
        method: "DELETE",
      });
    },
    onSuccess: async () => {
      toast.success("Payment key deleted");

      // Invalidate status query
      await queryClient.invalidateQueries({
        queryKey: paymentKeyKeys.status(),
      });
    },
    onError: (error) => {
      console.error("Delete payment key error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to delete payment key",
      );
    },
  });
}

/**
 * Deactivate all payment keys (legacy - for backwards compatibility)
 */
export function useDeactivatePaymentKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return fetchApi("/payment-keys/deactivate", {
        method: "DELETE",
      });
    },
    onSuccess: async () => {
      toast.success("All payment keys deactivated");

      // Invalidate status query
      await queryClient.invalidateQueries({
        queryKey: paymentKeyKeys.status(),
      });
    },
    onError: (error) => {
      console.error("Deactivate payment key error:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to deactivate payment keys",
      );
    },
  });
}

/**
 * Import an existing payment key
 */
export function useImportPaymentKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      paymentKey: string;
      initialBalance?: string | number;
    }) => {
      return fetchApi("/payment-keys/import", {
        method: "POST",
        body: JSON.stringify(params),
      });
    },
    onSuccess: async (data) => {
      toast.success(
        data.message ||
          `Payment key imported successfully! Available balance: $${data.paymentKey.availableUsd}`,
      );

      // Invalidate status query
      await queryClient.invalidateQueries({
        queryKey: paymentKeyKeys.status(),
      });
    },
    onError: (error) => {
      console.error("Import payment key error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to import payment key",
      );
    },
  });
}
