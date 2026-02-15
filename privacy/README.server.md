# Nova Encryption Server

A simple Hono server to test Nova SDK encryption/decryption with proper MCP support (server-side).

## Setup

1. **Install dependencies** (if not already installed):
```bash
bun install
```

2. **Configure environment**:
```bash
cp .env.server.example .env
```

Edit `.env`:
```env
TEST_NOVA_ACCOUNT_ID=your-account.near
TEST_NOVA_API_KEY=nova_sk_your_api_key_here
PORT=3001
```

3. **Start the server**:
```bash
bun run dev:server
```

Server will run on http://localhost:3001

## API Endpoints

### Health Check
```bash
GET http://localhost:3001
```

### Test Nova Auth
```bash
GET http://localhost:3001/api/nova/auth
```

### Encrypt & Upload to Nova
```bash
POST http://localhost:3001/api/nova/upload
Content-Type: application/json

{
  "message": "Hello Nova!",
  "groupId": "test-group"
}
```

Response:
```json
{
  "success": true,
  "cid": "Qm...",
  "transId": "abc...",
  "fileHash": "sha256...",
  "groupId": "test-group"
}
```

### Retrieve & Decrypt from Nova
```bash
GET http://localhost:3001/api/nova/retrieve/:groupId/:cid
```

Response:
```json
{
  "success": true,
  "data": {
    "text": "Hello Nova!",
    "timestamp": 1736870400000,
    "version": "1.0",
    "uploadedVia": "server"
  },
  "groupId": "test-group",
  "ipfsHash": "Qm..."
}
```

### Get Group Transactions
```bash
GET http://localhost:3001/api/nova/transactions/:groupId
```

### Get Balance
```bash
GET http://localhost:3001/api/nova/balance/:accountId?
```

## How to Test

1. **Start server**:
```bash
bun run dev:server
```

2. **Test endpoints** with curl or Postman:

```bash
# Check health
curl http://localhost:3001

# Test auth
curl http://localhost:3001/api/nova/auth

# Upload message
curl -X POST http://localhost:3001/api/nova/upload \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello from server!"}'

# Retrieve message (use CID from upload response)
curl http://localhost:3001/api/nova/retrieve/test-group/Qm...
```

## Why Server Works But Browser Doesn't

- **Browser**: Can't call MCP due to CORS + requires server-side Node.js crypto
- **Server**: Works perfectly with Nova SDK MCP + has Node.js crypto

## Integration with Frontend

Update your `useNova.js` to call server:

```javascript
// Instead of local encryption, call server
const response = await fetch('http://localhost:3001/api/nova/upload', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message, groupId })
})
const result = await response.json()
```

This way you get:
- ✅ Nova SDK encryption (server-side)
- ✅ IPFS upload (via Nova)
- ✅ NEAR blockchain records (via Nova)
