/**
 * Payment Keys Service for Worker
 *
 * Manages OutLayer payment keys for server-side transaction execution.
 * Users can opt-in to set up payment keys for instant transactions without wallet signing.
 *
 * Payment keys are 100% opt-in - existing flows work unchanged for users without keys.
 */

import type { Database } from "../db";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "@stablelib/random";
import { ChaCha20Poly1305 } from "@stablelib/chacha20poly1305";

// =============================================================================
// TYPES
// =============================================================================

export interface PaymentKeyConfig {
  outlayerApiUrl?: string; // Default: https://outlayer.fastnear.com/api
  encryptionKey?: string; // Base64-encoded encryption key for secrets
}

export interface PaymentKey {
  id: string;
  nearAccountId: string;
  nonce: number;
  secret: string; // Encrypted
  initialBalance: string;
  isActive: boolean;
  metadata: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BalanceInfo {
  initialBalance: string; // "10000000" (micro-units, 6 decimals)
  spent: string;
  available: string;
  availableUsd: string; // Formatted USD amount
}

export interface ExecutionParams {
  paymentKey: string; // Full key: owner:nonce:secret
  contractId: string;
  methodName: string;
  args: Record<string, any>;
  gas: string;
  deposit: string;
}

export interface ExecutionResult {
  success: boolean;
  transactionHash?: string;
  remainingBalance?: string;
  error?: string;
}

export interface PreparedTx {
  transactions: Array<{
    contractId: string;
    methodName: string;
    args: Record<string, any>;
    gas: string;
    deposit: string;
  }>;
  nonce: number;
  secret: string;
  paymentKey: string; // Full key: owner:nonce:secret
  initialBalance: string; // Initial balance in micro-units
  instructions: string[];
}

// Payment Key secret data structure (matches official dashboard)
interface PaymentKeySecret {
  key: string; // 64-char hex string
  initial_balance: string; // "0" initially
  project_ids: string[]; // Empty array = any project
  max_per_call: string; // Max spend per call in micro-units
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_OUTLAYER_API_URL = "https://outlayer.fastnear.com/api";
const COORDINATOR_API_URL = "https://api.outlayer.fastnear.com";
// Use USDC with specific contract address
const USDC_CONTRACT_ID =
  "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const OUTLAYER_CONTRACT_ID = "outlayer.near";

// =============================================================================
// ENCRYPTION HELPERS (for payment keys - matches official dashboard)
// =============================================================================

/**
 * Convert hex string to bytes
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Encrypt data with ChaCha20-Poly1305 using coordinator pubkey
 * Matches the official dashboard implementation
 */
function encryptWithPubkey(pubkeyHex: string, plaintext: string): Uint8Array {
  const keyMaterial = hexToBytes(pubkeyHex);
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const cipher = new ChaCha20Poly1305(keyMaterial);
  const nonce = randomBytes(12);
  const ciphertextWithTag = cipher.seal(nonce, plaintextBytes);
  const encrypted = new Uint8Array(12 + ciphertextWithTag.length);
  encrypted.set(nonce, 0);
  encrypted.set(ciphertextWithTag, 12);
  return encrypted;
}

// =============================================================================
// SERVICE
// =============================================================================

export class PaymentKeyService {
  private apiUrl: string;
  private encryptionKey?: CryptoKey;
  private encryptionKeyBase64?: string;

  constructor(
    private db: Database,
    config: PaymentKeyConfig = {},
  ) {
    this.apiUrl = config.outlayerApiUrl || DEFAULT_OUTLAYER_API_URL;

    // Store encryption key for lazy initialization
    if (config.encryptionKey) {
      this.encryptionKeyBase64 = config.encryptionKey;
    }
  }

  /**
   * Initialize encryption key from base64-encoded string (lazy initialization)
   */
  private async ensureEncryptionKey(): Promise<void> {
    if (this.encryptionKey) {
      return; // Already initialized
    }

    if (!this.encryptionKeyBase64) {
      console.warn(
        "[PaymentKeyService] No encryption key configured - secrets will be base64 encoded only",
      );
      return; // No encryption key configured
    }

    try {
      // Decode base64 key
      const keyData = Uint8Array.from(atob(this.encryptionKeyBase64), (c) =>
        c.charCodeAt(0),
      );

      // Validate key length (should be 32 bytes for AES-256)
      if (keyData.length !== 32) {
        console.error(
          `[PaymentKeyService] Invalid encryption key length: ${keyData.length} bytes (expected 32 bytes for AES-256)`,
        );
        throw new Error(
          "Encryption key must be 32 bytes (256 bits) for AES-256-GCM",
        );
      }

      // Import as AES-GCM key
      this.encryptionKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );

      console.log(
        "[PaymentKeyService] ✅ AES-256-GCM encryption key initialized and active",
      );
    } catch (error) {
      console.error(
        "[PaymentKeyService] Failed to initialize encryption key:",
        error,
      );
      throw new Error("Failed to initialize encryption key");
    }
  }

