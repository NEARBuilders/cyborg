import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

// =============================================================================
// TYPES
// =============================================================================

export interface Project {
  id: string;
  nearAccountId: string;
  name: string;
  description: string | null;
  status: "active" | "completed" | "archived";
  coverImageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  transaction?: any;
}

export interface ProjectsResponse {
  projects: Project[];
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface ProjectKvData {
  projectId: string;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  transaction?: any;
}

// =============================================================================
// API HELPERS (Direct HTTP calls, NOT oRPC)
// =============================================================================

async function fetchApi(
  endpoint: string,
  options?: RequestInit,
): Promise<Response> {
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  console.log(`[fetchApi] ${endpoint} - Status: ${response.status}`);

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Request failed" }));
    console.error(`[fetchApi] Error:`, error);
    throw new Error(error.error || "Request failed");
  }

  // Log response for debugging
  const clone = response.clone();
  clone
    .json()
    .then((data) => console.log(`[fetchApi] Response:`, data))
    .catch(() => {});

  return response;
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Get projects list for current user
 */
export function useProjects(
  status?: "active" | "completed" | "archived",
  limit = 50,
  offset = 0,
  accountId?: string | undefined,
) {
  // Get accountId from better-near-auth (same source as profile page)
  const nearState = authClient.useNearState();
  const effectiveAccountId = accountId || nearState?.accountId;

  return useQuery({
    queryKey: ["projects", status, limit, offset, effectiveAccountId],
    queryFn: async () => {
      if (!effectiveAccountId) {
        throw new Error("No account ID found - please login");
      }

      const params = new URLSearchParams();
      if (status) params.set("status", status);
      params.set("account_id", effectiveAccountId);
      params.set("limit", String(limit));
      params.set("offset", String(offset));

      console.log(
        `[useProjects] Fetching projects for accountId: ${effectiveAccountId}`,
      );
      const response = await fetchApi(`/projects?${params}`);
      return (await response.json()) as ProjectsResponse;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - prevent refetches while navigating
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    enabled: !!effectiveAccountId,
  });
}

/**
 * Get a single project
 */
export function useProject(projectId: string) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const response = await fetchApi(`/projects/${projectId}`);
      return (await response.json()) as Project;
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Create project mutation (with wallet signing)
 */
export function useCreateProject() {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      status?: "active" | "completed" | "archived";
    }) => {
      // Get transaction from API
      const result = await fetchApi("/projects/create", {
        method: "POST",
        body: JSON.stringify(data),
      });

      if (!result.ok) {
        const error = await result.json();
        throw new Error(error.error || "Failed to create project");
      }

      const projectData = (await result.json()) as Project;

      if (!projectData.transaction) {
        throw new Error("No transaction returned");
      }

      // Sign transaction with wallet (client-side)
      const nearAuth = authClient.near;
      if (!nearAuth) {
        throw new Error("NEAR wallet not connected");
      }

      const walletAccountId = nearAuth.getAccountId();
      if (!walletAccountId) {
        throw new Error("No wallet connected");
      }

      const near = nearAuth.getNearClient();

      // Sign and send transaction
      // Note: .functionCall handles JSON serialization automatically
      const tx = await near
        .transaction(walletAccountId)
        .functionCall(
          projectData.transaction.contractId,
          projectData.transaction.methodName,
          projectData.transaction.args,
          {
            gas: projectData.transaction.gas,
            attachedDeposit: "0.01 NEAR", // Deposit for FastData storage
          },
        )
        .send();

      return { projectId: projectData.id, txHash: tx.transaction.hash };
    },
    onSuccess: async (data) => {
      toast.success("Project created successfully!");
      // Invalidate queries after indexer delay
      setTimeout(async () => {
        await queryClient.invalidateQueries({ queryKey: ["projects"] });
      }, 2000);
    },
    onError: (error) => {
      console.error("Create project error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create project",
      );
    },
  });

  return {
    create: createMutation.mutate,
    isPending: createMutation.isPending,
  };
}

