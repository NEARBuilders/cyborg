#!/bin/bash
# FastData skill - interact with contextual.near contract
# Usage: fastdata.sh <action> [args...]

set -e

API_URL="${FASTDATDA_API_URL:-https://fastdata.up.railway.app}"
CONTRACT="contextual.near"
NEAR_CLI="near"
ACCOUNT_ID="${NEAR_ACCOUNT_ID:-kampouse.near}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[FastData]${NC} $1"; }
warn() { echo -e "${YELLOW}[Warning]${NC} $1"; }
error() { echo -e "${RED}[Error]${NC} $1" >&2; exit 1; }

# HTTP GET helper - handles errors gracefully
http_get() {
  local response
  response=$(curl -s -w "\n%{http_code}" "$1")
  local http_code=$(echo "$response" | tail -1)
  local body=$(echo "$response" | head -n -1)
  
  if [ "$http_code" != "200" ]; then
    echo "HTTP $http_code: $body"
    return 1
  fi
  
  echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2))" 2>/dev/null || echo "$body"
}

# Execute contract call - uses variable to preserve JSON exactly
contract_call() {
  local args="$1"
  local deposit="${2:-0}"
  NEAR_ENV=mainnet $NEAR_CLI call $CONTRACT __fastdata_kv "$args" --accountId $ACCOUNT_ID --deposit $deposit --gas 300000000000000 2>/dev/null
}

# Escape JSON string
json_escape() {
  echo "$1" | sed 's/"/\\"/g'
}

# Extract hashtags from text
extract_hashtags() {
  echo "$1" | grep -oE '#[a-zA-Z0-9_]+' | sed 's/^#//' | tr '\n' ' ' | sed 's/ $//'
}

# Extract mentions from text
extract_mentions() {
  echo "$1" | grep -oE '@[a-zA-Z0-9_.-]+' | sed 's/^@//' | tr '\n' ' ' | sed 's/ $//'
}

# === PROFILE ===

profile_get() {
  local account="$1"
  log "Fetching profile for $account..."
  
  echo ""
  echo "=== social.near ==="
  curl -s -X POST https://rpc.mainnet.near.org -H "Content-Type: application/json" -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "query",
    "params": {
      "request_type": "call_function",
      "finality": "final",
      "account_id": "social.near",
      "method_name": "get",
      "args_base64": "'$(echo -n "{\"keys\":[\"$account/profile/*\"]}" | base64)'"
    }
  }' 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'result' in d and d['result'].get('result'):
    decoded = bytes(d['result']['result']).decode('utf-8')
    data = json.loads(decoded)
    account = '$account'
    if data and account in data and 'profile' in data[account]:
        p = data[account]['profile']
        for k, v in p.items():
            val = v if isinstance(v, str) else json.dumps(v)
            print(f'{k}: {val}')
    else:
        print('(no profile)')
else:
    print('(not found)')
" 2>/dev/null || echo "(error)"
  
  echo ""
  echo "=== contextual.near ==="
  curl -s "$API_URL/v1/kv/query?accountId=$account&contractId=contextual.near&key_prefix=profile/" 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'data' in d and d['data']:
    for entry in d['data']:
        key = entry.get('key', '').replace('profile/', '')
        val = entry.get('value', '')
        # Unwrap JSON string if needed
        if val.startswith('\"') and val.endswith('\"'):
            val = json.loads(val)
        print(f'{key}: {val}')
else:
    print('(no profile)')
" 2>/dev/null || echo "(error)"
}

profile_set() {
  local name="$1"
  local about="$2"
  local image_url="$3"
  
  local args="{"
  args+="\"profile/name\":\"$(json_escape "$name")\""
  [ -n "$about" ] && args+=",\"profile/about\":\"$(json_escape "$about")\""
  [ -n "$image_url" ] && args+=",\"profile/image/url\":\"$(json_escape "$image_url")\""
  args+="}"
  
  log "Setting profile..."
  contract_call "$args" "0.01"
}

profile_set_tag() {
  local tag="$1"
  local args="{\"profile/tags/$tag\":\"\"}"
  log "Adding tag: $tag..."
  contract_call "$args" "0.01"
}

profile_delete_tag() {
  local tag="$1"
  local args="{\"profile/tags/$tag\":null}"
  log "Removing tag: $tag..."
  contract_call "$args" "0"
}

profile_set_link() {
  local platform="$1"
  local handle="$2"
  local args="{\"profile/linktree/$platform\":\"$handle\"}"
  log "Setting $platform link..."
  contract_call "$args" "0.01"
}

profile_delete_link() {
  local platform="$1"
  local args="{\"profile/linktree/$platform\":null}"
  log "Removing $platform link..."
  contract_call "$args" "0"
}

