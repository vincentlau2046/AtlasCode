/**
 * Atlas API key storage — environment variable based.
 * Replaces macOS Keychain OAuth token management.
 */
export function getApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY
}

export function getGatewayUrl(): string | undefined {
  return process.env.OPENAI_BASE_URL
}
