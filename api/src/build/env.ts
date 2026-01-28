/**
 * Environment variables utilities
 */

/**
 * Get environment variable with optional default value
 */
export function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  return value;
}

/**
 * Get optional environment variable
 */
export function getOptionalEnvVar(key: string): string | undefined {
  return process.env[key];
}

/**
 * NEARBlocks API key
 */
export const NEARBLOCKS_API_KEY = getOptionalEnvVar('NEARBLOCKS_API_KEY');