# === SOCIAL GRAPH ===

follow() {
  local target="$1"
  local args="{\"graph/follow/$target\":\"\",\"index/notify\":\"{\\\"key\\\":\\\"$target\\\",\\\"value\\\":{\\\"type\\\":\\\"follow\\\",\\\"accountId\\\":\\\"$ACCOUNT_ID\\\"}}\"}"
  log "Following $target..."
  contract_call "$args" "0.01"
}

unfollow() {
  local target="$1"
  local args="{\"graph/follow/$target\":null}"
  log "Unfollowing $target..."
  contract_call "$args" "0"
}

followers() {
  local account="$1"
  local limit="${2:-100}"
  log "Fetching followers of $account..."
  curl -s "$API_URL/v1/social/followers?accountId=$account&contractId=$CONTRACT&limit=$limit" 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'data' in d:
    for entry in d['data']:
        # Handle both string and object formats
        if isinstance(entry, str):
            print(entry)
        else:
            print(entry.get('accountId', entry))
elif 'error' in d:
    print(f'Error: {d[\"error\"]}')
elif not d.get('data'):
    print('(no followers)')
" 2>/dev/null || echo "(error)"
}

following() {
  local account="$1"
  local limit="${2:-100}"
  log "Fetching following of $account..."
  curl -s "$API_URL/v1/social/following?accountId=$account&contractId=$CONTRACT&limit=$limit" 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'data' in d:
    for entry in d['data']:
        # Handle both string and object formats
        if isinstance(entry, str):
            print(entry)
        else:
            print(entry.get('accountId', entry))
elif 'error' in d:
    print(f'Error: {d[\"error\"]}')
elif not d.get('data'):
    print('(not following anyone)')
" 2>/dev/null || echo "(error)"
}

# === POST ===

post() {
  local text="$1"
  
  # Build base args with proper escaping
  local args="{"
  args+="\"post/main\":\"{\\\"text\\\":\\\"$(json_escape "$text")\\\"}\","
  args+="\"index/post\":\"{\\\"key\\\":\\\"main\\\",\\\"value\\\":{\\\"type\\\":\\\"md\\\"}}\""
  
  # Add hashtags
  local hashtags=$(extract_hashtags "$text")
  if [ -n "$hashtags" ]; then
    local ht_array="["
    local first=true
    for tag in $hashtags; do
      if [ "$first" = true ]; then
        first=false
      else
        ht_array+=","
      fi
      ht_array+="{\\\"key\\\":\\\"$tag\\\",\\\"value\\\":{\\\"type\\\":\\\"mention\\\",\\\"path\\\":\\\"post/main\\\"}}"
    done
    ht_array+="]"
    args+=",\"index/hashtag\":\"$ht_array\""
  fi
  
  # Add mentions
  local mentions=$(extract_mentions "$text")
  if [ -n "$mentions" ]; then
    local mention_array="["
    local first=true
    for mention in $mentions; do
      if [ "$first" = true ]; then
        first=false
      else
        mention_array+=","
      fi
      mention_array+="{\\\"key\\\":\\\"$mention\\\",\\\"value\\\":{\\\"type\\\":\\\"mention\\\",\\\"path\\\":\\\"post/main\\\",\\\"accountId\\\":\\\"$ACCOUNT_ID\\\"}}"
    done
    mention_array+="]"
    args+=",\"index/notify\":\"$mention_array\""
  fi
  
  args+="}"
  log "Creating post..."
  contract_call "$args" "0.01"
}

# === COMMENT ===

comment() {
  local target_author="$1"
  local block_height="$2"
  local text="$3"
  
  local path="$target_author/post/main\n$block_height"
  local args="{"
  args+="\"post/comment\":\"{\\\"text\\\":\\\"$(json_escape "$text")\\\"}\","
  args+="\"index/comment\":\"{\\\"key\\\":\\\"$path\\\",\\\"value\\\":{\\\"type\\\":\\\"md\\\"}}\","
  args+="\"index/notify\":\"{\\\"key\\\":\\\"$target_author\\\",\\\"value\\\":{\\\"type\\\":\\\"comment\\\",\\\"path\\\":\\\"$path\\\",\\\"accountId\\\":\\\"$ACCOUNT_ID\\\"}}\""
  args+="}"
  
  log "Creating comment..."
  contract_call "$args" "0.01"
}

# === LIKE / UNLIKE ===

like() {
  local author="$1"
  local block_height="$2"
  local path="$author/post/main\n$block_height"
  
  local args="{"
  args+="\"index/like\":\"{\\\"key\\\":\\\"$path\\\",\\\"value\\\":{\\\"type\\\":\\\"like\\\"}}\","
  args+="\"index/notify\":\"{\\\"key\\\":\\\"$author\\\",\\\"value\\\":{\\\"type\\\":\\\"like\\\",\\\"path\\\":\\\"$path\\\",\\\"accountId\\\":\\\"$ACCOUNT_ID\\\"}}\""
  args+="}"
  
  log "Liking post..."
  contract_call "$args" "0.01"
}

