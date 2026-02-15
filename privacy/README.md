# Nova Encrypt App

Standalone React app for end-to-end encrypted messaging using Nova SDK and NEAR Protocol.

## Setup

1. Install dependencies:
```bash
bun install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Update `.env` with your values:
```bash
NOVA_ACCOUNT_ID=your-account.near
NOVA_API_KEY=your-nova-api-key
NEAR_NETWORK=testnet
```

## Development

```bash
bun dev
```

Visit http://localhost:3000

## Build for Cloudflare Pages

```bash
bun build
```

Deploy the `dist/` folder to Cloudflare Pages.

## Features

- ✅ NEAR Wallet authentication via better-near-auth
- ✅ Client-side AES-256-GCM encryption
- ✅ Upload to IPFS via Nova SDK
- ✅ Transaction recorded on NEAR testnet
- ✅ Minimalist UI with Tailwind CSS

## How it works

1. User connects NEAR wallet
2. Types a message
3. Nova SDK encrypts message client-side
4. Encrypted data uploaded to IPFS
5. Transaction hash recorded on NEAR blockchain
6. Returns CID for retrieval

## Architecture

```
User Input
    ↓
Client-side Encryption (AES-256-GCM)
    ↓
IPFS Upload
    ↓
NEAR Blockchain Transaction
    ↓
CID returned
```
