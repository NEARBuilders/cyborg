// FastFS Types
export interface FastfsFileContent {
  mimeType: string;
  content: Uint8Array;
}

export interface SimpleFastfs {
  relativePath: string;
  content: FastfsFileContent | null;
}

export interface PartialFastfs {
  relativePath: string;
  offset: number;
  fullSize: number;
  mimeType: string;
  contentChunk: Uint8Array;
  nonce: number;
}

export type FastfsData = { simple: SimpleFastfs } | { partial: PartialFastfs };

export type FileStatus = "pending" | "uploading" | "success" | "error";

export interface FileToUpload {
  status: FileStatus;
  size: number;
  type: string;
  path: string;
  numParts: number;
  ffs: FastfsData[];
  txIds?: (string | undefined)[];
  uploadedParts?: number;
  url?: string;
}

// Re-export KV types from client SDK
export type { KvEntry as KVEntry, KvQueryResponse as KVQueryResponse } from "../integrations/fastdata/types";

// Social Graph Types
export type TransactionType = "follow" | "unfollow";
export type TransactionStatus = "success" | "processing" | "error";

export interface Transaction {
  type: TransactionType;
  account: string;
  txId: string | null;
  status: TransactionStatus;
  error?: boolean;
}

// Network Configuration
export interface NetworkConfig {
  networkId: string;
  nodeUrl: string;
}

// Constants Configuration
export interface AppConstants {
  CONTRACT_ID: string;
  KV_CONTRACT_ID: string;
  API_BASE_URL: string;
  EXPLORER_URL: string;
  HUB_ACCOUNT: string;
  NETWORK: NetworkConfig;
}
