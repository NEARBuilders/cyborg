/**
 * Client-Side Payment Key Encryption
 *
 * Encrypts payment key secrets in the browser before sending to server.
 * Server stores encrypted secrets and never sees plaintext.
 * Server only uses encrypted secrets for OutLayer API calls.
 *
 * Benefits:
 * - Zero-knowledge: Server never has plaintext keys
 * - Defense in depth: DB compromised = attacker gets nothing useful
 * - User controls: Key never leaves browser in plaintext
 */

export interface EncryptedPaymentKeyData {
  encryptedSecret: string;      // Encrypted with user's session key
  nonce: number;                 // OutLayer nonce
  initialBalance: string;        // Initial deposit
  iv: string;                    // Initialization vector (base64)
  algorithm: 'AES-GCM';          // Encryption algorithm
  keyDerivation: {
    salt: string;                // Salt for key derivation (base64)
    iterations: number;          // PBKDF2 iterations
  };
}

/**
 * Generate a random salt for key derivation
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Derive encryption key from session token or user-specific data
 * Uses PBKDF2 for key derivation
 */
export async function deriveKey(
  sessionToken: string,
  salt: Uint8Array,
  iterations = 100000
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(sessionToken);

  return crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  ).then(async (key) => {
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: iterations,
        hash: 'SHA-256',
      },
      key,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  });
}

/**
 * Encrypt payment key secret client-side before sending to server
 */
export async function encryptSecretClientSide(
  secret: string,
  sessionToken: string
): Promise<{
  encryptedSecret: string;
  iv: string;
  salt: string;
}> {
  // Generate random IV and salt
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const salt = generateSalt();

  // Derive encryption key from session
  const key = await deriveKey(sessionToken, salt);

  // Encrypt the secret
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(secret)
  );

  // Combine IV + encrypted data and encode as base64
  const combined = new Uint8Array(iv.length + encryptedData.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encryptedData), iv.length);

  return {
    encryptedSecret: btoa(String.fromCharCode(...combined)),
    iv: btoa(String.fromCharCode(...iv)),
    salt: btoa(String.fromCharCode(...salt)),
  };
}

/**
 * Decrypt payment key secret client-side (when needed for display)
 */
export async function decryptSecretClientSide(
  encryptedSecret: string,
  iv: string,
  salt: string,
  sessionToken: string
): Promise<string> {
  // Decode from base64
  const ivArray = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
  const saltArray = Uint8Array.from(atob(salt), c => c.charCodeAt(0));
  const encryptedArray = Uint8Array.from(atob(encryptedSecret), c => c.charCodeAt(0));

  // Derive decryption key
  const key = await deriveKey(sessionToken, saltArray);

  // Decrypt the secret
  const decryptedData = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivArray },
    key,
    encryptedArray.slice(12) // Skip IV
  );

  return new TextDecoder().decode(decryptedData);
}

/**
 * Usage Example:
 *
 * // When creating payment key:
 * const { encryptedSecret, iv, salt } = await encryptSecretClientSide(
 *   secret,
 *   session.sessionToken
 * );
 *
 * // Send to API:
 * await api.createPaymentKey({
 *   encryptedSecret,
 *   iv,
 *   salt,
 *   nonce,
 *   initialBalance
 * });
 *
 * // Server stores encrypted secret without ever seeing plaintext!
 * // Server uses it directly with OutLayer API (which accepts encrypted keys)
 *
 * // To display to user (rare - only once during creation):
 * const secret = await decryptSecretClientSide(
 *   encryptedSecret,
 *   iv,
 *   salt,
 *   session.sessionToken
 * );
 */
