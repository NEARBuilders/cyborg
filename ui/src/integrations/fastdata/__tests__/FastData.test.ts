import { beforeEach, describe, expect, mock, test } from "bun:test";
import { FastData } from "../FastData";

const API_URL = "https://test.api";

function createClient() {
  return new FastData({ apiUrl: API_URL });
}

let lastFetchUrl: string;
let lastFetchOpts: RequestInit | undefined;

beforeEach(() => {
  lastFetchUrl = "";
  lastFetchOpts = undefined;
});

// Mock global fetch
const originalFetch = globalThis.fetch;

function mockFetch(responseBody: unknown) {
  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    lastFetchUrl = String(input);
    lastFetchOpts = init;
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

// ---------------------------------------------------------------------------
// kvGet
// ---------------------------------------------------------------------------

describe("kvGet", () => {
  test("constructs correct URL with query params", async () => {
    mockFetch({
      predecessor_id: "a",
      current_account_id: "b",
      key: "k",
      value: "v",
      block_height: 1,
      block_timestamp: 0,
      receipt_id: "r",
      tx_hash: "t",
    });
    const client = createClient();
    await client.kvGet({
      predecessorId: "alice.near",
      currentAccountId: "contextual.near",
      key: "profile/name",
    });
    restoreFetch();

    const url = new URL(lastFetchUrl);
    expect(url.pathname).toBe("/v1/kv/get");
    expect(url.searchParams.get("predecessor_id")).toBe("alice.near");
    expect(url.searchParams.get("current_account_id")).toBe("contextual.near");
    expect(url.searchParams.get("key")).toBe("profile/name");
  });
});

// ---------------------------------------------------------------------------
// kvQuery
// ---------------------------------------------------------------------------

describe("kvQuery", () => {
  test("constructs URL with required params only", async () => {
    mockFetch({ entries: [] });
    const client = createClient();
    await client.kvQuery({ predecessorId: "alice.near", currentAccountId: "contextual.near" });
    restoreFetch();

    const url = new URL(lastFetchUrl);
    expect(url.pathname).toBe("/v1/kv/query");
    expect(url.searchParams.get("predecessor_id")).toBe("alice.near");
    expect(url.searchParams.get("current_account_id")).toBe("contextual.near");
  });

  test("includes all optional params", async () => {
    mockFetch({ entries: [] });
    const client = createClient();
    await client.kvQuery({
      predecessorId: "alice.near",
      currentAccountId: "contextual.near",
      keyPrefix: "profile/",
      limit: 10,
      offset: 5,
      excludeNull: true,
      fields: "key,value",
    });
    restoreFetch();

    const url = new URL(lastFetchUrl);
    expect(url.searchParams.get("current_account_id")).toBe("contextual.near");
    expect(url.searchParams.get("key_prefix")).toBe("profile/");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("offset")).toBe("5");
    expect(url.searchParams.get("exclude_null")).toBe("true");
    expect(url.searchParams.get("fields")).toBe("key,value");
  });

  test("returns entries array", async () => {
    const entries = [
      {
        predecessor_id: "a",
        current_account_id: "b",
        key: "k",
        value: "v",
        block_height: 1,
        block_timestamp: 0,
        receipt_id: "r",
        tx_hash: "t",
      },
    ];
    mockFetch({ entries });
    const client = createClient();
    const result = await client.kvQuery({
      predecessorId: "alice.near",
      currentAccountId: "contextual.near",
    });
    restoreFetch();

    expect(result).toEqual(entries);
  });

  test("returns empty array when entries is missing", async () => {
    mockFetch({});
    const client = createClient();
    const result = await client.kvQuery({
      predecessorId: "alice.near",
      currentAccountId: "contextual.near",
    });
    restoreFetch();

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// kvHistory
// ---------------------------------------------------------------------------

describe("kvHistory", () => {
  test("constructs URL with required params", async () => {
    mockFetch({ entries: [] });
    const client = createClient();
    await client.kvHistory("alice.near", "contextual.near", "profile/name");
    restoreFetch();

    const url = new URL(lastFetchUrl);
    expect(url.pathname).toBe("/v1/kv/history");
    expect(url.searchParams.get("predecessor_id")).toBe("alice.near");
    expect(url.searchParams.get("current_account_id")).toBe("contextual.near");
    expect(url.searchParams.get("key")).toBe("profile/name");
  });

  test("includes optional params", async () => {
    mockFetch({ entries: [] });
    const client = createClient();
    await client.kvHistory("alice.near", "contextual.near", "profile/name", {
      limit: 5,
      order: "desc",
      fromBlock: 100,
      toBlock: 200,
    });
    restoreFetch();

    const url = new URL(lastFetchUrl);
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("order")).toBe("desc");
    expect(url.searchParams.get("from_block")).toBe("100");
    expect(url.searchParams.get("to_block")).toBe("200");
  });
});

// ---------------------------------------------------------------------------
// kvReverse
// ---------------------------------------------------------------------------

describe("kvReverse", () => {
  test("constructs correct URL", async () => {
    mockFetch({ entries: [] });
    const client = createClient();
    await client.kvReverse("contextual.near", "graph/follow/bob.near", { excludeNull: true });
    restoreFetch();

    const url = new URL(lastFetchUrl);
    expect(url.pathname).toBe("/v1/kv/reverse");
    expect(url.searchParams.get("current_account_id")).toBe("contextual.near");
    expect(url.searchParams.get("key")).toBe("graph/follow/bob.near");
    expect(url.searchParams.get("exclude_null")).toBe("true");
  });
});

// ---------------------------------------------------------------------------
// kvBatch
// ---------------------------------------------------------------------------

describe("kvBatch", () => {
  test("sends POST with correct body", async () => {
    mockFetch({ results: [] });
    const client = createClient();
    await client.kvBatch("alice.near", "contextual.near", ["key1", "key2"]);
    restoreFetch();

    expect(lastFetchUrl).toBe(`${API_URL}/v1/kv/batch`);
    expect(lastFetchOpts?.method).toBe("POST");
    const body = JSON.parse(lastFetchOpts?.body as string);
    expect(body.predecessor_id).toBe("alice.near");
    expect(body.current_account_id).toBe("contextual.near");
    expect(body.keys).toEqual(["key1", "key2"]);
  });
});

// ---------------------------------------------------------------------------
// kvDiff
// ---------------------------------------------------------------------------

describe("kvDiff", () => {
  test("constructs URL with block heights", async () => {
    mockFetch({ a: null, b: null });
    const client = createClient();
    await client.kvDiff("alice.near", "contextual.near", "profile/name", 100, 200);
    restoreFetch();

    const url = new URL(lastFetchUrl);
    expect(url.pathname).toBe("/v1/kv/diff");
    expect(url.searchParams.get("block_height_a")).toBe("100");
    expect(url.searchParams.get("block_height_b")).toBe("200");
  });
});

// ---------------------------------------------------------------------------
// kvTimeline
// ---------------------------------------------------------------------------

describe("kvTimeline", () => {
  test("constructs URL with optional params", async () => {
    mockFetch({ entries: [] });
    const client = createClient();
    await client.kvTimeline("alice.near", "contextual.near", {
      limit: 20,
      order: "asc",
      fromBlock: 50,
      toBlock: 150,
      fields: "key,value",
    });
    restoreFetch();

    const url = new URL(lastFetchUrl);
    expect(url.pathname).toBe("/v1/kv/timeline");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("order")).toBe("asc");
    expect(url.searchParams.get("from_block")).toBe("50");
    expect(url.searchParams.get("to_block")).toBe("150");
    expect(url.searchParams.get("fields")).toBe("key,value");
  });
});

// ---------------------------------------------------------------------------
// socialGet
// ---------------------------------------------------------------------------

describe("socialGet", () => {
  test("sends POST with keys array", async () => {
    mockFetch({});
    const client = createClient();
    await client.socialGet(["alice.near/profile/**"]);
    restoreFetch();

    expect(lastFetchUrl).toBe(`${API_URL}/v1/social/get`);
    expect(lastFetchOpts?.method).toBe("POST");
    const body = JSON.parse(lastFetchOpts?.body as string);
    expect(body.keys).toEqual(["alice.near/profile/**"]);
    expect(body.contract_id).toBeUndefined();
  });

  test("includes contractId when provided", async () => {
    mockFetch({});
    const client = createClient();
    await client.socialGet(["alice.near/**"], { contractId: "social.near" });
    restoreFetch();

    const body = JSON.parse(lastFetchOpts?.body as string);
    expect(body.contract_id).toBe("social.near");
  });
});

// ---------------------------------------------------------------------------
// socialKeys
// ---------------------------------------------------------------------------

describe("socialKeys", () => {
  test("sends POST with keys and options", async () => {
    mockFetch({});
    const client = createClient();
    await client.socialKeys(["alice.near/**"], {
      contractId: "social.near",
      options: { returnType: "true" },
    });
    restoreFetch();

    expect(lastFetchUrl).toBe(`${API_URL}/v1/social/keys`);
    const body = JSON.parse(lastFetchOpts?.body as string);
    expect(body.keys).toEqual(["alice.near/**"]);
    expect(body.options).toEqual({ return_type: "true" });
    expect(body.contract_id).toBe("social.near");
  });
});

// ---------------------------------------------------------------------------
// socialIndex
// ---------------------------------------------------------------------------

describe("socialIndex", () => {
  test("constructs URL with action and key", async () => {
    mockFetch({ entries: [] });
    const client = createClient();
    await client.socialIndex("post", "main", { limit: 10, order: "desc" });
    restoreFetch();

    const url = new URL(lastFetchUrl);
    expect(url.pathname).toBe("/v1/social/index");
    expect(url.searchParams.get("action")).toBe("post");
    expect(url.searchParams.get("key")).toBe("main");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("order")).toBe("desc");
  });
});

// ---------------------------------------------------------------------------
// buildCommit
// ---------------------------------------------------------------------------

describe("buildCommit", () => {
  test("uses config contractId", () => {
    const client = new FastData({ apiUrl: API_URL, contractId: "custom.near" });
    const tx = client.buildCommit({ key: "val" });
    expect(tx.contractId).toBe("custom.near");
    expect(tx.methodName).toBe("__fastdata_kv");
    expect(tx.args).toEqual({ key: "val" });
  });

  test("falls back to default contract", () => {
    const client = createClient();
    const tx = client.buildCommit({ key: "val" });
    expect(tx.contractId).toBe("contextual.near");
  });

  test("override contractId takes precedence", () => {
    const client = new FastData({ apiUrl: API_URL, contractId: "custom.near" });
    const tx = client.buildCommit({ key: "val" }, "override.near");
    expect(tx.contractId).toBe("override.near");
  });
});

// ---------------------------------------------------------------------------
// error handling
// ---------------------------------------------------------------------------

describe("fetchJson error handling", () => {
  test("throws on non-ok response", async () => {
    globalThis.fetch = mock(async () => {
      return new Response("Not Found", { status: 404, statusText: "Not Found" });
    }) as typeof fetch;

    const client = createClient();
    await expect(
      client.kvGet({ predecessorId: "a", currentAccountId: "b", key: "c" }),
    ).rejects.toThrow("FastData API 404");
    restoreFetch();
  });
});
