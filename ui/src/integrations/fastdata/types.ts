/** Configuration for FastData client. */
export interface FastDataConfig {
  apiUrl: string;
  contractId?: string;
}

/** Single KV entry from fastkv-server. */
export interface KvEntry {
  predecessor_id: string;
  current_account_id: string;
  key: string;
  value: string | null;
  block_height: number;
  block_timestamp: number;
  receipt_id: string;
  tx_hash: string;
}

/** Response from /v1/kv/query. */
export interface KvQueryResponse {
  entries: KvEntry[];
}

/** Response from /v1/kv/history. */
export interface KvHistoryResponse {
  entries: KvEntry[];
}

/** Response from /v1/kv/diff. */
export interface KvDiffResponse {
  a: KvEntry | null;
  b: KvEntry | null;
}

/** Single result from /v1/kv/batch. */
export interface KvBatchResult {
  key: string;
  found: boolean;
  value: string | null;
  error?: string | null;
}

/** Nested tree from /v1/social/keys and /v1/social/get. */
export type SocialTree = Record<string, Record<string, unknown>>;

/** Single index entry from /v1/social/index. */
export interface IndexEntry {
  accountId: string;
  blockHeight: number;
  value?: unknown;
}

/** Response from /v1/social/index. */
export interface IndexResponse {
  entries: IndexEntry[];
}

/** Response from followers/following endpoints. */
export interface FollowResponse {
  accounts: string[];
  count: number;
}

/** Response from /v1/social/feed/account. */
export interface FeedResponse {
  posts: IndexEntry[];
}

/** User profile shape stored under profile/** keys. */
export interface Profile {
  name?: string;
  image?: { url?: string; ipfs_cid?: string };
  description?: string;
  about?: string;
  linktree?: Record<string, string>;
  tags?: Record<string, string>;
  [key: string]: unknown;
}

/** Input for building profile KV args. */
export interface ProfileInput {
  name?: string;
  image_url?: string;
  about?: string;
  tags?: string[];
  linktree?: Record<string, string>;
}

/** Input for building post KV args. */
export interface PostInput {
  text: string;
  type?: string;
}

/** Input for building comment KV args. */
export interface CommentInput {
  text: string;
  targetAuthor: string;
  targetBlockHeight: string;
}

/** Identifies a social item (post, comment) for actions. */
export interface ActionItem {
  type: string;
  path: string;
  blockHeight: string;
}

/** Options for feed queries. */
export interface FeedOptions {
  limit?: number;
  from?: number;
  order?: "asc" | "desc";
}

/** Transaction args returned by build* methods. */
export interface FastDataTransaction {
  contractId: string;
  methodName: string;
  args: Record<string, string | null>;
  gas: string;
}
