/**
 * Type definitions for Cloudflare Worker environment
 */

export interface Env {
  // D1 Database binding
  DB: D1Database;

  // KV namespace for caching
  CACHE: KVNamespace;

  // Assets binding for serving static files
  ASSETS: Fetcher;

  // Environment variables
  NEAR_AI_MODEL: string;
  NEAR_AI_BASE_URL: string;
  NEAR_RPC_URL: string;
  NEAR_LEGION_CONTRACT: string;
  NEAR_INITIATE_CONTRACT: string;
  NEAR_ACCOUNT: string;
  BETTER_AUTH_URL?: string;
  FASTDATA_URL?: string; // Optional FastData API URL (defaults to railway.app if not set)
  OUTLAYER_API_URL?: string; // Optional OutLayer API URL (defaults to https://outlayer.fastnear.com/api if not set)
  PAYMENT_KEY_ENCRYPTION_KEY?: string; // Base64-encoded encryption key for payment key secrets (32 bytes)

  // Secrets (set via wrangler secret put)
  BETTER_AUTH_SECRET?: string;
  NEAR_AI_API_KEY?: string;
  NEAR_BLOCK?: string;
  NEARBLOCKS_API_KEY?: string;
}

/**
 * Scheduled event from Cloudflare Workers Cron Trigger
 */
export interface ScheduledEvent {
  scheduledTime: number;
  cron: string;
}

/**
 * Request context passed to route handlers
 */
export interface RequestContext {
  nearAccountId?: string;
  role?: string;
}

/**
 * Authenticated request context (after auth middleware)
 */
export interface AuthenticatedContext extends RequestContext {
  nearAccountId: string;
}
