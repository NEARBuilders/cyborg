/**
 * Services Index
 *
 * Central export for all services.
 */

export { AgentService, AgentError, createAgentService } from "./agent";
export type { AgentConfig, ChatResponse, StreamEvent } from "./agent";

export { NearService } from "./near";
export type { RankData, NearConfig, RankTier } from "./near";

export { SocialService } from "./social";
export type { FollowerInfo, PaginatedResult } from "./social";

export { LegionGraphService } from "./legion-graph";
export type { FollowerInfo as LegionFollowerInfo, PaginatedResult as LegionPaginatedResult } from "./legion-graph";

export { PaymentKeyService } from "./payment-keys";
export type {
  PaymentKeyConfig,
  PaymentKey,
  BalanceInfo,
  ExecutionParams,
  ExecutionResult,
  PreparedTx,
} from "./payment-keys";
