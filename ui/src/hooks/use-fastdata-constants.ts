// FastData Protocol Configuration
// Two sub-protocols: FastFS (file storage) and KV (key-value)

import type { AppConstants } from "../types/fastdata";

export const Constants: AppConstants = {
  // FastFS Configuration
  CONTRACT_ID: "fastfs.near", // For FastFS file uploads

  // KV Configuration
  KV_CONTRACT_ID: "contextual.near", // For KV social graph operations

  // API Configuration
  API_BASE_URL: import.meta.env.PROD ? "https://fastdata.up.railway.app" : "http://localhost:3001", // KV API server
  EXPLORER_URL: "https://nearblocks.io/txns",
  HUB_ACCOUNT: "root.near",

  // Network Configuration
  NETWORK: {
    networkId: "mainnet",
    nodeUrl: "https://rpc.mainnet.fastnear.com",
  },
};

// Protocol Documentation
//
// FastFS: Binary file storage using Borsh encoding
//   Method: __fastdata_fastfs
//   Args: Borsh-encoded binary data
//   Contract: fastfs.near
//   Use case: Files up to 32MB
//
// KV: Key-value storage using plain JSON
//   Method: __fastdata_kv
//   Args: Plain JSON object (no encoding needed!)
//   Contract: Configurable (e.g., social.near)
//   Use case: Key-value pairs (max 256 keys per transaction)
