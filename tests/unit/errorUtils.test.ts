/**
 * modelprovider 域错误工具单测 — extractConnectionErrorDetails + formatAPIError + getSSLErrorHint
 *
 * 纯函数测试：构造带 code/cause 的 Error，验提取/格式化。
 * 无网络/无磁盘/无 PTY。
 */
import { describe, test, expect } from "bun:test"
import {
  APIError,
  APIConnectionError,
  extractConnectionErrorDetails,
  formatAPIError,
  getSSLErrorHint,
  sanitizeAPIError,
} from "../../src/modelprovider"

describe("extractConnectionErrorDetails", () => {
  test("null → null", () => {
    expect(extractConnectionErrorDetails(null)).toBeNull()
  })

  test("非对象 → null", () => {
    expect(extractConnectionErrorDetails("string")).toBeNull()
  })

  test("Error 带 code → 提取", () => {
    const err = new Error("test") as Error & { code: string }
    err.code = "ETIMEDOUT"
    const details = extractConnectionErrorDetails(err)
    expect(details).not.toBeNull()
    expect(details!.code).toBe("ETIMEDOUT")
    expect(details!.isSSLError).toBe(false)
  })

  test("SSL error code → isSSLError=true", () => {
    const err = new Error("ssl") as Error & { code: string }
    err.code = "CERT_HAS_EXPIRED"
    const details = extractConnectionErrorDetails(err)
    expect(details!.isSSLError).toBe(true)
  })

  test("SELF_SIGNED_CERT_IN_CHAIN → isSSLError=true", () => {
    const err = new Error("self signed") as Error & { code: string }
    err.code = "SELF_SIGNED_CERT_IN_CHAIN"
    expect(extractConnectionErrorDetails(err)!.isSSLError).toBe(true)
  })

  test("cause 链 → 深度提取", () => {
    const root = new Error("root") as Error & { code: string }
    root.code = "DEPTH_ZERO_SELF_SIGNED_CERT"
    const mid = new Error("mid", { cause: root })
    const top = new Error("top", { cause: mid })
    const details = extractConnectionErrorDetails(top)
    expect(details!.code).toBe("DEPTH_ZERO_SELF_SIGNED_CERT")
    expect(details!.isSSLError).toBe(true)
  })

  test("cause 链超 5 层 → null", () => {
    let err: Error = new Error("no code")
    for (let i = 0; i < 6; i++) {
      err = new Error(`layer ${i}`, { cause: err })
    }
    // 6 层无 code → null
    expect(extractConnectionErrorDetails(err)).toBeNull()
  })
})

describe("formatAPIError", () => {
  test("ETIMEDOUT → timeout 消息", () => {
    const err = new APIConnectionError("Connection error.") as APIError & {
      code: string
    }
    err.code = "ETIMEDOUT"
    expect(formatAPIError(err)).toContain("Request timed out")
  })

  test("CERT_HAS_EXPIRED → expired 消息", () => {
    const err = new APIConnectionError("Connection error.") as APIError & {
      code: string
    }
    err.code = "CERT_HAS_EXPIRED"
    const msg = formatAPIError(err)
    expect(msg).toContain("SSL certificate has expired")
  })

  test("SELF_SIGNED_CERT_IN_CHAIN → self-signed 消息", () => {
    const err = new APIConnectionError("Connection error.") as APIError & {
      code: string
    }
    err.code = "SELF_SIGNED_CERT_IN_CHAIN"
    expect(formatAPIError(err)).toContain("Self-signed certificate")
  })

  test("Connection error. 无 code → 通用消息", () => {
    const err = new APIConnectionError("Connection error.")
    expect(formatAPIError(err)).toContain("Unable to connect to API")
  })

  test("空 message + 嵌套 error → 提取嵌套", () => {
    const err = new APIError("", 500, {
      error: { message: "nested detail" },
    })
    expect(formatAPIError(err)).toBe("nested detail")
  })

  test("空 message 无嵌套 → status fallback", () => {
    const err = new APIError("", 418)
    expect(formatAPIError(err)).toContain("418")
  })

  test("正常 message → 原样返回", () => {
    const err = new APIError("Something went wrong", 400)
    expect(formatAPIError(err)).toBe("Something went wrong")
  })

  test("HTML message → 提取 title", () => {
    const html =
      "<!DOCTYPE html><html><head><title>Server Error</title></head></html>"
    const err = new APIError(html, 502)
    expect(formatAPIError(err)).toBe("Server Error")
  })
})

describe("getSSLErrorHint", () => {
  test("SSL error → hint 含 NODE_EXTRA_CA_CERTS", () => {
    const err = new Error("ssl") as Error & { code: string }
    err.code = "CERT_HAS_EXPIRED"
    const hint = getSSLErrorHint(err)
    expect(hint).not.toBeNull()
    expect(hint!).toContain("NODE_EXTRA_CA_CERTS")
  })

  test("非 SSL error → null", () => {
    const err = new Error("not ssl") as Error & { code: string }
    err.code = "ETIMEDOUT"
    expect(getSSLErrorHint(err)).toBeNull()
  })

  test("无 code → null", () => {
    expect(getSSLErrorHint(new Error("plain"))).toBeNull()
  })
})

describe("sanitizeAPIError", () => {
  test("HTML → 提取 title", () => {
    const err = new APIError(
      "<html><title>Bad Gateway</title></html>",
      502,
    )
    expect(sanitizeAPIError(err)).toBe("Bad Gateway")
  })

  test("非 HTML → 原样", () => {
    const err = new APIError("plain text error", 400)
    expect(sanitizeAPIError(err)).toBe("plain text error")
  })

  test("空 message → 空字符串", () => {
    const err = new APIError("", 400)
    expect(sanitizeAPIError(err)).toBe("")
  })
})
