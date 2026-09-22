/**
 * modelprovider 域配置单测 — createModelProviderConfig env 读取
 *
 * 纯函数测试：设/清 env，验 fallback + cap + 解析。
 * 无网络/无磁盘/无 PTY。
 */
import { describe, test, expect, afterEach } from "bun:test"
import { createModelProviderConfig } from "../../src/modelprovider/config"

const KEYS = [
  "ATLAS_API_BASE_URL",
  "ATLAS_LLM_TIMEOUT",
  "ATLAS_MAX_OUTPUT_TOKENS",
  "ATLAS_MAX_RETRIES",
  "ATLAS_EXTRA_BODY",
  "ATLAS_EXTRA_METADATA",
  "ATLAS_CUSTOM_HEADERS",
]

afterEach(() => {
  for (const k of KEYS) delete process.env[k]
})

describe("createModelProviderConfig — fallback 值", () => {
  test("全未设 → 默认值", () => {
    const cfg = createModelProviderConfig()
    expect(cfg.apiBaseUrl).toBeUndefined()
    expect(cfg.llmTimeoutMs).toBe(120_000)
    expect(cfg.maxOutputTokens).toBe(32_768)
    expect(cfg.maxRetries).toBe(3)
    expect(cfg.extraBody).toBeUndefined()
    expect(cfg.extraMetadata).toBeUndefined()
    expect(cfg.customHeaders).toBeUndefined()
  })
})

describe("createModelProviderConfig — env 读取", () => {
  test("apiBaseUrl 直读", () => {
    process.env.ATLAS_API_BASE_URL = "https://gateway.example.com/v1"
    expect(createModelProviderConfig().apiBaseUrl).toBe(
      "https://gateway.example.com/v1",
    )
  })

  test("llmTimeoutMs — 有效值", () => {
    process.env.ATLAS_LLM_TIMEOUT = "60000"
    expect(createModelProviderConfig().llmTimeoutMs).toBe(60_000)
  })

  test("llmTimeoutMs — cap 1_800_000", () => {
    process.env.ATLAS_LLM_TIMEOUT = "999999999"
    expect(createModelProviderConfig().llmTimeoutMs).toBe(1_800_000)
  })

  test("llmTimeoutMs — 无效 → fallback", () => {
    process.env.ATLAS_LLM_TIMEOUT = "not-a-number"
    expect(createModelProviderConfig().llmTimeoutMs).toBe(120_000)
  })

  test("llmTimeoutMs — 0 → fallback", () => {
    process.env.ATLAS_LLM_TIMEOUT = "0"
    expect(createModelProviderConfig().llmTimeoutMs).toBe(120_000)
  })

  test("maxOutputTokens — 有效值", () => {
    process.env.ATLAS_MAX_OUTPUT_TOKENS = "8192"
    expect(createModelProviderConfig().maxOutputTokens).toBe(8192)
  })

  test("maxOutputTokens — cap 2_000_000", () => {
    process.env.ATLAS_MAX_OUTPUT_TOKENS = "99999999"
    expect(createModelProviderConfig().maxOutputTokens).toBe(2_000_000)
  })

  test("maxRetries — 有效值", () => {
    process.env.ATLAS_MAX_RETRIES = "5"
    expect(createModelProviderConfig().maxRetries).toBe(5)
  })

  test("maxRetries — cap 20", () => {
    process.env.ATLAS_MAX_RETRIES = "100"
    expect(createModelProviderConfig().maxRetries).toBe(20)
  })
})

describe("createModelProviderConfig — JSON env", () => {
  test("extraBody — 有效 JSON", () => {
    process.env.ATLAS_EXTRA_BODY = '{"temperature":0.5}'
    const cfg = createModelProviderConfig()
    expect(cfg.extraBody).toEqual({ temperature: 0.5 })
  })

  test("extraBody — 无效 JSON → undefined", () => {
    process.env.ATLAS_EXTRA_BODY = "not-json"
    expect(createModelProviderConfig().extraBody).toBeUndefined()
  })

  test("extraBody — 数组 → undefined", () => {
    process.env.ATLAS_EXTRA_BODY = "[1,2,3]"
    expect(createModelProviderConfig().extraBody).toBeUndefined()
  })

  test("extraMetadata — 有效 JSON", () => {
    process.env.ATLAS_EXTRA_METADATA = '{"traceId":"abc"}'
    expect(createModelProviderConfig().extraMetadata).toEqual({
      traceId: "abc",
    })
  })
})

describe("createModelProviderConfig — customHeaders", () => {
  test("JSON 形式", () => {
    process.env.ATLAS_CUSTOM_HEADERS = '{"X-Custom":"value"}'
    expect(createModelProviderConfig().customHeaders).toEqual({
      "X-Custom": "value",
    })
  })

  test("Key: Value 逐行形式", () => {
    process.env.ATLAS_CUSTOM_HEADERS = "X-Api-Key: secret\nX-Trace: id123"
    expect(createModelProviderConfig().customHeaders).toEqual({
      "X-Api-Key": "secret",
      "X-Trace": "id123",
    })
  })

  test("空字符串 → undefined", () => {
    process.env.ATLAS_CUSTOM_HEADERS = ""
    expect(createModelProviderConfig().customHeaders).toBeUndefined()
  })

  test("无冒号行 → 跳过", () => {
    process.env.ATLAS_CUSTOM_HEADERS = "no-colon-here"
    expect(createModelProviderConfig().customHeaders).toBeUndefined()
  })
})
