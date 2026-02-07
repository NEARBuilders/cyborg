import { describe, expect, test } from "bun:test";
import { extractHashtags, extractMentions } from "../utils";

describe("extractMentions", () => {
  test("single mention", () => {
    expect(extractMentions("Hi @alice.near")).toEqual(["alice.near"]);
  });

  test("multiple mentions", () => {
    expect(extractMentions("@alice.near @bob.near")).toEqual(["alice.near", "bob.near"]);
  });

  test("mentions with dots (alice.near)", () => {
    expect(extractMentions("@alice.near")).toEqual(["alice.near"]);
  });

  test(".tg accounts", () => {
    expect(extractMentions("@alice.tg")).toEqual(["alice.tg"]);
  });

  test("no mentions", () => {
    expect(extractMentions("hello world")).toEqual([]);
  });

  test("empty string", () => {
    expect(extractMentions("")).toEqual([]);
  });

  test("deduplicates mentions", () => {
    expect(extractMentions("@alice.near @alice.near")).toEqual(["alice.near"]);
  });

  test("mention at start and end", () => {
    expect(extractMentions("@alice.near hello @bob.near")).toEqual(["alice.near", "bob.near"]);
  });
});

describe("extractHashtags", () => {
  test("single tag", () => {
    expect(extractHashtags("Hello #near")).toEqual(["near"]);
  });

  test("multiple tags", () => {
    expect(extractHashtags("#near #web3")).toEqual(["near", "web3"]);
  });

  test("tag at end of string", () => {
    expect(extractHashtags("Hello #near")).toEqual(["near"]);
  });

  test("no tags", () => {
    expect(extractHashtags("hello world")).toEqual([]);
  });

  test("empty string", () => {
    expect(extractHashtags("")).toEqual([]);
  });

  test("deduplicates tags", () => {
    expect(extractHashtags("#near #near")).toEqual(["near"]);
  });

  test("tags with numbers", () => {
    expect(extractHashtags("#web3")).toEqual(["web3"]);
  });

  test("lowercases tags", () => {
    expect(extractHashtags("#NEAR")).toEqual(["near"]);
  });
});
