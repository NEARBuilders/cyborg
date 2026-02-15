/**
 * Test endpoint for scheduled sync - no auth required for testing
 * This will be removed after testing
 */

import type { Env } from "../types";
import { createDatabase } from "../db";
import { syncLegionHolders } from "../scheduled";

export async function GET(req: Request, env: Env): Promise<Response> {
  const db = createDatabase(env.DB);

  try {
    // Trigger sync
    console.log("[TEST-SYNC-V2] Triggering manual sync via test endpoint");
    const result = await syncLegionHolders(db) as any;

    console.log("[TEST-SYNC-V2] Result keys:", Object.keys(result));
    console.log("[TEST-SYNC-V2] Full result:", JSON.stringify(result, null, 2));

    return Response.json({
      ...result,
      _version: "v2",
      _test_keys: Object.keys(result),
    });
  } catch (error) {
    console.error("[TEST-SYNC-V2] Error:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        _version: "v2",
      },
      { status: 500 }
    );
  }
}
