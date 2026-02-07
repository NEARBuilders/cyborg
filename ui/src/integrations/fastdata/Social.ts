import {
  buildCommentArgs,
  buildFollowArgs,
  buildLikeArgs,
  buildPostArgs,
  buildProfileArgs,
  buildRepostArgs,
  buildUnfollowArgs,
  buildUnlikeArgs,
} from "./builders";
import { DEFAULT_CONTRACT_ID } from "./constants";
import { FastData } from "./FastData";
import type {
  ActionItem,
  CommentInput,
  FastDataTransaction,
  FeedOptions,
  FeedResponse,
  FollowResponse,
  IndexEntry,
  PostInput,
  Profile,
  ProfileInput,
} from "./types";

export class Social extends FastData {
  private get cid(): string {
    return this.config.contractId ?? DEFAULT_CONTRACT_ID;
  }

  // ---------------------------------------------------------------------------
  // Profile
  // ---------------------------------------------------------------------------

  /** GET /v1/social/profile */
  async getProfile(accountId: string, contractId?: string): Promise<Profile | null> {
    const params = new URLSearchParams({ account_id: accountId });
    if (contractId) params.set("contract_id", contractId);
    else if (this.cid) params.set("contract_id", this.cid);
    return this.fetchJson<Profile | null>(`/v1/social/profile?${params}`);
  }

  /** Build transaction args for setting a profile. */
  buildSetProfile(
    signerId: string,
    profile: ProfileInput,
    contractId?: string,
  ): FastDataTransaction {
    return this.buildCommit(buildProfileArgs(signerId, profile), contractId ?? this.cid);
  }

  // ---------------------------------------------------------------------------
  // Posts
  // ---------------------------------------------------------------------------

  /** Build transaction args for creating a post. */
  buildCreatePost(signerId: string, post: PostInput, contractId?: string): FastDataTransaction {
    return this.buildCommit(buildPostArgs(signerId, post), contractId ?? this.cid);
  }

  // ---------------------------------------------------------------------------
  // Comments
  // ---------------------------------------------------------------------------

  /** Build transaction args for creating a comment. */
  buildCreateComment(
    signerId: string,
    comment: CommentInput,
    contractId?: string,
  ): FastDataTransaction {
    return this.buildCommit(buildCommentArgs(signerId, comment), contractId ?? this.cid);
  }

  // ---------------------------------------------------------------------------
  // Social Graph
  // ---------------------------------------------------------------------------

  /** GET /v1/social/followers */
  async getFollowers(
    accountId: string,
    opts?: { limit?: number; offset?: number; contractId?: string },
  ): Promise<FollowResponse> {
    const params = new URLSearchParams({ account_id: accountId });
    const cid = opts?.contractId ?? this.cid;
    if (cid) params.set("contract_id", cid);
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.offset != null) params.set("offset", String(opts.offset));
    return this.fetchJson<FollowResponse>(`/v1/social/followers?${params}`);
  }

  /** GET /v1/social/following */
  async getFollowing(
    accountId: string,
    opts?: { limit?: number; offset?: number; contractId?: string },
  ): Promise<FollowResponse> {
    const params = new URLSearchParams({ account_id: accountId });
    const cid = opts?.contractId ?? this.cid;
    if (cid) params.set("contract_id", cid);
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.offset != null) params.set("offset", String(opts.offset));
    return this.fetchJson<FollowResponse>(`/v1/social/following?${params}`);
  }

  /** Build transaction args for following an account. */
  buildFollow(signerId: string, targetAccountId: string, contractId?: string): FastDataTransaction {
    return this.buildCommit(buildFollowArgs(signerId, targetAccountId), contractId ?? this.cid);
  }

  /** Build transaction args for unfollowing an account. */
  buildUnfollow(
    signerId: string,
    targetAccountId: string,
    contractId?: string,
  ): FastDataTransaction {
    return this.buildCommit(buildUnfollowArgs(signerId, targetAccountId), contractId ?? this.cid);
  }

  // ---------------------------------------------------------------------------
  // Engagement
  // ---------------------------------------------------------------------------

  /** Build transaction args for liking a post. */
  buildLike(signerId: string, item: ActionItem, contractId?: string): FastDataTransaction {
    return this.buildCommit(buildLikeArgs(signerId, item), contractId ?? this.cid);
  }

  /** Build transaction args for unliking a post. */
  buildUnlike(signerId: string, item: ActionItem, contractId?: string): FastDataTransaction {
    return this.buildCommit(buildUnlikeArgs(signerId, item), contractId ?? this.cid);
  }

  /** Build transaction args for reposting. */
  buildRepost(signerId: string, item: ActionItem, contractId?: string): FastDataTransaction {
    return this.buildCommit(buildRepostArgs(signerId, item), contractId ?? this.cid);
  }

  // ---------------------------------------------------------------------------
  // Feeds
  // ---------------------------------------------------------------------------

  /** Fetch an account's post feed. */
  async getAccountFeed(
    accountId: string,
    opts?: FeedOptions & { includeReplies?: boolean; contractId?: string },
  ): Promise<FeedResponse> {
    const params = new URLSearchParams({ account_id: accountId });
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.from != null) params.set("from", String(opts.from));
    if (opts?.order) params.set("order", opts.order);
    if (opts?.includeReplies) params.set("include_replies", "true");
    if (opts?.contractId) params.set("contract_id", opts.contractId);
    const data = await this.fetchJson<FeedResponse>(`/v1/social/feed/account?${params}`);
    return data;
  }

  /** Fetch posts by hashtag via socialIndex. */
  async getHashtagFeed(
    hashtag: string,
    opts?: FeedOptions & { contractId?: string },
  ): Promise<IndexEntry[]> {
    return this.socialIndex("hashtag", hashtag, {
      contractId: opts?.contractId,
      limit: opts?.limit,
      from: opts?.from,
      order: opts?.order,
    });
  }

  /** Fetch the global activity feed via socialIndex. */
  async getActivityFeed(opts?: FeedOptions & { contractId?: string }): Promise<IndexEntry[]> {
    return this.socialIndex("post", "main", {
      contractId: opts?.contractId,
      limit: opts?.limit,
      from: opts?.from,
      order: opts?.order,
    });
  }

  /** Fetch posts mentioning an account via socialIndex. */
  async getMentionedFeed(
    accountId: string,
    opts?: FeedOptions & { contractId?: string },
  ): Promise<IndexEntry[]> {
    return this.socialIndex("notify", accountId, {
      contractId: opts?.contractId,
      limit: opts?.limit,
      from: opts?.from,
      order: opts?.order,
    });
  }

  /** Fetch notifications for an account via socialIndex. */
  async getNotifications(
    accountId: string,
    opts?: FeedOptions & { contractId?: string },
  ): Promise<IndexEntry[]> {
    return this.socialIndex("notify", accountId, {
      contractId: opts?.contractId,
      limit: opts?.limit,
      from: opts?.from,
      order: opts?.order,
    });
  }
}
