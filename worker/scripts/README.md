# Data Sync Scripts

This directory contains scripts for syncing NEAR blockchain data to your D1 database for faster access and reduced API calls.

## Overview

The sync scripts fetch and cache two types of data:
1. **NFT Holders** - Legion NFT holders from multiple contracts
2. **NEAR Social Profiles** - User profiles from the social.near contract

## Scripts

### NFT Holder Sync

#### `sync-simple.ts`
Fast, reliable sync of Legion NFT holders with conservative defaults:
- 3 concurrent requests
- 500ms delay between chunks
- RPC endpoint rotation for reliability
- Resumable state (progress saved to `legion-sync-state-simple.json`)

```bash
# Sync to local database
bun run scripts/sync-simple.ts

# Sync to production database
bun run scripts/sync-simple.ts --remote
```

**Features:**
- Handles 3 Legion NFT contracts:
  - `nearlegion.nfts.tg`
  - `ascendant.nearlegion.near`
  - `initiate.nearlegion.near`
- Automatic retry with exponential backoff
- Batch writes every 30 profiles or every 10 chunks
- Progress state saved for resumability

### NEAR Social Profile Sync

#### `sync-profiles.ts`
Syncs NEAR Social profiles for all NFT holders:
- 5 concurrent profile fetches
- 50 profiles per database batch
- Endpoint rotation for reliability
- Resumable state (progress saved to `profile-sync-state.json`)

```bash
# Sync all legion holder profiles to local database
bun run profiles:sync:local

# Sync to production database
bun run profiles:sync:remote

# Sync specific accounts
bun run scripts/sync-profiles.ts --accounts "account1.near,account2.near"
```

**Features:**
- Extracts common fields (name, image, description) for fast queries
- Full profile JSON stored in `profile_data` column
- Handles accounts without profiles gracefully
- 24-hour TTL for re-syncing existing profiles

### Combined Sync

#### `sync-all.ts`
Convenience script that runs both NFT holder and profile syncs in sequence.

```bash
# Sync everything to local database
bun run sync:all:local

# Sync everything to production
bun run sync:all:remote
```

## Database Schema

### Legion Holders Table (`legion_holders`)

```sql
CREATE TABLE legion_holders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  quantity INTEGER DEFAULT 1 NOT NULL,
  last_synced_at INTEGER NOT NULL,
  synced_at INTEGER NOT NULL,
  UNIQUE(account_id, contract_id)
);
```

**Indexes:**
- `account_id` - Fast lookup by account
- `contract_id` - Filter by NFT contract
- `last_synced_at` - Track sync status

### NEAR Social Profiles Table (`near_social_profiles`)

```sql
CREATE TABLE near_social_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL UNIQUE,
  profile_data TEXT NOT NULL,
  name TEXT,
  image TEXT,
  description TEXT,
  last_synced_at INTEGER NOT NULL,
  synced_at INTEGER NOT NULL
);
```

**Indexes:**
- `account_id` - Fast lookup by account
- `name` - Search by profile name
- `last_synced_at` - Track sync status

## Usage Examples

### Query NFT Holders

```typescript
// Get all holders for a specific contract
const holders = await db
  .select()
  .from(legionHolders)
  .where(eq(legionHolders.contractId, "ascendant.nearlegion.near"));

// Get all contracts held by an account
const userHoldings = await db
  .select()
  .from(legionHolders)
  .where(eq(legionHolders.accountId, "user.near"));
```

### Query Profiles

```typescript
// Get profile with extracted fields
const profile = await db
  .select()
  .from(nearSocialProfiles)
  .where(eq(nearSocialProfiles.accountId, "user.near"));

// Get full profile JSON
const fullProfile = JSON.parse(profile[0].profileData);

// Search by name
const results = await db
  .select()
  .from(nearSocialProfiles)
  .where(like(nearSocialProfiles.name, "%John%"));
```

### Combined Query

