/**
 * Cloudflare Pages _worker.js (Advanced Mode)
 * Handles API routes, database queries, and static asset serving
 *
 * This is a self-contained worker that queries D1 directly
 * No service binding needed - everything is in one place
 */

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle /builders/:id endpoint - query D1 directly
    if (pathname.startsWith('/builders/')) {
      const accountId = pathname.split('/')[2];

      try {
        // Query the database directly
        const stmt = env.DB.prepare(`
          SELECT
            account_id,
            profile_data,
            name,
            image,
            description,
            last_synced_at
          FROM near_social_profiles
          WHERE account_id = ?
        `);

        const result = await stmt.bind(accountId).first();

        if (!result) {
          return new Response(JSON.stringify({ error: 'Profile not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Get NFT holdings
        const holdingsStmt = env.DB.prepare(`
          SELECT contract_id, quantity
          FROM legion_holders
          WHERE account_id = ?
        `);

        const holdingsResult = await holdingsStmt.bind(accountId).all();

        // Parse profile data
        const profileData = JSON.parse(result.profile_data);

        const response = {
          accountId: result.account_id,
          profile: profileData,
          holdings: holdingsResult.results || [],
          lastSyncedAt: new Date(result.last_synced_at * 1000).toISOString(),
        };

        return new Response(JSON.stringify(response), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=300',
          },
        });
      } catch (error) {
        console.error('Error fetching profile:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch profile' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Serve static assets from ASSETS binding
    return env.ASSETS.fetch(request);
  },
};
