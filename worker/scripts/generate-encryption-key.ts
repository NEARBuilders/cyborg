#!/usr/bin/env bun
/**
 * Generate a secure encryption key for payment key secrets
 *
 * This generates a 256-bit (32 byte) key encoded in base64 for use with AES-GCM encryption.
 * Run this script to generate a new encryption key for the PAYMENT_KEY_ENCRYPTION_KEY environment variable.
 *
 * Usage:
 *   bun run scripts/generate-encryption-key.ts
 *
 * Then set the key as a secret:
 *   wrangler secret put PAYMENT_KEY_ENCRYPTION_KEY --private
 */

// Generate a cryptographically secure random key (32 bytes for AES-256)
const keyBytes = crypto.getRandomValues(new Uint8Array(32));

// Convert to base64 for easy storage in environment variables
const base64Key = btoa(String.fromCharCode(...keyBytes));

console.log("=".repeat(70));
console.log("Payment Key Encryption Key Generated");
console.log("=".repeat(70));
console.log();
console.log("Copy the key below and set it as a Cloudflare Workers secret:");
console.log();
console.log(`  wrangler secret put PAYMENT_KEY_ENCRYPTION_KEY`);
console.log();
console.log("When prompted, paste this key:");
console.log();
console.log(`  ${base64Key}`);
console.log();
console.log("=".repeat(70));
console.log();
console.log("IMPORTANT:");
console.log("  - Store this key securely (e.g., in 1Password, LastPass, or a password manager)");
console.log("  - Never commit this key to git");
console.log("  - Keep a backup - if you lose this key, all encrypted payment keys will be lost");
console.log("  - Rotate the key periodically (e.g., every 6 months)");
console.log();
console.log("=".repeat(70));