  /**
   * Encrypt secret using AES-GCM
   */
  private async encryptSecret(secret: string): Promise<string> {
    // Ensure encryption key is initialized
    await this.ensureEncryptionKey();

    if (!this.encryptionKey) {
      // If no encryption key, return base64-encoded secret (not encrypted, but obfuscated)
      console.warn(
        "[PaymentKeyService] ⚠️ No encryption key - storing as base64 only (NOT SECURE)",
      );
      return btoa(secret);
    }

    try {
      // Generate random IV (initialization vector)
      const iv = randomBytes(12);

      // Encrypt the secret
      const encryptedData = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        this.encryptionKey,
        new TextEncoder().encode(secret),
      );

      // Combine IV and encrypted data, then encode as base64
      const combined = new Uint8Array(iv.length + encryptedData.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encryptedData), iv.length);

      const result = btoa(String.fromCharCode(...combined));

      console.log(
        "[PaymentKeyService] ✅ Secret encrypted with AES-256-GCM (IV + encrypted data)",
      );

      return result;
    } catch (error) {
      console.error("[PaymentKeyService] Encryption failed:", error);
      throw new Error("Failed to encrypt secret");
    }
  }

  /**
   * Decrypt secret using AES-GCM
   */
  private async decryptSecret(encryptedSecret: string): Promise<string> {
    // Ensure encryption key is initialized
    await this.ensureEncryptionKey();

    if (!this.encryptionKey) {
      // If no encryption key, decode from base64
      try {
        return atob(encryptedSecret);
      } catch {
        return encryptedSecret; // Return as-is if not base64
      }
    }

    try {
      // Decode from base64
      const combined = Uint8Array.from(atob(encryptedSecret), (c) =>
        c.charCodeAt(0),
      );

      // Extract IV (first 12 bytes)
      const iv = combined.slice(0, 12);

      // Extract encrypted data
      const encryptedData = combined.slice(12);

      // Decrypt the secret
      const decryptedData = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        this.encryptionKey,
        encryptedData,
      );

      return new TextDecoder().decode(decryptedData);
    } catch (error) {
      console.error("[PaymentKeyService] Decryption failed:", error);
      throw new Error("Failed to decrypt secret");
    }
  }

  /**
   * Get active payment key for account (returns null if not set up)
   * Secret is decrypted when retrieved from database
   */
  async getOrCreatePaymentKey(accountId: string): Promise<PaymentKey | null> {
    try {
      const key = await this.db.query.paymentKeys.findFirst({
        where: (table, { and, eq }) =>
          and(eq(table.nearAccountId, accountId), eq(table.isActive, true)),
      });

      if (!key) return null;

      // Decrypt the secret before returning
      const decryptedSecret = await this.decryptSecret(key.secret);

      return {
        ...key,
        secret: decryptedSecret,
      };
    } catch (error) {
      console.error("[PaymentKeyService] Error fetching payment key:", error);
      return null;
    }
  }

  /**
   * Check payment key balance via OutLayer API
   */
  async checkBalance(nonce: number): Promise<BalanceInfo> {
    try {
      const url = `${this.apiUrl}/key/${nonce}/balance`;
      console.log(`[PaymentKeyService] Checking balance: ${url}`);

      const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error(`OutLayer API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        initialBalance: data.initial_balance || "0",
        spent: data.spent || "0",
        available: data.available || "0",
        availableUsd: (parseInt(data.available || "0") / 1000000).toFixed(2),
      };
    } catch (error) {
      console.error("[PaymentKeyService] Error checking balance:", error);
      // Return zero balance on error
      return {
        initialBalance: "0",
        spent: "0",
        available: "0",
        availableUsd: "0.00",
      };
    }
  }

  /**
   * Execute transaction via OutLayer HTTPS API with payment key
   * URL format: /call/{contract_id}/{method_name}
   * Body format: { input: { ...args } }
   */
  async executeCall(params: ExecutionParams): Promise<ExecutionResult> {
    try {
      const url = `${this.apiUrl}/call/${params.contractId}/${params.methodName}`;
      console.log(`[PaymentKeyService] Executing call via OutLayer: ${url}`);
      console.log(
        `[PaymentKeyService] Args:`,
        JSON.stringify(params.args).substring(0, 200),
      );

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Payment-Key": params.paymentKey,
        },
        body: JSON.stringify({
          input: params.args,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[PaymentKeyService] OutLayer API error: ${response.status} - ${errorText}`,
        );
        return {
          success: false,
          error: `OutLayer API error: ${response.statusText}`,
        };
      }

      const data = await response.json();

      return {
        success: true,
        transactionHash: data.transaction_hash,
        remainingBalance: data.remaining_balance,
      };
    } catch (error) {
      console.error("[PaymentKeyService] Error executing call:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Prepare transactions to create and fund a payment key
   *
   * This follows the exact same flow as the official OutLayer dashboard:
   * 1. Fetch coordinator pubkey for encryption
   * 2. Generate random 32-byte secret key
   * 3. Encrypt payment key data with ChaCha20-Poly1305
   * 4. Call store_secrets with { System: "PaymentKey" } accessor
   * 5. Fund the key with USDC via ft_transfer_call
   */
  async prepareCreationTx(
    accountId: string,
    initialDepositUsd: string,
  ): Promise<{
    transactions: Array<{
      contractId: string;
      methodName: string;
      args: Record<string, any>;
      gas: string;
      deposit: string;
    }>;
    nonce: number;
    secret: string;
    paymentKey: string;
    initialBalance: string;
    instructions: string[];
  }> {
    // Step 1: Fetch coordinator pubkey for payment key encryption
    const pubkeyResponse = await fetch(
      `${COORDINATOR_API_URL}/secrets/pubkey`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessor: { type: "System", PaymentKey: {} },
          owner: accountId,
          profile: "0", // Will use actual nonce after fetching it
          secrets_json: "{}", // Dummy, pubkey is the same for all
        }),
      },
    );

    if (!pubkeyResponse.ok) {
      const errorText = await pubkeyResponse.text();
      throw new Error(`Failed to get encryption key: ${errorText}`);
    }

    const { pubkey } = await pubkeyResponse.json();
    console.log("[PaymentKeyService] ✅ Fetched coordinator pubkey");

    // Step 2: Generate random secret (32 bytes as HEX string, 64 characters)
    const secretBytes = randomBytes(32);
    const secret = Array.from(secretBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Step 3: Prepare payment key secret data structure
    const paymentKeySecret = {
      key: secret,
      initial_balance: "0", // Will be updated via TopUp
      project_ids: [], // Empty = any project
      max_per_call: "0", // No limit per call
    };

    const secretJson = JSON.stringify(paymentKeySecret);

    // Step 4: Encrypt with ChaCha20-Poly1305
    const keyMaterial = hexToBytes(pubkey);
    const plaintextBytes = new TextEncoder().encode(secretJson);
    const cipher = new ChaCha20Poly1305(keyMaterial);
    const nonce_bytes = randomBytes(12);
    const ciphertextWithTag = cipher.seal(nonce_bytes, plaintextBytes);
    const encrypted = new Uint8Array(12 + ciphertextWithTag.length);
    encrypted.set(nonce_bytes, 0);
    encrypted.set(ciphertextWithTag, 12);
    const encryptedBase64 = btoa(String.fromCharCode(...Array.from(encrypted)));

    console.log("[PaymentKeyService] ✅ Encrypted payment key data");

    // For now, start with nonce 1 for simplicity
    // TODO: Query existing keys to find next available nonce
    const paymentKeyNonce = 1;
    const paymentKey = `${accountId}:${paymentKeyNonce}:${secret}`;

    console.log(`[PaymentKeyService] Using nonce: ${paymentKeyNonce}`);

    // Step 5: Prepare store_secrets transaction
    // Use { System: "PaymentKey" } accessor (this is the key!)
    const storeTx = {
      contractId: OUTLAYER_CONTRACT_ID,
      methodName: "store_secrets",
      args: {
        accessor: { System: "PaymentKey" },
        profile: paymentKeyNonce.toString(),
        encrypted_secrets_base64: encryptedBase64,
        access: { AllowAll: null }, // Object format, not string
      },
      gas: "100 Tgas",
      deposit: "0.1 NEAR", // Storage deposit (excess refunded)
    };

    // Step 6: Prepare funding transaction
    const depositMicroUnits = (
      parseFloat(initialDepositUsd) * 1000000
    ).toString();

    const fundTx = {
      contractId: USDC_CONTRACT_ID,
      methodName: "ft_transfer_call",
      args: {
        receiver_id: OUTLAYER_CONTRACT_ID,
        amount: depositMicroUnits,
        msg: JSON.stringify({
          action: "top_up_payment_key",
          nonce: paymentKeyNonce,
        }),
      },
      gas: "100 Tgas",
      deposit: "1 yocto",
    };

    console.log(
      "[PaymentKeyService] ✅ Prepared payment key creation transactions",
    );

    return {
      transactions: [storeTx, fundTx],
      nonce: paymentKeyNonce,
      secret,
      paymentKey,
      initialBalance: depositMicroUnits,
      instructions: [
        "Step 1: Sign transaction to store encrypted payment key",
        "Step 2: Sign transaction to fund payment key with USDC",
        `Payment Key: ${paymentKey}`,
        `Initial deposit: $${initialDepositUsd} USD`,
        "⚠️ SAVE YOUR KEY - shown only once!",
      ],
    };
  }

  /**
   * Prepare transaction to top up payment key balance
   */
  async topUpBalance(
    nonce: number,
    depositUsd: string,
  ): Promise<{
    transaction: {
      contractId: string;
      methodName: string;
      args: Record<string, any>;
      gas: string;
      deposit: string;
    };
  }> {
    // Convert USD to USDC micro-units (6 decimals)
    const parsedAmount = parseFloat(depositUsd);
    console.log(
      `[PaymentKeyService] topUpBalance called with: nonce=${nonce}, depositUsd="${depositUsd}", parsed=${parsedAmount}`,
    );

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error(
        `Invalid amount: ${depositUsd}. Must be a positive number.`,
      );
    }

    const depositMicroUnits = (parsedAmount * 1000000).toString();
    console.log(
      `[PaymentKeyService] Converted $${parsedAmount} to ${depositMicroUnits} micro-units (USDC, 6 decimals)`,
    );

    // NOTE: OutLayer API handles top-ups internally
    // The payment key is stored on OutLayer's side, not in our database
    // This transaction structure is for the user to sign to authorize the top-up
    const msg = JSON.stringify({
      action: "top_up_payment_key",
      nonce: nonce,
    });

    const transaction = {
      contractId: USDC_CONTRACT_ID,
      methodName: "ft_transfer_call",
      args: {
        receiver_id: OUTLAYER_CONTRACT_ID,
        amount: depositMicroUnits,
        msg: msg,
      },
      gas: "100 Tgas", // near-kit format: string with unit
      deposit: "1 yocto", // near-kit format: string with unit (1 yoctoNEAR for ft_transfer_call)
    };

    console.log(`[PaymentKeyService] Transaction prepared:`, {
      contractId: transaction.contractId,
      amount: transaction.args.amount,
      msg: transaction.args.msg,
      nonce: nonce,
    });

    return { transaction };
  }

  /**
   * Deactivate payment key (soft delete)
   */
  async deactivateKey(accountId: string): Promise<boolean> {
    try {
      const result = await this.db
        .update(schema.paymentKeys)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(schema.paymentKeys.nearAccountId, accountId));

      return true;
    } catch (error) {
      console.error("[PaymentKeyService] Error deactivating key:", error);
      return false;
    }
  }

  /**
   * Store payment key in database after user completes setup
   * Secret is encrypted before storing
   * This is called after user signs both transactions
   *
   * IMPORTANT: If a payment key with this nonce already exists, we just update it
   * instead of trying to insert again (avoids duplicate key errors)
   */
  async storePaymentKey(
    accountId: string,
    nonce: number,
    secret: string,
    initialBalance: string,
  ): Promise<PaymentKey> {
    try {
      console.log("[PaymentKeyService] Storing payment key:", {
        accountId,
        nonce,
        initialBalance,
      });

      const now = new Date();

      // Encrypt the secret before storing
      const encryptedSecret = await this.encryptSecret(secret);
      console.log("[PaymentKeyService] Secret encrypted successfully");

      // Check if payment key with this nonce already exists
      const existingKey = await this.db.query.paymentKeys.findFirst({
        where: eq(schema.paymentKeys.nearAccountId, accountId),
      });

      const existingKeyWithNonce = existingKey?.find((k) => k.nonce === nonce);

      if (existingKeyWithNonce) {
        // Key exists - update it instead of inserting
        console.log("[PaymentKeyService] Payment key exists, updating...");
        await this.db
          .update(schema.paymentKeys)
          .set({
            secret: encryptedSecret,
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.paymentKeys.nearAccountId, accountId),
              eq(schema.paymentKeys.nonce, nonce),
            ),
          );

        const updatedKey = await this.db.query.paymentKeys.findFirst({
          where: and(
            eq(schema.paymentKeys.nearAccountId, accountId),
            eq(schema.paymentKeys.nonce, nonce),
          ),
        });

        if (!updatedKey) {
          throw new Error("Failed to retrieve updated payment key");
        }

        console.log(
          "[PaymentKeyService] Payment key updated successfully:",
          updatedKey.id,
        );

        // Return with decrypted secret
        return {
          ...updatedKey,
          secret, // Return decrypted secret to caller
        };
      }

      // Key doesn't exist - insert new one
      console.log("[PaymentKeyService] Creating new payment key...");
      const id = crypto.randomUUID();

      const metadata = {
        createdAt: now.toISOString(),
      };

      // Insert the new key (allowing multiple active keys per account)
      await this.db.insert(schema.paymentKeys).values({
        id,
        nearAccountId: accountId,
        nonce,
        secret: encryptedSecret, // Encrypted at rest
        initialBalance,
        isActive: true,
        metadata: JSON.stringify(metadata),
        createdAt: now,
        updatedAt: now,
      });

      console.log("[PaymentKeyService] Payment key inserted into database");

      const newKey = await this.db.query.paymentKeys.findFirst({
        where: eq(schema.paymentKeys.id, id),
      });

      if (!newKey) {
        console.error(
          "[PaymentKeyService] Failed to retrieve stored payment key",
        );
        throw new Error("Failed to retrieve stored payment key");
      }

      console.log("[PaymentKeyService] Payment key stored successfully:", id);

      // Return with decrypted secret
      return {
        ...newKey,
        secret, // Return decrypted secret to caller
      };
    } catch (error) {
      console.error("[PaymentKeyService] Error in storePaymentKey:", error);
      throw error;
    }
  }

  /**
   * Get all payment keys for an account (both active and inactive)
   */
  async getAllPaymentKeys(accountId: string): Promise<PaymentKey[]> {
    try {
      const keys = await this.db.query.paymentKeys.findMany({
        where: eq(schema.paymentKeys.nearAccountId, accountId),
        orderBy: (table, { desc }) => [desc(table.createdAt)],
      });

      console.log(
        `[PaymentKeyService] Found ${keys.length} keys for ${accountId}`,
      );

      // Decrypt all secrets
      const keysWithDecryptedSecrets = await Promise.all(
        keys.map(async (key) => ({
          ...key,
          secret: await this.decryptSecret(key.secret),
        })),
      );

      return keysWithDecryptedSecrets;
    } catch (error) {
      console.error("[PaymentKeyService] Error fetching payment keys:", error);
      return [];
    }
  }

  /**
   * Delete a specific payment key by ID
   */
  async deletePaymentKey(keyId: string): Promise<boolean> {
    try {
      await this.db
        .delete(schema.paymentKeys)
        .where(eq(schema.paymentKeys.id, keyId));

      console.log("[PaymentKeyService] Payment key deleted:", keyId);
      return true;
    } catch (error) {
      console.error("[PaymentKeyService] Error deleting payment key:", error);
      return false;
    }
  }

  /**
   * Update payment key initial balance after successful funding
   */
  async updateBalance(nonce: number, initialBalance: string): Promise<boolean> {
    try {
      await this.db
        .update(schema.paymentKeys)
        .set({
          initialBalance,
          updatedAt: new Date(),
        })
        .where(eq(schema.paymentKeys.nonce, nonce));

      console.log(
        `[PaymentKeyService] Updated balance for nonce ${nonce}: ${initialBalance}`,
      );
      return true;
    } catch (error) {
      console.error("[PaymentKeyService] Error updating balance:", error);
      return false;
    }
  }
}