/**
 * Update project mutation (with wallet signing)
 */
export function useUpdateProject() {
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: async ({
      projectId,
      data,
    }: {
      projectId: string;
      data: {
        name?: string;
        description?: string;
        status?: "active" | "completed" | "archived";
      };
    }) => {
      // Get transaction from API
      const result = await fetchApi(`/projects/${projectId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });

      if (!result.ok) {
        const error = await result.json();
        throw new Error(error.error || "Failed to update project");
      }

      const projectData = (await result.json()) as Project;

      if (!projectData.transaction) {
        throw new Error("No transaction returned");
      }

      // Sign transaction with wallet (client-side)
      const nearAuth = authClient.near;
      if (!nearAuth) {
        throw new Error("NEAR wallet not connected");
      }

      const walletAccountId = nearAuth.getAccountId();
      if (!walletAccountId) {
        throw new Error("No wallet connected");
      }

      const near = nearAuth.getNearClient();

      // Sign and send transaction
      const tx = await near
        .transaction(walletAccountId)
        .functionCall(
          projectData.transaction.contractId,
          projectData.transaction.methodName,
          projectData.transaction.args,
          {
            gas: projectData.transaction.gas,
            attachedDeposit: "0.01 NEAR", // Deposit for FastData storage
          },
        )
        .send();

      return { txHash: tx.transaction.hash };
    },
    onSuccess: async (data, variables) => {
      toast.success("Project updated successfully!");
      // Invalidate queries after indexer delay
      setTimeout(async () => {
        await queryClient.invalidateQueries({ queryKey: ["projects"] });
        await queryClient.invalidateQueries({
          queryKey: ["project", variables.projectId],
        });
      }, 2000);
    },
    onError: (error) => {
      console.error("Update project error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to update project",
      );
    },
  });

  return {
    update: updateMutation.mutate,
    isPending: updateMutation.isPending,
  };
}

/**
 * Delete project mutation (with wallet signing)
 */
export function useDeleteProject() {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (projectId: string) => {
      // Get transaction from API
      const result = await fetchApi(`/projects/${projectId}`, {
        method: "DELETE",
      });

      if (!result.ok) {
        const error = await result.json();
        throw new Error(error.error || "Failed to delete project");
      }

      const data = await result.json();

      if (!data.transaction) {
        throw new Error("No transaction returned");
      }

      // Sign transaction with wallet (client-side)
      const nearAuth = authClient.near;
      if (!nearAuth) {
        throw new Error("NEAR wallet not connected");
      }

      const walletAccountId = nearAuth.getAccountId();
      if (!walletAccountId) {
        throw new Error("No wallet connected");
      }

      const near = nearAuth.getNearClient();

      // Sign and send transaction
      const tx = await near
        .transaction(walletAccountId)
        .functionCall(
          data.transaction.contractId,
          data.transaction.methodName,
          data.transaction.args,
          {
            gas: data.transaction.gas,
            attachedDeposit: "0.01 NEAR", // Deposit for FastData storage
          },
        )
        .send();

      return { txHash: tx.transaction.hash };
    },
    onSuccess: async () => {
      toast.success("Project deleted successfully!");
      // Invalidate queries after indexer delay
      setTimeout(async () => {
        await queryClient.invalidateQueries({ queryKey: ["projects"] });
      }, 2000);
    },
    onError: (error) => {
      console.error("Delete project error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to delete project",
      );
    },
  });

  return {
    delete: deleteMutation.mutate,
    isPending: deleteMutation.isPending,
  };
}

/**
 * Get project KV entries
 */
export function useProjectKv(projectId: string, limit = 50) {
  return useQuery({
    queryKey: ["project-kv", projectId, limit],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(limit),
      });
      const response = await fetchApi(`/projects/${projectId}/kv?${params}`);
      return (await response.json()) as { entries: ProjectKvData[] };
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
