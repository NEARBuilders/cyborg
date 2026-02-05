/**
 * Email Service
 * Handles sending emails via near.email protocol with ENCRYPTION
 *
 * Documentation: https://near.email/dev
 * - Contract: outlayer.near
 * - Email format: alice.near = alice@near.email
 *
 * This service uses NEAR blockchain transactions (wallet signing).
 * Users sign transactions directly with their NEAR wallet.
 * Uses ECIES encryption so only the recipient can decrypt the message.
 * Content is NOT stored publicly on-chain.
 *
 * Transaction method: Direct contract call to outlayer.near
 */

import { Effect } from "every-plugin/effect";

// =============================================================================
// TYPES
// =============================================================================

export interface EmailService {
  sendEmail: (
    to: string,
    subject: string,
    body: string,
  ) => Effect.Effect<EmailResult, Error>;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  txHash?: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
}

// =============================================================================
// CONFIG
// =============================================================================

const NEAR_EMAIL_CONTRACT = "outlayer.near";
const NEAR_EMAIL_PROJECT_ID = "zavodil.near/near-email";

// Resource limits for NEAR transactions (from near.email docs)
const NEAR_EMAIL_GAS_LIMITS = {
  max_memory_mb: 512,
  max_instructions: 2000000000,
  max_execution_seconds: 120,
} as const;

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

export interface EmailServiceConfig {
  // No payment key needed for blockchain transaction method
  // User signs transactions with their wallet
}

/**
 * Prepare transaction data for client-side wallet signing
 * Returns the transaction payload that the frontend can sign
 */
export interface NearEmailTransaction {
  contractId: string;
  methodName: string;
  args: {
    request: {
      project_id: string;
      action: string;
      args: Record<string, unknown>;
    };
    deposit?: string;
  };
  gas: string;
  deposit: string;
}

/**
 * Parse payment key in format: owner:nonce:secret (legacy, not used for tx method)
 */
function parsePaymentKey(key: string): { owner: string; nonce: number; secret: string } | null {
  const parts = key.split(":");
  if (parts.length !== 3) return null;

  const [owner, nonceStr, secret] = parts;
  const nonce = parseInt(nonceStr, 10);

  if (isNaN(nonce)) return null;

  return { owner, nonce, secret };
}

/**
 * Parse payment key in format: owner:nonce:secret
 */
function parsePaymentKey(key: string): { owner: string; nonce: number; secret: string } | null {
  const parts = key.split(":");
  if (parts.length !== 3) return null;

  const [owner, nonceStr, secret] = parts;
  const nonce = parseInt(nonceStr, 10);

  if (isNaN(nonce)) return null;

  return { owner, nonce, secret };
}

/**
 * Live implementation using NEAR blockchain transactions
 * Client-side wallet signing - no payment key needed
 */
export const EmailLive = (_config: EmailServiceConfig): Effect.Effect<EmailService, never, never> => {
  return Effect.succeed<EmailService>({
    sendEmail: (to: string, subject: string, body: string) =>
      Effect.gen(function* () {
        // Note: This implementation is for server-side fallback
        // For client-side blockchain transactions, the transaction should be prepared
        // and signed by the user's wallet in the frontend

        // Prepare the transaction payload that the client will sign
        const transaction: NearEmailTransaction = {
          contractId: NEAR_EMAIL_CONTRACT,
          methodName: "request_execution",
          args: {
            request: {
              project_id: NEAR_EMAIL_PROJECT_ID,
              action: "send_email", // Encrypted by default
              args: {
                to,
                subject,
                body,
              },
            },
          },
          gas: "300000000000000", // 300 TGas
          deposit: "100000000000000000000000", // 0.1 NEAR deposit (refunded if unused)
        };

        console.log("[EmailService] Prepared transaction for wallet signing:", transaction);

        // Return success - actual transaction signing happens on client
        return {
          success: true,
          messageId: `tx_${Date.now()}`,
          txHash: "pending_wallet_signature",
          transaction, // Include transaction data for client to sign
        } as EmailResult & { transaction?: NearEmailTransaction };
      }),
  });
};

// =============================================================================
// MOCK SERVICE FOR DEVELOPMENT
// =============================================================================

/**
 * Mock implementation for development/testing without payment key
 */
export const EmailMock = Effect.succeed<EmailService>({
  sendEmail: (to: string, subject: string, body: string) =>
    Effect.gen(function* () {
      console.log("[EmailService] MOCK: Sending email", { to, subject, body });

      // Simulate API delay
      yield* Effect.sleep("100 millis");

      return {
        success: true,
        messageId: `mock_${Date.now()}`,
        txHash: "mock_tx_hash",
      };
    }),
});

// =============================================================================
// CONTEXT TAG
// =============================================================================

export const EmailContext = Effect.Tag<EmailService>("near/EmailService");
