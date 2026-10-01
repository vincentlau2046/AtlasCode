/**
 * Environment variables for the direct (OpenAI-protocol) client:
 *
 * Direct API:
 * - OPENAI_API_KEY: API key for the gateway/endpoint
 * - OPENAI_BASE_URL: gateway base URL (默认: http://127.0.0.1:8999)
 *
 * P3 note: the AWS Bedrock / GCP Vertex / Azure Foundry client branches were
 * removed in the de-Claude-ification cleanup — model routing now goes through
 * the shared modelProvider (core/modelprovider) + the modelRoles registry
 * (now in core/modelprovider/roles.js). The legacy getAtlasClient wrapper was removed;
 * only the custom-headers helper and the client-request-id header const remain.
 */

// H14: built-in (reserved) headers that custom headers must not override
const RESERVED_HEADERS = new Set(['x-app', 'user-agent', 'x-claude-code-session-id'])
// H14: a valid HTTP token (RFC 7230) for header names
const HEADER_NAME_RE = /^[A-Za-z0-9-]+$/
const MAX_CUSTOM_HEADERS = 8

export function getCustomHeaders(): Record<string, string> {
  const customHeaders: Record<string, string> = {}
  const customHeadersEnv = process.env.ATLAS_CUSTOM_HEADERS
  if (!customHeadersEnv) return customHeaders

  // Split by newlines to support multiple headers
  const headerStrings = customHeadersEnv.split(/\n|\r\n/)

  let count = 0
  for (const headerString of headerStrings) {
    if (!headerString.trim()) continue
    if (count >= MAX_CUSTOM_HEADERS) break

    // Parse header in format "Name: Value" (curl style). Split on first `:`
    const colonIdx = headerString.indexOf(':')
    if (colonIdx === -1) continue
    const name = headerString.slice(0, colonIdx).trim()
    const value = headerString.slice(colonIdx + 1).trim()
    if (!name) continue
    // H14: name must be a valid token; reject whitespace/quotes/newlines in the name
    if (!HEADER_NAME_RE.test(name)) continue
    // H14: reserved built-in headers are not overridden by custom ones
    if (RESERVED_HEADERS.has(name.toLowerCase())) continue
    // H14: strip CR/LF from the value to prevent CRLF header injection
    customHeaders[name] = value.replace(/[\r\n]/g, '')
    count++
  }

  return customHeaders
}

export const CLIENT_REQUEST_ID_HEADER = 'x-client-request-id'
