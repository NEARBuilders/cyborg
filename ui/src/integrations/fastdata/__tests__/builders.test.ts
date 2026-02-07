import { describe, expect, test } from "bun:test";
import {
  buildCommentArgs,
  buildFollowArgs,
  buildLikeArgs,
  buildPostArgs,
  buildProfileArgs,
  buildRepostArgs,
  buildUnfollowArgs,
  buildUnlikeArgs,
} from "../builders";

describe("buildProfileArgs", () => {
  test("builds name, image, about keys", () => {
    const args = buildProfileArgs("alice.near", {
      name: "Alice",
      image_url: "https://img.com/a.png",
      about: "Hello",
    });
    expect(args["profile/name"]).toBe("Alice");
    expect(args["profile/image/url"]).toBe("https://img.com/a.png");
    expect(args["profile/about"]).toBe("Hello");
  });

  test("omits empty fields", () => {
    const args = buildProfileArgs("alice.near", { name: "Alice" });
    expect(Object.keys(args)).toEqual(["profile/name"]);
  });

  test("builds tag keys", () => {
    const args = buildProfileArgs("alice.near", { tags: ["developer", "near"] });
    expect(args["profile/tags/developer"]).toBe("");
    expect(args["profile/tags/near"]).toBe("");
  });

  test("builds linktree keys", () => {
    const args = buildProfileArgs("alice.near", {
      linktree: { twitter: "alice", github: "alice-dev" },
    });
    expect(args["profile/linktree/twitter"]).toBe("alice");
    expect(args["profile/linktree/github"]).toBe("alice-dev");
  });

  test("returns empty for empty input", () => {
    const args = buildProfileArgs("alice.near", {});
    expect(Object.keys(args)).toHaveLength(0);
  });
});

describe("buildPostArgs", () => {
  test("builds post/main and index/post", () => {
    const args = buildPostArgs("alice.near", { text: "Hello world" });
    expect(JSON.parse(args["post/main"])).toEqual({ text: "Hello world" });
    expect(JSON.parse(args["index/post"])).toEqual({
      key: "main",
      value: { type: "md" },
    });
  });

  test("extracts single hashtag", () => {
    const args = buildPostArgs("alice.near", { text: "Hello #near" });
    const hashtag = JSON.parse(args["index/hashtag"]);
    expect(hashtag.key).toBe("near");
  });

  test("extracts multiple hashtags as array", () => {
    const args = buildPostArgs("alice.near", { text: "#near #web3" });
    const hashtags = JSON.parse(args["index/hashtag"]);
    expect(Array.isArray(hashtags)).toBe(true);
    expect(hashtags).toHaveLength(2);
  });

  test("extracts single mention", () => {
    const args = buildPostArgs("alice.near", { text: "Hi @bob.near" });
    const notify = JSON.parse(args["index/notify"]);
    expect(notify.key).toBe("bob.near");
  });

  test("extracts multiple mentions as array", () => {
    const args = buildPostArgs("alice.near", { text: "@bob.near @carol.near" });
    const notify = JSON.parse(args["index/notify"]);
    expect(Array.isArray(notify)).toBe(true);
    expect(notify).toHaveLength(2);
  });

  test("no hashtags or mentions omits those keys", () => {
    const args = buildPostArgs("alice.near", { text: "Plain text" });
    expect(args["index/hashtag"]).toBeUndefined();
    expect(args["index/notify"]).toBeUndefined();
  });
});

describe("buildCommentArgs", () => {
  test("builds comment keys", () => {
    const args = buildCommentArgs("alice.near", {
      text: "Nice!",
      targetAuthor: "bob.near",
      targetBlockHeight: "12345",
    });
    expect(JSON.parse(args["post/comment"])).toEqual({ text: "Nice!" });
    const comment = JSON.parse(args["index/comment"]);
    expect(comment.key).toContain("bob.near/post/main");
    const notify = JSON.parse(args["index/notify"]);
    expect(notify.key).toBe("bob.near");
    expect(notify.value.type).toBe("comment");
  });
});

describe("buildFollowArgs / buildUnfollowArgs", () => {
  test("follow sets key to empty string", () => {
    const args = buildFollowArgs("alice.near", "bob.near");
    expect(args["graph/follow/bob.near"]).toBe("");
  });

  test("unfollow sets key to null", () => {
    const args = buildUnfollowArgs("alice.near", "bob.near");
    expect(args["graph/follow/bob.near"]).toBeNull();
  });
});

describe("buildLikeArgs", () => {
  test("builds like index and notification", () => {
    const args = buildLikeArgs("alice.near", {
      type: "like",
      path: "bob.near/post/main",
      blockHeight: "12345",
    });
    const like = JSON.parse(args["index/like"]);
    expect(like.value.type).toBe("like");
    const notify = JSON.parse(args["index/notify"]);
    expect(notify.key).toBe("bob.near");
  });
});

describe("buildUnlikeArgs", () => {
  test("builds unlike index entry", () => {
    const args = buildUnlikeArgs("alice.near", {
      type: "like",
      path: "bob.near/post/main",
      blockHeight: "12345",
    });
    const likeValue = args["index/like"];
    expect(likeValue).toBeDefined();
    const like = JSON.parse(likeValue as string);
    expect(like.value.type).toBe("unlike");
  });
});

describe("buildRepostArgs", () => {
  test("builds repost index and notification", () => {
    const args = buildRepostArgs("alice.near", {
      type: "repost",
      path: "bob.near/post/main",
      blockHeight: "12345",
    });
    const repost = JSON.parse(args["index/repost"]);
    expect(repost.value.type).toBe("repost");
    const notify = JSON.parse(args["index/notify"]);
    expect(notify.key).toBe("bob.near");
  });
});
