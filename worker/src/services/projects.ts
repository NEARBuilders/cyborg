import type { Database } from "../db";
import * as schema from "../db/schema";

// =============================================================================
// TYPES
// =============================================================================

export interface ProjectData {
  id: string;
  name: string;
  description?: string;
  status: "active" | "completed" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface KvEntryData {
  projectId: string;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionData {
  contractId: string;
  methodName: string;
  args: Record<string, unknown>;
  gas: string;
}

export interface SocialConfig {
  network: "mainnet" | "testnet";
  rpcUrl?: string;
  fastDataContract?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const FASTDATA_CONFIG = {
  CONTRACT_ID: "contextual.near",
  METHOD_NAME: "__fastdata_kv",
  KEY_PREFIX: "projects",
} as const;

// Multiple RPC endpoints for round-robin
const RPC_ENDPOINTS = [
  "https://rpc.mainnet.near.org",
  "https://near.lava.build",
  "https://near.blockpi.network/v1/rpc/public",
  "https://near.drpc.org",
] as const;

// =============================================================================
// ROUND-ROBIN RPC
// =============================================================================

let rpcIndex = 0;

function getNextRpcUrl(): string {
  const url = RPC_ENDPOINTS[rpcIndex];
  rpcIndex = (rpcIndex + 1) % RPC_ENDPOINTS.length;
  return url;
}

// =============================================================================
// SERVICE
// =============================================================================

export class ProjectsService {
  private fastDataContract: string;

  constructor(
    private db: Database,
    config: SocialConfig,
  ) {
    this.fastDataContract =
      config.fastDataContract || FASTDATA_CONFIG.CONTRACT_ID;
  }

  /**
   * Query NEAR RPC for contract state
   */
  private async queryContractState(
    accountId: string,
    prefix: string,
    retries = 3,
  ): Promise<Record<string, string | null>> {
    console.log(
      `[ProjectsService] Querying contract state for ${accountId} with prefix ${prefix}`,
    );

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const rpcUrl = getNextRpcUrl();
        console.log(
          `[ProjectsService] Attempt ${attempt + 1}/${retries} using RPC: ${rpcUrl}`,
        );

        const response = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: `projects-${accountId}-${Date.now()}`,
            method: "query",
            params: {
              request_type: "view_state",
              finality: "final",
              account_id: accountId,
              prefix_base64: btoa(prefix),
            },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unknown error");
          console.error(
            `[ProjectsService] RPC failed (${attempt + 1}/${retries}): ${response.status}`,
          );
          console.error(
            `[ProjectsService] Response text: ${errorText.substring(0, 500)}`,
          );
          if (attempt === retries - 1) return {};
          continue;
        }

        // Check content type - might be HTML error page
        const contentType = response.headers.get("content-type");
        if (!contentType?.includes("application/json")) {
          const errorText = await response.text().catch(() => "Unknown error");
          console.error(
            `[ProjectsService] RPC returned non-JSON response: ${contentType}`,
          );
          console.error(
            `[ProjectsService] Response text: ${errorText.substring(0, 500)}`,
          );
          if (attempt === retries - 1) return {};
          continue;
        }

        const json: unknown = await response.json();
        const rpcResponse = json as {
          error?: unknown;
          result?: { values?: Record<string, string | null> };
        };

        if (rpcResponse.error) {
          console.error(
            `[ProjectsService] RPC error (${attempt + 1}/${retries}):`,
            rpcResponse.error,
          );
          if (attempt === retries - 1) return {};
          continue;
        }

        // Parse values from base64
        const result: Record<string, string | null> = {};
        const data = rpcResponse.result;
        if (data && data.values) {
          for (const [key, value] of Object.entries(data.values)) {
            // Decode base64 key
            const decodedKey = atob(key);
            // Decode base64 value if it exists
            const decodedValue = value ? atob(value as string) : null;
            result[decodedKey] = decodedValue;
          }
        }

        return result;
      } catch (error) {
        console.warn(
          `[ProjectsService] RPC exception (${attempt + 1}/${retries}):`,
          error,
        );
        if (attempt === retries - 1) return {};
        continue;
      }
    }

    return {};
  }

  /**
   * Parse project data from contract state
   */
  private parseProjectFromState(
    projectId: string,
    state: Record<string, string | null>,
  ): ProjectData | null {
    const prefix = `${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}`;

    const name = state[`${prefix}/name`];
    const description = state[`${prefix}/description`];
    const status = state[`${prefix}/status`];
    const createdAt = state[`${prefix}/created`];
    const updatedAt = state[`${prefix}/updated`];

    if (!name || !status || !createdAt || !updatedAt) {
      return null;
    }

    return {
      id: projectId,
      name,
      description: description || undefined,
      status: status as "active" | "completed" | "archived",
      createdAt,
      updatedAt,
    };
  }

