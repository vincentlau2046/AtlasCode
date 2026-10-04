/**
 * OpenAI-protocol 客户端工厂 — 从旧仓 modelprovider/clients.ts 迁入
 *
 * 按 (provider|baseURL|apiKey) 缓存客户端；maxRetries: 0（重试在 Provider 层）。
 */

import OpenAI from 'openai'
import { buildUserAgent } from '../shared'
import type { ResolvedModel } from './roles'
import { LLM_TIMEOUT_DEFAULT_MS } from './constants'

type OpenAIClient = InstanceType<typeof OpenAI>

const clientCache = new Map<string, OpenAIClient>()

function clientCacheKey(provider: string, baseURL: string | undefined, apiKey: string | undefined): string {
  return provider + '|' + (baseURL || '') + '|' + (apiKey || '')
}

/** Get (or lazily create and cache) a per-model OpenAI client. */
export function getClientForEntry(entry: ResolvedModel): OpenAIClient {
  const key = clientCacheKey(entry.provider, entry.baseURL, entry.apiKey)
  let client = clientCache.get(key)
  if (client) {
    return client
  }
  client = new OpenAI({
    baseURL: entry.baseURL,
    apiKey: entry.apiKey,
    maxRetries: 0,
    // #260：客户端缺省对齐 LLM_TIMEOUT_DEFAULT_MS（per-request timeout 逐请求胜）
    timeout: LLM_TIMEOUT_DEFAULT_MS,
    // #272：出站 UA 品牌串（AtlasCode/<v> (+repo)），经 shared 叶子取，覆盖 SDK 默认 OpenAI/JS
    defaultHeaders: { 'User-Agent': buildUserAgent() },
  })
  clientCache.set(key, client)
  return client
}
