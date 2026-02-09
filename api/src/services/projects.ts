import { Context, Layer, Effect } from "every-plugin/effect";
import type { Database as DrizzleDatabase } from "../db";
import * as schema from "../db/schema";
import { eq, like, and, desc } from "drizzle-orm";

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

export interface ProjectKvData {
  projectId: string;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedProjects {
  projects: ProjectData[];
  total: number;
  hasMore: boolean;
}

export interface SocialConfig {
  network: "mainnet" | "testnet";
  rpcUrl?: string;
  fastDataContract?: string;
  fastdataApiUrl?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for projects

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
  private fastdataApiUrl?: string;

  constructor(
    private db: DrizzleDatabase,
    config: SocialConfig
  ) {
    this.fastDataContract = config.fastDataContract || FASTDATA_CONFIG.CONTRACT_ID;
    this.fastdataApiUrl = config.fastdataApiUrl;
  }

  /**
   * Query NEAR RPC for contract state
   */
  private async queryContractState(
    accountId: string,
    prefix: string,
    retries = 3
  ): Promise<Record<string, string | null>> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const rpcUrl = getNextRpcUrl();
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: `projects-${accountId}-${Date.now()}`,
            method: 'query',
            params: {
              request_type: 'view_state',
              finality: 'final',
              account_id: accountId,
              prefix_base64: btoa(prefix),
            },
          }),
        });

        if (!response.ok) {
          console.warn(`[ProjectsService] RPC failed (${attempt + 1}/${retries}): ${response.status}`);
          if (attempt === retries - 1) return {};
          continue;
        }

        const json: unknown = await response.json();
        const rpcResponse = json as { error?: unknown; result?: { values?: Record<string, string | null> } };

        if (rpcResponse.error) {
          console.warn(`[ProjectsService] RPC error (${attempt + 1}/${retries}):`, rpcResponse.error);
          if (attempt === retries - 1) return {};
          continue;
        }

        // Parse the values from base64
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
        console.warn(`[ProjectsService] RPC exception (${attempt + 1}/${retries}):`, error);
        if (attempt === retries - 1) return {};
        continue;
      }
    }

    return {};
  }

  /**
   * Build KV args for creating/updating a project
   */
  private buildProjectKvArgs(data: ProjectData): Record<string, string | null> {
    const args: Record<string, string | null> = {};
    const prefix = `${FASTDATA_CONFIG.KEY_PREFIX}/${data.id}`;

    args[`${prefix}/name`] = data.name;
    if (data.description) {
      args[`${prefix}/description`] = data.description;
    } else {
      args[`${prefix}/description`] = null; // Delete if empty
    }
    args[`${prefix}/status`] = data.status;
    args[`${prefix}/created`] = data.createdAt;
    args[`${prefix}/updated`] = data.updatedAt;

    // Index entry for discoverability
    args[`index/project/${data.id}`] = "";

    return args;
  }

  /**
   * Prepare create project transaction (client-side signing required)
   */
  async prepareCreateProjectTransaction(
    accountId: string,
    data: Omit<ProjectData, "id" | "createdAt" | "updatedAt">
  ): Promise<{ success: boolean; transaction?: any; projectId?: string; error?: string }> {
    try {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      const projectData: ProjectData = {
        id,
        name: data.name,
        description: data.description,
        status: data.status,
        createdAt: now,
        updatedAt: now,
      };

      const args = this.buildProjectKvArgs(projectData);

      return {
        success: true,
        projectId: id,
        transaction: {
          contractId: this.fastDataContract,
          methodName: FASTDATA_CONFIG.METHOD_NAME,
          args,
          gas: "300000000000000",
          deposit: "0",
        },
      };
    } catch (error) {
      console.error("[ProjectsService] Error preparing create project transaction:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Prepare update project transaction (client-side signing required)
   */
  async prepareUpdateProjectTransaction(
    accountId: string,
    data: ProjectData
  ): Promise<{ success: boolean; transaction?: any; error?: string }> {
    try {
      const projectData: ProjectData = {
        ...data,
        updatedAt: new Date().toISOString(),
      };

      const args = this.buildProjectKvArgs(projectData);

      return {
        success: true,
        transaction: {
          contractId: this.fastDataContract,
          methodName: FASTDATA_CONFIG.METHOD_NAME,
          args,
          gas: "300000000000000",
          deposit: "0",
        },
      };
    } catch (error) {
      console.error("[ProjectsService] Error preparing update project transaction:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Prepare delete project transaction (client-side signing required)
   */
  async prepareDeleteProjectTransaction(
    accountId: string,
    projectId: string
  ): Promise<{ success: boolean; transaction?: any; error?: string }> {
    try {
      const prefix = `${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}`;
      const args: Record<string, string | null> = {
        [`${prefix}/name`]: null,
        [`${prefix}/description`]: null,
        [`${prefix}/status`]: null,
        [`${prefix}/created`]: null,
        [`${prefix}/updated`]: null,
        [`index/project/${projectId}`]: null,
      };

      return {
        success: true,
        transaction: {
          contractId: this.fastDataContract,
          methodName: FASTDATA_CONFIG.METHOD_NAME,
          args,
          gas: "300000000000000",
          deposit: "0",
        },
      };
    } catch (error) {
      console.error("[ProjectsService] Error preparing delete project transaction:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Parse project data from contract state
   */
  private parseProjectFromState(projectId: string, state: Record<string, string | null>): ProjectData | null {
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
  async getProject(accountId: string, projectId: string): Promise<ProjectData | null> {
    const cacheKey = `project:${accountId}:${projectId}`;

    try {
      // Try cache first
      const cached = await this.getCached<ProjectData>(cacheKey);
      if (cached) {
        return cached;
      }

      // Query contract state
      const prefix = `${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}`;
      const state = await this.queryContractState(accountId, prefix);

      const project = this.parseProjectFromState(projectId, state);
      if (project) {
        // Cache the result
        await this.setCached(cacheKey, project);
      }

      return project;
    } catch (error) {
      console.error(`[ProjectsService] Error fetching project ${projectId}:`, error);
      return null;
    }
  }

  /**
   * Get all projects for an account
   */
  async getProjects(
    accountId: string,
    status?: "active" | "completed" | "archived"
  ): Promise<ProjectData[]> {
    const cacheKey = `projects:${accountId}${status ? `:${status}` : ""}`;

    try {
      // Try cache first
      const cached = await this.getCached<ProjectData[]>(cacheKey);
      if (cached) {
        return cached;
      }

      // Query contract state for all projects
      const prefix = `${FASTDATA_CONFIG.KEY_PREFIX}/`;
      const state = await this.queryContractState(accountId, prefix);

      // Group keys by project ID
      const projectGroups = new Map<string, Record<string, string | null>>();
      for (const [key, value] of Object.entries(state)) {
        if (!key.startsWith(`${FASTDATA_CONFIG.KEY_PREFIX}/`)) continue;

        const parts = key.split('/');
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
        projects = projects.filter(p => p.status === status);
      }

      // Sort by updated date (newest first)
      projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      // Cache the result
      await this.setCached(cacheKey, projects);

      return projects;
    } catch (error) {
      console.error(`[ProjectsService] Error fetching projects for ${accountId}:`, error);
      return [];
    }
  }

  /**
   * Prepare set project KV transaction (client-side signing required)
   */
  async prepareSetProjectKvTransaction(
    accountId: string,
    projectId: string,
    key: string,
    value: string
  ): Promise<{ success: boolean; transaction?: any; error?: string }> {
    try {
      const kvKey = `${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}/kv/${key}`;

      return {
        success: true,
        transaction: {
          contractId: this.fastDataContract,
          methodName: FASTDATA_CONFIG.METHOD_NAME,
          args: {
            [kvKey]: value,
          },
          gas: "300000000000000",
          deposit: "0",
        },
      };
    } catch (error) {
      console.error("[ProjectsService] Error preparing set KV transaction:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get project KV data
   */
  async getProjectKv(accountId: string, projectId: string, key: string): Promise<ProjectKvData | null> {
    try {
      const prefix = `${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}/kv/${key}`;
      const state = await this.queryContractState(accountId, prefix);

      const value = state[prefix];
      if (value === undefined || value === null) {
        return null;
      }

      return {
        projectId,
        key,
        value,
        createdAt: new Date().toISOString(), // FastData doesn't track KV timestamps
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`[ProjectsService] Error fetching project KV:`, error);
      return null;
    }
  }

  /**
   * List all project KV entries
   */
  async listProjectKv(
    accountId: string,
    projectId: string,
    prefix?: string
  ): Promise<ProjectKvData[]> {
    try {
      const searchPrefix = prefix
        ? `${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}/kv/${prefix}`
        : `${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}/kv/`;

      const state = await this.queryContractState(accountId, searchPrefix);

      const entries: ProjectKvData[] = [];
      for (const [key, value] of Object.entries(state)) {
        if (!key.startsWith(`${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}/kv/`)) continue;

        const kvKey = key.replace(`${FASTDATA_CONFIG.KEY_PREFIX}/${projectId}/kv/`, '');
        if (prefix && !kvKey.startsWith(prefix)) continue;

        entries.push({
          projectId,
          key: kvKey,
          value: value || "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      // Sort by key
      entries.sort((a, b) => a.key.localeCompare(b.key));

      return entries;
    } catch (error) {
      console.error(`[ProjectsService] Error listing project KV:`, error);
      return [];
    }
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private async getCached<T>(key: string): Promise<T | null> {
    try {
      const entry = await this.db.query.kvStore.findFirst({
        where: eq(schema.kvStore.key, key),
      });

      if (!entry) return null;

      // Check TTL
      const age = Date.now() - entry.updatedAt.getTime();
      if (age > CACHE_TTL_MS) {
        await this.db.delete(schema.kvStore).where(eq(schema.kvStore.key, key));
        return null;
      }

      return JSON.parse(entry.value) as T;
    } catch (error) {
      console.error("[ProjectsService] Cache read error:", error);
      return null;
    }
  }

  private async setCached(key: string, value: any): Promise<void> {
    const now = new Date();
    try {
      await this.db
        .insert(schema.kvStore)
        .values({
          key,
          value: JSON.stringify(value),
          nearAccountId: "system", // System cache
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [schema.kvStore.key],
          set: {
            value: JSON.stringify(value),
            updatedAt: now,
          },
        });
    } catch (error) {
      console.error("[ProjectsService] Cache write error:", error);
    }
  }
}

// =============================================================================
// CONTEXT TAG
// =============================================================================

export class ProjectsContext extends Context.Tag("ProjectsService")<
  ProjectsContext,
  ProjectsService | null
>() {}

export const ProjectsLive = (
  db: DrizzleDatabase,
  config: SocialConfig
): Layer.Layer<ProjectsContext, never, never> => {
  const service = new ProjectsService(db, config);
  return Layer.succeed(ProjectsContext, service);
};