unlike() {
  local author="$1"
  local block_height="$2"
  local path="$author/post/main\n$block_height"
  
  local args="{\"index/like\":\"{\\\"key\\\":\\\"$path\\\",\\\"value\\\":{\\\"type\\\":\\\"unlike\\\"}}\"}"
  log "Unliking post..."
  contract_call "$args" "0"
}

# === REPOST ===

repost() {
  local author="$1"
  local block_height="$2"
  local path="$author/post/main\n$block_height"
  
  local args="{"
  args+="\"index/repost\":\"{\\\"key\\\":\\\"$path\\\",\\\"value\\\":{\\\"type\\\":\\\"repost\\\"}}\","
  args+="\"index/notify\":\"{\\\"key\\\":\\\"$author\\\",\\\"value\\\":{\\\"type\\\":\\\"repost\\\",\\\"path\\\":\\\"$path\\\",\\\"accountId\\\":\\\"$ACCOUNT_ID\\\"}}\""
  args+="}"
  
  log "Reposting..."
  contract_call "$args" "0.01"
}

# === PROJECT ===

project_create() {
  local id="$1"
  local name="$2"
  local description="$3"
  local status="${4:-active}"
  local now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  local args="{"
  args+="\"projects/$id/name\":\"$(json_escape "$name")\","
  [ -n "$description" ] && args+="\"projects/$id/description\":\"$(json_escape "$description")\","
  args+="\"projects/$id/status\":\"$status\","
  args+="\"projects/$id/created\":\"$now\","
  args+="\"projects/$id/updated\":\"$now\","
  args+="\"index/project/$id\":\"{\\\"type\\\":\\\"project\\\",\\\"accountId\\\":\\\"$ACCOUNT_ID\\\",\\\"name\\\":\\\"$(json_escape "$name")\\\"}\""
  args+="}"
  
  log "Creating project $id..."
  contract_call "$args" "0.01"
}

project_update() {
  local id="$1"
  shift
  local now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  local args="{\"projects/$id/updated\":\"$now\""
  
  while [ $# -gt 0 ]; do
    case "$1" in
      --name) args+=",\"projects/$id/name\":\"$(json_escape "$2")\""; shift 2 ;;
      --description) args+=",\"projects/$id/description\":\"$(json_escape "$2")\""; shift 2 ;;
      --status) args+=",\"projects/$id/status\":\"$2\""; shift 2 ;;
      *) shift ;;
    esac
  done
  
  args+="}"
  
  log "Updating project $id..."
  contract_call "$args" "0.01"
}

project_delete() {
  local id="$1"
  local args="{"
  args+="\"projects/$id/name\":null,"
  args+="\"projects/$id/description\":null,"
  args+="\"projects/$id/status\":null,"
  args+="\"projects/$id/created\":null,"
  args+="\"projects/$id/updated\":null,"
  args+="\"index/project/$id\":null"
  args+="}"
  
  log "Deleting project $id..."
  contract_call "$args" "0"
}

# === GENERIC KV ===

kv_get() {
  local account="$1"
  local key="$2"
  log "Fetching $key for $account..."
  curl -s "$API_URL/v1/kv/get?accountId=$account&contractId=$CONTRACT&key=$key" 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'data' in d and d['data']:
    entry = d['data'][0] if isinstance(d['data'], list) else d['data']
    val = entry.get('value', '')
    if val.startswith('\"') and val.endswith('\"'):
        val = json.loads(val)
    print(f'{entry.get(\"key\", key)}: {val}')
elif 'error' in d:
    print(f'Error: {d[\"error\"]}')
else:
    print('(not found)')
" 2>/dev/null || echo "(error)"
}

kv_query() {
  local account="$1"
  local prefix="$2"
  local limit="${3:-100}"
  log "Querying $prefix for $account..."
  curl -s "$API_URL/v1/kv/query?accountId=$account&contractId=$CONTRACT&key_prefix=$prefix&limit=$limit" 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'data' in d and d['data']:
    for entry in d['data']:
        key = entry.get('key', '')
        val = entry.get('value', '')
        if val.startswith('\"') and val.endswith('\"'):
            val = json.loads(val)
        print(f'{key}: {val}')
elif 'error' in d:
    print(f'Error: {d[\"error\"]}')
else:
    print('(no results)')
" 2>/dev/null || echo "(error)"
}

kv_set() {
  local key="$1"
  local value="$2"
  local args="{\"$key\":\"$(json_escape "$value")\"}"
  log "Setting $key..."
  contract_call "$args" "0.01"
}

