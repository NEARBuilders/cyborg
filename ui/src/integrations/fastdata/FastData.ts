import { DEFAULT_CONTRACT_ID, DEFAULT_GAS, TIMEOUT_MS } from "./constants";
import type {
  FastDataConfig,
  FastDataTransaction,
  IndexEntry,
  KvBatchResult,
  KvDiffResponse,
  KvEntry,
  SocialTree,
} from "./types";

export class FastData {
  protected config: FastDataConfig;

  constructor(config: FastDataConfig) {
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  protected async fetchJson<T>(path: string, opts?: RequestInit): Promise<T> {
    const url = `${this.config.apiUrl}${path}`;
    const res = await fetch(url, {
      ...opts,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        ...opts?.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`FastData API ${res.status}: ${text || res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  // ---------------------------------------------------------------------------
  // KV Reads
  // ---------------------------------------------------------------------------

  /** GET /v1/kv/get */
  async kvGet(opts: {
    predecessorId: string;
    currentAccountId: string;
    key: string;
    fields?: string;
  }): Promise<KvEntry | null> {
    const params = new URLSearchParams({
      predecessor_id: opts.predecessorId,
      current_account_id: opts.currentAccountId,
      key: opts.key,
    });
    if (opts.fields) params.set("fields", opts.fields);
    return this.fetchJson<KvEntry | null>(`/v1/kv/get?${params}`);
  }

  /** GET /v1/kv/query */
  async kvQuery(opts: {
    predecessorId: string;
    currentAccountId: string;
    keyPrefix?: string;
    limit?: number;
    offset?: number;
    excludeNull?: boolean;
    fields?: string;
    format?: string;
  }): Promise<KvEntry[]> {
    const params = new URLSearchParams({
      predecessor_id: opts.predecessorId,
      current_account_id: opts.currentAccountId,
    });
    if (opts.keyPrefix) params.set("key_prefix", opts.keyPrefix);
    if (opts.limit != null) params.set("limit", String(opts.limit));
    if (opts.offset != null) params.set("offset", String(opts.offset));
    if (opts.excludeNull) params.set("exclude_null", "true");
    if (opts.fields) params.set("fields", opts.fields);
    if (opts.format) params.set("format", opts.format);
    const data = await this.fetchJson<{ entries: KvEntry[] }>(`/v1/kv/query?${params}`);
    return data.entries ?? [];
  }

  /** GET /v1/kv/history */
  async kvHistory(
    predecessorId: string,
    currentAccountId: string,
    key: string,
    opts?: {
      limit?: number;
      order?: "asc" | "desc";
      fromBlock?: number;
      toBlock?: number;
      fields?: string;
    },
  ): Promise<KvEntry[]> {
    const params = new URLSearchParams({
      predecessor_id: predecessorId,
      current_account_id: currentAccountId,
      key,
    });
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.order) params.set("order", opts.order);
    if (opts?.fromBlock != null) params.set("from_block", String(opts.fromBlock));
    if (opts?.toBlock != null) params.set("to_block", String(opts.toBlock));
    if (opts?.fields) params.set("fields", opts.fields);
    const data = await this.fetchJson<{ entries: KvEntry[] }>(`/v1/kv/history?${params}`);
    return data.entries ?? [];
  }

  /** GET /v1/kv/reverse */
  async kvReverse(
    currentAccountId: string,
    key: string,
    opts?: { limit?: number; offset?: number; excludeNull?: boolean; fields?: string },
  ): Promise<KvEntry[]> {
    const params = new URLSearchParams({ current_account_id: currentAccountId, key });
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.offset != null) params.set("offset", String(opts.offset));
    if (opts?.excludeNull) params.set("exclude_null", "true");
    if (opts?.fields) params.set("fields", opts.fields);
    const data = await this.fetchJson<{ entries: KvEntry[] }>(`/v1/kv/reverse?${params}`);
    return data.entries ?? [];
  }

  /** GET /v1/kv/by-key */
  async kvByKey(
    key: string,
    opts?: { currentAccountId?: string; limit?: number; offset?: number; fields?: string },
  ): Promise<KvEntry[]> {
    const params = new URLSearchParams({ key });
    if (opts?.currentAccountId) params.set("current_account_id", opts.currentAccountId);
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.offset != null) params.set("offset", String(opts.offset));
    if (opts?.fields) params.set("fields", opts.fields);
    const data = await this.fetchJson<{ entries: KvEntry[] }>(`/v1/kv/by-key?${params}`);
    return data.entries ?? [];
  }

  /** POST /v1/kv/batch */
  async kvBatch(
    predecessorId: string,
    currentAccountId: string,
    keys: string[],
  ): Promise<KvBatchResult[]> {
    const data = await this.fetchJson<{ results: KvBatchResult[] }>("/v1/kv/batch", {
      method: "POST",
      body: JSON.stringify({
        predecessor_id: predecessorId,
        current_account_id: currentAccountId,
        keys,
      }),
    });
    return data.results ?? [];
  }

  /** GET /v1/kv/accounts */
  async kvAccounts(
    currentAccountId: string,
    key: string,
    opts?: { limit?: number; offset?: number; excludeNull?: boolean },
  ): Promise<string[]> {
    const params = new URLSearchParams({ current_account_id: currentAccountId, key });
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.offset != null) params.set("offset", String(opts.offset));
    if (opts?.excludeNull) params.set("exclude_null", "true");
    const data = await this.fetchJson<{ accounts: string[] }>(`/v1/kv/accounts?${params}`);
    return data.accounts ?? [];
  }

  /** GET /v1/kv/diff */
  async kvDiff(
    predecessorId: string,
    currentAccountId: string,
    key: string,
    blockHeightA: number,
    blockHeightB: number,
    opts?: { fields?: string },
  ): Promise<KvDiffResponse> {
    const params = new URLSearchParams({
      predecessor_id: predecessorId,
      current_account_id: currentAccountId,
      key,
      block_height_a: String(blockHeightA),
      block_height_b: String(blockHeightB),
    });
    if (opts?.fields) params.set("fields", opts.fields);
    return this.fetchJson<KvDiffResponse>(`/v1/kv/diff?${params}`);
  }

  /** GET /v1/kv/timeline */
  async kvTimeline(
    predecessorId: string,
    currentAccountId: string,
    opts?: {
      limit?: number;
      offset?: number;
      order?: "asc" | "desc";
      fromBlock?: number;
      toBlock?: number;
      fields?: string;
    },
  ): Promise<KvEntry[]> {
    const params = new URLSearchParams({
      predecessor_id: predecessorId,
      current_account_id: currentAccountId,
    });
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.offset != null) params.set("offset", String(opts.offset));
    if (opts?.order) params.set("order", opts.order);
    if (opts?.fromBlock != null) params.set("from_block", String(opts.fromBlock));
    if (opts?.toBlock != null) params.set("to_block", String(opts.toBlock));
    if (opts?.fields) params.set("fields", opts.fields);
    const data = await this.fetchJson<{ entries: KvEntry[] }>(`/v1/kv/timeline?${params}`);
    return data.entries ?? [];
  }

  /** GET /v1/kv/health (or /health) */
  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.apiUrl}/health`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Social Reads
  // ---------------------------------------------------------------------------

  /** POST /v1/social/get */
  async socialGet(
    keys: string[],
    opts?: {
      contractId?: string;
      options?: { returnDeleted?: boolean; withBlockHeight?: boolean };
    },
  ): Promise<SocialTree> {
    const body: Record<string, unknown> = { keys };
    if (opts?.contractId) body.contract_id = opts.contractId;
    if (opts?.options) {
      const o: Record<string, boolean> = {};
      if (opts.options.returnDeleted != null) o.return_deleted = opts.options.returnDeleted;
      if (opts.options.withBlockHeight != null) o.with_block_height = opts.options.withBlockHeight;
      body.options = o;
    }
    return this.fetchJson<SocialTree>("/v1/social/get", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /** POST /v1/social/keys */
  async socialKeys(
    keys: string[],
    opts?: {
      contractId?: string;
      options?: { returnType?: string; returnDeleted?: boolean; valuesOnly?: boolean };
    },
  ): Promise<SocialTree> {
    const body: Record<string, unknown> = { keys };
    if (opts?.contractId) body.contract_id = opts.contractId;
    if (opts?.options) {
      const o: Record<string, unknown> = {};
      if (opts.options.returnType != null) o.return_type = opts.options.returnType;
      if (opts.options.returnDeleted != null) o.return_deleted = opts.options.returnDeleted;
      if (opts.options.valuesOnly != null) o.values_only = opts.options.valuesOnly;
      body.options = o;
    }
    return this.fetchJson<SocialTree>("/v1/social/keys", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /** GET /v1/social/index */
  async socialIndex(
    action: string,
    key: string,
    opts?: {
      contractId?: string;
      accountId?: string;
      limit?: number;
      from?: number;
      order?: "asc" | "desc";
    },
  ): Promise<IndexEntry[]> {
    const params = new URLSearchParams({ action, key });
    if (opts?.contractId) params.set("contract_id", opts.contractId);
    if (opts?.accountId) params.set("account_id", opts.accountId);
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.from != null) params.set("from", String(opts.from));
    if (opts?.order) params.set("order", opts.order);
    const data = await this.fetchJson<{ entries: IndexEntry[] }>(`/v1/social/index?${params}`);
    return data.entries ?? [];
  }

  // ---------------------------------------------------------------------------
  // KV Write
  // ---------------------------------------------------------------------------

  /** Returns transaction args — caller signs and submits. */
  buildCommit(kvPairs: Record<string, string | null>, contractId?: string): FastDataTransaction {
    return {
      contractId: contractId ?? this.config.contractId ?? DEFAULT_CONTRACT_ID,
      methodName: "__fastdata_kv",
      args: kvPairs,
      gas: DEFAULT_GAS,
    };
  }
}