  /**
   * Get a single project from blockchain
   */
  async getProject(
    accountId: string,
    projectId: string,
  ): Promise<ProjectData | null> {
    try {
      // Query contract state
      const prefix = `${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}`;
      const state = await this.queryContractState(accountId, prefix);

      const project = this.parseProjectFromState(projectId, state);
      return project;
    } catch (error) {
      console.error(
        `[ProjectsService] Error fetching project ${projectId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Get all projects for an account
   */
  async getProjects(
    accountId: string,
    status?: "active" | "completed" | "archived",
  ): Promise<ProjectData[]> {
    try {
      // Query contract state for all projects
      const prefix = `${FASTDATA_CONFIG.KEY_PREFIX}/`;
      const state = await this.queryContractState(accountId, prefix);

      // Group keys by project ID
      const projectGroups = new Map<string, Record<string, string | null>>();
      for (const [key, value] of Object.entries(state)) {
        if (!key.startsWith(`${FASTDATA_CONFIG.KEY_PREFIX}/`)) continue;

        const parts = key.split("/");
        if (parts.length < 3) continue;

        const projectId = parts[1];
        if (!projectGroups.has(projectId)) {
          projectGroups.set(projectId, {});
        }
        projectGroups.get(projectId)![key] = value;
      }

      // Parse projects
      let projects: ProjectData[] = [];
      for (const [projectId, keys] of projectGroups.entries()) {
        const project = this.parseProjectFromState(projectId, keys);
        if (project) {
          projects.push(project);
        }
      }

      // Filter by status if specified
      if (status) {
        projects = projects.filter((p) => p.status === status);
      }

      // Sort by updated date (newest first)
      projects.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      return projects;
    } catch (error) {
      console.error(
        `[ProjectsService] Error fetching projects for ${accountId}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Get KV entries for a project
   */
  async getKvEntries(
    accountId: string,
    projectId: string,
    limit: number,
  ): Promise<KvEntryData[]> {
    try {
      const prefix = `${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}/kv/`;
      const state = await this.queryContractState(accountId, prefix);

      const entries: KvEntryData[] = [];
      for (const [key, value] of Object.entries(state)) {
        if (!key.startsWith(`${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}/kv/`))
          continue;

        const parts = key.split("/");
        if (parts.length < 4) continue;

        const kvKey = parts.slice(3).join("/");

        // Use the actual value from KV store, and set created/updated to now
        const now = new Date().toISOString();

        if (value !== null && value !== undefined) {
          entries.push({
            projectId,
            key: kvKey,
            value: value,
            createdAt: now,
            updatedAt: now,
          });
        }

        if (entries.length >= limit) break;
      }

      return entries;
    } catch (error) {
      console.error(
        `[ProjectsService] Error fetching KV entries for ${projectId}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Prepare transaction for creating a project
   */
  async prepareCreateTransaction(
    accountId: string,
    projectId: string,
    name: string,
    description: string,
    status: "active" | "completed" | "archived",
  ): Promise<TransactionData | null> {
    const now = new Date().toISOString();

    return {
      contractId: this.fastDataContract,
      methodName: FASTDATA_CONFIG.METHOD_NAME,
      args: {
        account_id: accountId,
        data: [
          {
            key: `${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}/name`,
            value: name,
          },
          {
            key: `${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}/description`,
            value: description,
          },
          {
            key: `${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}/status`,
            value: status,
          },
          {
            key: `${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}/created`,
            value: now,
          },
          {
            key: `${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}/updated`,
            value: now,
          },
        ],
      },
      gas: "300000000000000",
    };
  }

  /**
   * Prepare transaction for updating a project
   */
  async prepareUpdateTransaction(
    accountId: string,
    projectId: string,
    name?: string,
    description?: string,
    status?: "active" | "completed" | "archived",
  ): Promise<TransactionData | null> {
    const now = new Date().toISOString();
    const data: Array<{ key: string; value: string }> = [
      { key: `${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}/updated`, value: now },
    ];

    if (name !== undefined) {
      data.push({
        key: `${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}/name`,
        value: name,
      });
    }
    if (description !== undefined) {
      data.push({
        key: `${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}/description`,
        value: description,
      });
    }
    if (status !== undefined) {
      data.push({
        key: `${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}/status`,
        value: status,
      });
    }

    return {
      contractId: this.fastDataContract,
      methodName: FASTDATA_CONFIG.METHOD_NAME,
      args: {
        account_id: accountId,
        data,
      },
      gas: "300000000000000",
    };
  }

  /**
   * Prepare transaction for deleting a project
   */
  async prepareDeleteTransaction(
    accountId: string,
    projectId: string,
  ): Promise<TransactionData | null> {
    return {
      contractId: this.fastDataContract,
      methodName: FASTDATA_CONFIG.METHOD_NAME,
      args: {
        account_id: accountId,
        data: [
          { key: `${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}/name`, value: "" },
          {
            key: `${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}/description`,
            value: "",
          },
          {
            key: `${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}/status`,
            value: "archived",
          },
        ],
      },
      gas: "300000000000000",
    };
  }
}