kv_delete() {
  local key="$1"
  local args="{\"$key\":null}"
  log "Deleting $key..."
  contract_call "$args" "0"
}

kv_batch() {
  local args="{"
  local first=true
  while [ $# -gt 0 ]; do
    local key="$1"
    local value="$2"
    shift 2
    if [ -z "$value" ] || [ "$value" = "null" ]; then
      [ "$first" = false ] && args+=","
      args+="\"$key\":null"
    else
      [ "$first" = false ] && args+=","
      args+="\"$key\":\"$(json_escape "$value")\""
    fi
    first=false
  done
  args+="}"
  log "Batch write..."
  contract_call "$args" "0.01"
}

# === HELP ===

show_help() {
  cat << 'EOF'
FastData - Interact with contextual.near

Usage: fastdata.sh <command> [args...]

Profile:
  profile get <account>                     Get user profile
  profile set <name> [about] [image_url]    Set profile
  profile tag add <tag>                     Add profile tag
  profile tag delete <tag>                  Remove profile tag
  profile link set <platform> <handle>      Set social link
  profile link delete <platform>            Remove social link

Social:
  follow <account>                          Follow someone
  unfollow <account>                        Unfollow someone
  followers <account> [limit]               Get followers
  following <account> [limit]               Get following

Content:
  post "<text>"                             Create post (auto #hashtag @mention)
  comment <author> <height> "<text>"        Comment on post
  like <author> <height>                    Like a post
  unlike <author> <height>                  Unlike a post
  repost <author> <height>                  Repost

Project:
  project create <id> <name> [desc] [status]  Create project
  project update <id> [--name X] [--desc X] [--status X]  Update project
  project delete <id>                       Delete project

Generic KV:
  kv get <account> <key>                    Get key value
  kv query <account> <prefix> [limit]       Query by prefix
  kv set <key> <value>                      Set key
  kv delete <key>                           Delete key
  kv batch <k1> <v1> <k2> <v2> ...          Batch write

Examples:
  fastdata.sh profile set "Alice" "Building on NEAR"
  fastdata.sh post "Hello NEAR! #intro @bob.near"
  fastdata.sh follow bob.near
  fastdata.sh comment alice.near 123456 "Great post!"
  fastdata.sh project create myapp "My App" "Description" active
  fastdata.sh kv set my_app/data "some value"

Environment:
  NEAR_ACCOUNT_ID    Account for writes (default: kampouse.near)
  FASTDATDA_API_URL  API base URL (default: https://api.fastnear.com)
EOF
}

# === MAIN ===

[ $# -eq 0 ] && { show_help; exit 0; }

cmd="$1"
shift

case "$cmd" in
  help|--help|-h) show_help ;;
  
  # Profile
  profile)
    case "$1" in
      get) profile_get "$2" ;;
      set) profile_set "$2" "$3" "$4" ;;
      tag)
        [ "$2" = "add" ] && { profile_set_tag "$3"; exit 0; }
        [ "$2" = "delete" ] && { profile_delete_tag "$3"; exit 0; }
        error "Usage: profile tag {add|delete} <tag>"
        ;;
      link)
        [ "$2" = "set" ] && { profile_set_link "$3" "$4"; exit 0; }
        [ "$2" = "delete" ] && { profile_delete_link "$3"; exit 0; }
        error "Usage: profile link {set|delete} <platform> [handle]"
        ;;
      *) error "Usage: profile {get|set|tag|link} ..." ;;
    esac
    ;;
  
  # Social
  follow) follow "$1" ;;
  unfollow) unfollow "$1" ;;
  followers) followers "$1" "$2" ;;
  following) following "$1" "$2" ;;
  
  # Content
  post) post "$1" ;;
  comment) comment "$1" "$2" "$3" ;;
  like) like "$1" "$2" ;;
  unlike) unlike "$1" "$2" ;;
  repost) repost "$1" "$2" ;;
  
  # Project
  project)
    case "$1" in
      create) project_create "$2" "$3" "$4" "$5" ;;
      update) shift; project_update "$@" ;;
      delete) project_delete "$2" ;;
      *) error "Usage: project {create|update|delete} ..." ;;
    esac
    ;;
  
  # KV
  kv)
    case "$1" in
      get) kv_get "$2" "$3" ;;
      query) kv_query "$2" "$3" "$4" ;;
      set) kv_set "$2" "$3" ;;
      delete) kv_delete "$2" ;;
      batch) shift; kv_batch "$@" ;;
      *) error "Usage: kv {get|query|set|delete|batch} ..." ;;
    esac
    ;;
  
  *) error "Unknown command: $cmd. Run 'fastdata.sh help' for usage." ;;
esac