```typescript
// Get holders with their profiles
const holdersWithProfiles = await db
  .select({
    account: legionHolders.accountId,
    contract: legionHolders.contractId,
    quantity: legionHolders.quantity,
    profile: nearSocialProfiles.profileData,
    name: nearSocialProfiles.name,
    image: nearSocialProfiles.image,
  })
  .from(legionHolders)
  .leftJoin(
    nearSocialProfiles,
    eq(legionHolders.accountId, nearSocialProfiles.accountId)
  )
  .where(eq(legionHolders.contractId, "ascendant.nearlegion.near"));
```

## Data Flow

```
┌─────────────────────┐
│  NEAR Blockchain    │
│  (RPC Endpoints)    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Sync Scripts       │
│  - NFT Holders      │
│  - Social Profiles  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  D1 Database        │
│  - legion_holders   │
│  - social_profiles  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Your API           │
│  (Fast queries,     │
│   no RPC calls)     │
└─────────────────────┘
```

## Performance Benefits

### Without Caching
```
Request → RPC Endpoint → Wait 200-500ms → Return data
```

### With Caching
```
Request → D1 Database → Wait 10-50ms → Return data
```

**Benefits:**
- 10-50x faster response times
- No rate limiting issues
- Reduced external API dependencies
- Offline capability (cached data)

## Troubleshooting

### Sync Stops or Fails

The scripts save progress automatically. Simply re-run the same command to resume:

```bash
bun run scripts/sync-simple.ts
# Will resume from last saved position
```

### Clear Sync State

To start fresh, delete the state file:

```bash
rm scripts/legion-sync-state-simple.json
rm scripts/profile-sync-state.json
```

### Database Locked Error

If you see "database is locked", ensure no other processes are using the database:

```bash
# Stop any running dev servers
# Check for other wrangler processes
ps aux | grep wrangler
```

### Profile Shows `[object Object]`

This happens when a profile field contains nested objects. The full JSON is still available in `profile_data`:

```typescript
const profile = await db
  .select()
  .from(nearSocialProfiles)
  .where(eq(nearSocialProfiles.accountId, "user.near"));

const fullData = JSON.parse(profile[0].profileData);
// Access nested fields
const imageUrl = fullData.image?.ipfs_cid || fullData.image?.url;
```

## Production Deployment

### Initial Setup

1. Create D1 database:
```bash
bunx wrangler d1 create near-agent-db
```

2. Update `.wrangler/config/v3/d1/miniflare-D1DatabaseObject/*/config.json` with database ID

3. Apply migrations:
```bash
bun run db:migrate
bun run db:migrate:local  # For local development
```

### Regular Syncs

Set up automated syncs using GitHub Actions or cron jobs:

```yaml
# .github/workflows/sync-data.yml
name: Sync NEAR Data
on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run sync:all:remote
```

## API Integration

Example API endpoint that uses cached data:

```typescript
app.get("/api/holders/:contract", async (c) => {
  const { contract } = c.req.param();

  // Check cache first
  const holders = await db
    .select({
      account: legionHolders.accountId,
      quantity: legionHolders.quantity,
    })
    .from(legionHolders)
    .where(eq(legionHolders.contractId, contract));

  // Fetch profiles for cached holders
  const accountIds = holders.map(h => h.account);
  const profiles = await db
    .select()
    .from(nearSocialProfiles)
    .where(inArray(nearSocialProfiles.accountId, accountIds));

  const profileMap = new Map(
    profiles.map(p => [p.accountId, p])
  );

  const results = holders.map(h => ({
    ...h,
    profile: profileMap.get(h.account)?.profileData || null,
  }));

  return c.json(results);
});
```

## Notes

- NFT holder sync is idempotent - safe to run multiple times
- Profile sync skips accounts synced within 24 hours
- Both scripts use exponential backoff on rate limits
- RPC endpoints are rotated to distribute load
- State files are automatically deleted on successful completion
