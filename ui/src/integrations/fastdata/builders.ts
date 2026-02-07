import type { ActionItem, CommentInput, PostInput, ProfileInput } from "./types";
import { extractHashtags, extractMentions } from "./utils";

function requireNonEmpty(value: string, name: string): void {
  if (!value || !value.trim()) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

/**
 * Builds KV pairs for setting a profile.
 *
 * Keys produced:
 * - profile/name, profile/image/url, profile/about
 * - profile/tags/{tag} for each tag
 * - profile/linktree/{platform} for each platform
 */
export function buildProfileArgs(_signerId: string, profile: ProfileInput): Record<string, string> {
  const a: Record<string, string> = {};
  if (profile.name) a["profile/name"] = profile.name;
  if (profile.image_url) a["profile/image/url"] = profile.image_url;
  if (profile.about) a["profile/about"] = profile.about;
  if (profile.tags) {
    for (const tag of profile.tags) {
      const t = tag.trim();
      if (t) a[`profile/tags/${t}`] = "";
    }
  }
  if (profile.linktree) {
    for (const [platform, handle] of Object.entries(profile.linktree)) {
      if (handle) a[`profile/linktree/${platform}`] = handle;
    }
  }
  return a;
}

/**
 * Builds KV pairs for creating a post.
 * Auto-extracts @mentions and #hashtags from text.
 *
 * Keys produced:
 * - post/main (JSON: {text})
 * - index/post (JSON: {key: "main", value: {type}})
 * - index/hashtag (for each #hashtag)
 * - index/notify (for each @mention, includes signerId as item.accountId)
 */
export function buildPostArgs(signerId: string, post: PostInput): Record<string, string> {
  requireNonEmpty(signerId, "signerId");
  requireNonEmpty(post.text, "post.text");
  const a: Record<string, string> = {};
  a["post/main"] = JSON.stringify({ text: post.text });
  a["index/post"] = JSON.stringify({
    key: "main",
    value: { type: post.type ?? "md" },
  });

  const hashtags = extractHashtags(post.text);
  if (hashtags.length === 1) {
    a["index/hashtag"] = JSON.stringify({
      key: hashtags[0],
      value: { type: "mention", path: "post/main" },
    });
  } else if (hashtags.length > 1) {
    a["index/hashtag"] = JSON.stringify(
      hashtags.map((h) => ({
        key: h,
        value: { type: "mention", path: "post/main" },
      })),
    );
  }

  const mentions = extractMentions(post.text);
  if (mentions.length === 1) {
    a["index/notify"] = JSON.stringify({
      key: mentions[0],
      value: { type: "mention", path: "post/main", accountId: signerId },
    });
  } else if (mentions.length > 1) {
    a["index/notify"] = JSON.stringify(
      mentions.map((m) => ({
        key: m,
        value: { type: "mention", path: "post/main", accountId: signerId },
      })),
    );
  }

  return a;
}

/**
 * Builds KV pairs for creating a comment on a post.
 *
 * Keys produced:
 * - post/comment (JSON: {text})
 * - index/comment (JSON: {key: path, value: {type: "md"}})
 * - index/notify (JSON: {key: targetAuthor, value: {type: "comment", path, accountId}})
 */
export function buildCommentArgs(signerId: string, comment: CommentInput): Record<string, string> {
  requireNonEmpty(signerId, "signerId");
  requireNonEmpty(comment.text, "comment.text");
  requireNonEmpty(comment.targetAuthor, "comment.targetAuthor");
  requireNonEmpty(comment.targetBlockHeight, "comment.targetBlockHeight");
  const path = `${comment.targetAuthor}/post/main\n${comment.targetBlockHeight}`;
  const a: Record<string, string> = {};
  a["post/comment"] = JSON.stringify({ text: comment.text });
  a["index/comment"] = JSON.stringify({
    key: path,
    value: { type: "md" },
  });
  a["index/notify"] = JSON.stringify({
    key: comment.targetAuthor,
    value: { type: "comment", path, accountId: signerId },
  });
  return a;
}

/** Builds KV pairs for following an account. */
export function buildFollowArgs(signerId: string, target: string): Record<string, string> {
  requireNonEmpty(signerId, "signerId");
  requireNonEmpty(target, "target");
  return {
    [`graph/follow/${target}`]: "",
    "index/notify": JSON.stringify({
      key: target,
      value: { type: "follow", accountId: signerId },
    }),
  };
}

/** Builds KV pairs for unfollowing an account. */
export function buildUnfollowArgs(
  _signerId: string,
  target: string,
): Record<string, string | null> {
  requireNonEmpty(target, "target");
  return { [`graph/follow/${target}`]: null };
}

/** Builds KV pairs for liking a post. */
export function buildLikeArgs(signerId: string, item: ActionItem): Record<string, string> {
  requireNonEmpty(signerId, "signerId");
  requireNonEmpty(item.path, "item.path");
  requireNonEmpty(item.blockHeight, "item.blockHeight");
  const path = `${item.path}\n${item.blockHeight}`;
  return {
    "index/like": JSON.stringify({ key: path, value: { type: "like" } }),
    "index/notify": JSON.stringify({
      key: item.path.split("/")[0],
      value: { type: "like", path, accountId: signerId },
    }),
  };
}

/** Builds KV pairs for unliking a post. */
export function buildUnlikeArgs(
  _signerId: string,
  item: ActionItem,
): Record<string, string | null> {
  requireNonEmpty(item.path, "item.path");
  requireNonEmpty(item.blockHeight, "item.blockHeight");
  const path = `${item.path}\n${item.blockHeight}`;
  return {
    "index/like": JSON.stringify({ key: path, value: { type: "unlike" } }),
  };
}

/** Builds KV pairs for reposting. */
export function buildRepostArgs(signerId: string, item: ActionItem): Record<string, string> {
  requireNonEmpty(signerId, "signerId");
  requireNonEmpty(item.path, "item.path");
  requireNonEmpty(item.blockHeight, "item.blockHeight");
  const path = `${item.path}\n${item.blockHeight}`;
  return {
    "index/repost": JSON.stringify({ key: path, value: { type: "repost" } }),
    "index/notify": JSON.stringify({
      key: item.path.split("/")[0],
      value: { type: "repost", path, accountId: signerId },
    }),
  };
}
