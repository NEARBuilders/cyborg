---
name: legion-social
description: Interact with Legion Social and FastData protocol on NEAR. Use when the user asks about profiles, social graph (follow/following), posts, comments, likes, or projects on contextual.near. Handles both read (FastData API) and write (contextual.near contract) operations.
license: MIT
compatibility: Requires near CLI (near) with logged-in account for writes. Reads work without authentication.
metadata:
  author: NEARBuilders
  version: "1.0"
  contract: contextual.near
  api: https://fastdata.up.railway.app
---

# Legion Social Skill

Interact with the Legion Social platform and FastData protocol on NEAR blockchain.

## Overview

Legion Social uses the FastKV protocol to store social data on NEAR without storage deposits. Data is indexed from transaction logs and served via the FastData API.

**Contract:** `contextual.near`
**Method:** `__fastdata_kv`
**API:** `https://fastdata.up.railway.app`

## Setup

Ensure NEAR CLI is installed and logged in:

```bash
near login
```

Default account: `kampouse.near` (override with `NEAR_ACCOUNT_ID` env var)

## Usage

```bash
./scripts/fastdata.sh <command> [args...]
```

## Commands

### Profile

| Command | Description |
|---------|-------------|
| `profile get <account>` | Get profile from both social.near and contextual.near |
| `profile set <name> [about] [image_url]` | Set your profile |
| `profile tag add <tag>` | Add profile tag |
| `profile tag delete <tag>` | Remove profile tag |
| `profile link set <platform> <handle>` | Set social link |
| `profile link delete <platform>` | Remove social link |

### Social Graph

| Command | Description |
|---------|-------------|
| `follow <account>` | Follow someone |
| `unfollow <account>` | Unfollow someone |
| `followers <account> [limit]` | Get followers list |
| `following <account> [limit]` | Get following list |

### Content

| Command | Description |
|---------|-------------|
| `post "<text>"` | Create post (auto-extracts #hashtags @mentions) |
| `comment <author> <height> "<text>"` | Comment on a post |
| `like <author> <height>` | Like a post |
| `unlike <author> <height>` | Unlike a post |
| `repost <author> <height>` | Repost |

### Projects

| Command | Description |
|---------|-------------|
| `project create <id> <name> [desc] [status]` | Create project |
| `project update <id> [--name X] [--desc X] [--status X]` | Update project |
| `project delete <id>` | Delete project |

### Generic KV

| Command | Description |
|---------|-------------|
| `kv get <account> <key>` | Get key value |
| `kv query <account> <prefix> [limit]` | Query keys by prefix |
| `kv set <key> <value>` | Set key |
| `kv delete <key>` | Delete key |
| `kv batch <k1> <v1> <k2> <v2> ...` | Batch write |

## Key Patterns

### Social Graph
- `graph/follow/{account}` - Follow relationship (`""` = following, `null` = not)

### Profile
- `profile/name` - Display name
- `profile/about` - Bio
- `profile/image/url` - Avatar URL
- `profile/tags/{tag}` - Tags (value = `""`)
- `profile/linktree/{platform}` - Social links

### Content
- `post/main` - `{"text": "..."}`
- `post/comment` - `{"text": "..."}`
- `index/post` - Post index for discovery
- `index/comment` - Comment index
- `index/hashtag` - Hashtag index (auto-extracted)
- `index/notify` - Notification index (auto-generated)
- `index/like` - Like index
- `index/repost` - Repost index

### Projects
- `projects/{id}/name`
- `projects/{id}/description`
- `projects/{id}/status`
- `projects/{id}/created`
- `projects/{id}/updated`
- `index/project/{id}` - Project index

## Examples

```bash
# Get profile (shows both social.near and contextual.near)
./scripts/fastdata.sh profile get alice.near

# Set your profile
./scripts/fastdata.sh profile set "Alice" "Building on NEAR"

# Create a post with hashtags and mentions
./scripts/fastdata.sh post "Hello NEAR! #intro @bob.near"

# Follow someone
./scripts/fastdata.sh follow bob.near

# Comment on a post
./scripts/fastdata.sh comment alice.near 123456 "Great post!"

# Like a post
./scripts/fastdata.sh like alice.near 123456

# Create a project
./scripts/fastdata.sh project create myapp "My App" "Description" active

# Query custom data
./scripts/fastdata.sh kv query alice.near graph/follow
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEAR_ACCOUNT_ID` | `kampouse.near` | Account for writes |
| `FASTDATDA_API_URL` | `https://fastdata.up.railway.app` | FastData API URL |

## Notes

- **Reads**: Free, via FastData API indexer
- **Writes**: Cost gas (~0.001-0.01 NEAR per operation)
- **Profile reads**: Show both `social.near` and `contextual.near` data
- **Auto-extraction**: Posts automatically extract `#hashtags` and `@mentions`
- **Notifications**: Follow, like, comment, repost auto-generate notification indexes

## Related

- [Cyborg Repository](https://github.com/NEARBuilders/cyborg)
- [near.garden](https://near.garden)
- [Agent Skills](https://agentskills.io)
