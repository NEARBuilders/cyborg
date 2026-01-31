/**
 * Type definitions for Cloudflare Worker environment
 */

export interface Env {
  // D1 Database binding
  DB: D1Database;

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

  // Secrets (set via wrangler secret put)
  BETTER_AUTH_SECRET?: string;
  NEAR_AI_API_KEY?: string;
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
