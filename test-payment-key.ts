/**
 * Test script for payment key creation
 * Run with: bun run test-payment-key.ts
 */

import { ChaCha20Poly1305 } from "@stablelib/chacha20poly1305";
import { randomBytes } from "@stablelib/random";

// Configuration
const ACCOUNT_ID = "kampouse.near";
const CONTRACT_ID = "outlayer.near";
const USDC_CONTRACT =
  "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const COORDINATOR_API = "https://api.outlayer.fastnear.com";

// Helper: Convert hex string to bytes
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function testPaymentKeyCreation() {
  console.log("=== Payment Key Creation Test ===\n");
  console.log(`Account: ${ACCOUNT_ID}\n`);

  // Step 1: Fetch coordinator pubkey
  console.log("Step 1: Fetching coordinator pubkey...");
  const pubkeyResponse = await fetch(`${COORDINATOR_API}/secrets/pubkey`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accessor: { type: "System", PaymentKey: {} },
      owner: ACCOUNT_ID,
      profile: "1",
      secrets_json: "{}",
    }),
  });

  if (!pubkeyResponse.ok) {
    console.error("❌ Failed to fetch pubkey:", await pubkeyResponse.text());
    return;
  }

  const { pubkey } = await pubkeyResponse.json();
  console.log("✅ Pubkey:", pubkey);
  console.log("");

  // Step 2: Generate random secret
  console.log("Step 2: Generating payment key secret...");
  const secretBytes = randomBytes(32);
  const secret = Array.from(secretBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const paymentKeyNonce = 1;
  const paymentKey = `${ACCOUNT_ID}:${paymentKeyNonce}:${secret}`;
  console.log("✅ Payment Key:", paymentKey);
  console.log("   Secret:", secret);
  console.log("");

  // Step 3: Encrypt payment key data
  console.log("Step 3: Encrypting payment key data...");
  const paymentKeySecret = {
    key: secret,
    initial_balance: "0",
    project_ids: [],
    max_per_call: "0",
  };

  const secretJson = JSON.stringify(paymentKeySecret);
  console.log("   Secret data:", secretJson);

  const keyMaterial = hexToBytes(pubkey);
  const plaintextBytes = new TextEncoder().encode(secretJson);
  const cipher = new ChaCha20Poly1305(keyMaterial);
  const nonce_bytes = randomBytes(12);
  const ciphertextWithTag = cipher.seal(nonce_bytes, plaintextBytes);
  const encrypted = new Uint8Array(12 + ciphertextWithTag.length);
  encrypted.set(nonce_bytes, 0);
  encrypted.set(ciphertextWithTag, 12);
  const encryptedBase64 = btoa(String.fromCharCode(...Array.from(encrypted)));

  console.log("✅ Encrypted (length):", encryptedBase64.length);
  console.log(
    "   Encrypted (base64):",
    encryptedBase64.substring(0, 100) + "...",
  );
  console.log("");

  // Step 4: Prepare store_secrets transaction
  console.log("Step 4: Preparing store_secrets transaction...");
  const storeSecretsArgs = {
    accessor: { System: "PaymentKey" },
    profile: paymentKeyNonce.toString(),
    encrypted_secrets_base64: encryptedBase64,
    access: { AllowAll: null },
  };

  console.log("   Transaction 1 - store_secrets:");
  console.log("   Contract:", CONTRACT_ID);
  console.log("   Method: store_secrets");
  console.log("   Gas: 100 Tgas");
  console.log("   Deposit: 0.1 NEAR");
  console.log("");
  console.log("   Args (JSON):");
  console.log("   ", JSON.stringify(storeSecretsArgs, null, 2));
  console.log("");

  // Step 5: Prepare funding transaction
  console.log("Step 5: Preparing funding transaction...");
  const initialDeposit = "1"; // $1 USD
  const depositMicroUnits = (parseFloat(initialDeposit) * 1000000).toString();

  const fundArgs = {
    receiver_id: CONTRACT_ID,
    amount: depositMicroUnits,
    msg: JSON.stringify({
      action: "top_up_payment_key",
      nonce: paymentKeyNonce,
    }),
  };

  console.log("   Transaction 2 - ft_transfer_call (fund):");
  console.log("   Contract:", USDC_CONTRACT);
  console.log("   Method: ft_transfer_call");
  console.log("   Gas: 100 Tgas");
  console.log("   Deposit: 1 yocto");
  console.log("");
  console.log("   Args (JSON):");
  console.log("   ", JSON.stringify(fundArgs, null, 2));
  console.log("");

  // CLI commands for manual testing
  console.log("=== CLI Commands for Manual Testing ===");
  console.log("");
  console.log("1. Store payment key (Transaction 1):");
  console.log("   near call", CONTRACT_ID, "store_secrets");
  console.log(
    "     '" + JSON.stringify(storeSecretsArgs).replace(/"/g, '\\"') + "'",
  );
  console.log("     account_id", ACCOUNT_ID);
  console.log("     prepaid-gas '100.0 Tgas'");
  console.log("     deposit 0.1");
  console.log("");
  console.log("2. Fund payment key (Transaction 2):");
  console.log("   near call", USDC_CONTRACT, "ft_transfer_call");
  console.log("     '" + JSON.stringify(fundArgs).replace(/"/g, '\\"') + "'");
  console.log("     account_id", ACCOUNT_ID);
  console.log("     prepaid-gas '100.0 Tgas'");
  console.log("     deposit 0.00001");
  console.log("");

  console.log("=== Summary ===");
  console.log("Payment Key:", paymentKey);
  console.log("Nonce:", paymentKeyNonce);
  console.log("Secret:", secret);
  console.log(
    "Initial Deposit:",
    initialDeposit,
    "USD =",
    depositMicroUnits,
    "micro-units",
  );
  console.log("");
  console.log("✅ Test completed successfully!");
  console.log("");
  console.log("Next steps:");
  console.log("1. Sign the store_secrets transaction");
  console.log("2. Sign the ft_transfer_call transaction");
  console.log("3. Payment key will be active after both transactions");
}

// Run the test
testPaymentKeyCreation().catch(console.error);
