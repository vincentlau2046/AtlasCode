/**
 * modelprovider 域错误消息层单测 — getAssistantMessageFromError + getErrorMessageIfRefusal + 文案 getters
 *
 * 端口注册式：getAssistantMessageFromError 需宿主注册 ErrorMessagingPorts。
 * 测试注册 mock createApiErrorMessage 端口，验分支逻辑。
 * 无网络/无磁盘/无 PTY。
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import {
  APIError,
  APIConnectionError,
  APIConnectionTimeoutError,
} from "../../src/modelprovider/types"
import type { AssistantMessage } from "../../src/shared"
import {
  registerErrorMessagingPorts,
  resetErrorMessagingPorts,
  getAssistantMessageFromError,
  getErrorMessageIfRefusal,
  getPdfTooLargeErrorMessage,
  getPdfPasswordProtectedErrorMessage,
  getImageTooLargeErrorMessage,
  getRequestTooLargeErrorMessage,
  getTokenRevokedErrorMessage,
} from "../../src/modelprovider/errorMessaging"

// ── mock 端口注册 ──────────────────────────────────────────────────

function makeMockPorts(overrides?: {
  isNonInteractive?: () => boolean
}) {
  const calls: { content: string; error?: string; errorDetails?: string }[] =
    []
  const ports = {
    createApiErrorMessage: (input: {
      content: string
      error?: string
      errorDetails?: string
    }): AssistantMessage => {
      calls.push(input)
      return {
        role: "assistant",
        content: [{ type: "text", text: input.content }],
        error: input.error,
      } as unknown as AssistantMessage
    },
    isNonInteractive: overrides?.isNonInteractive ?? (() => false),
  }
  return { ports, calls }
}

beforeEach(() => {
  resetErrorMessagingPorts()
})

afterEach(() => {
  resetErrorMessagingPorts()
})

describe("getAssistantMessageFromError — 基础分支", () => {
  test("timeout → API_TIMEOUT_ERROR_MESSAGE", () => {
    const { ports, calls } = makeMockPorts()
    registerErrorMessagingPorts(ports)
    getAssistantMessageFromError(
      new APIConnectionTimeoutError("timed out"),
      "test-model",
    )
    expect(calls).toHaveLength(1)
    expect(calls[0].content).toBe("Request timed out")
    expect(calls[0].error).toBe("unknown")
  })

  test("APIConnectionError with timeout message → timeout 分支", () => {
    const { ports, calls } = makeMockPorts()
    registerErrorMessagingPorts(ports)
    getAssistantMessageFromError(
      new APIConnectionError("connection timeout occurred"),
      "test-model",
    )
    expect(calls[0].content).toBe("Request timed out")
  })

  test("prompt too long → PROMPT_TOO_LONG", () => {
    const { ports, calls } = makeMockPorts()
    registerErrorMessagingPorts(ports)
    getAssistantMessageFromError(
      new Error("the prompt is too long for this model"),
      "test-model",
    )
    expect(calls[0].content).toBe("Prompt is too long")
    expect(calls[0].error).toBe("invalid_request")
  })

  test("PDF too large → getPdfTooLargeErrorMessage", () => {
    const { ports, calls } = makeMockPorts()
    registerErrorMessagingPorts(ports)
    getAssistantMessageFromError(
      new Error("maximum of 200 PDF pages exceeded"),
      "test-model",
    )
    expect(calls[0].content).toContain("PDF too large")
  })

  test("PDF password protected", () => {
    const { ports, calls } = makeMockPorts()
    registerErrorMessagingPorts(ports)
    getAssistantMessageFromError(
      new Error("The PDF specified is password protected"),
      "test-model",
    )
    expect(calls[0].content).toContain("password protected")
  })

  test("PDF invalid", () => {
    const { ports, calls } = makeMockPorts()
    registerErrorMessagingPorts(ports)
    getAssistantMessageFromError(
      new Error("The PDF specified was not valid"),
      "test-model",
    )
    expect(calls[0].content).toContain("not valid")
  })

  test("image exceeds maximum", () => {
    const { ports, calls } = makeMockPorts()
    registerErrorMessagingPorts(ports)
    getAssistantMessageFromError(
      new APIError("image exceeds maximum size", 400),
      "test-model",
    )
    expect(calls[0].content).toContain("Image was too large")
  })

  test("413 request too large", () => {
    const { ports, calls } = makeMockPorts()
    registerErrorMessagingPorts(ports)
    getAssistantMessageFromError(
      new APIError("payload too large", 413),
      "test-model",
    )
    expect(calls[0].content).toContain("Request too large")
  })

  test("credit balance too low", () => {
    const { ports, calls } = makeMockPorts()
    registerErrorMessagingPorts(ports)
    getAssistantMessageFromError(
      new Error("Your credit balance is too low"),
      "test-model",
    )
    expect(calls[0].content).toContain("Credit balance")
    expect(calls[0].error).toBe("billing_error")
  })

  test("404 model not found", () => {
    const { ports, calls } = makeMockPorts()
    registerErrorMessagingPorts(ports)
    getAssistantMessageFromError(
      new APIError("model not found", 404),
      "test-model",
    )
    expect(calls[0].content).toContain("test-model")
    expect(calls[0].content).toContain("/model")
  })

  test("APIConnectionError → formatAPIError 消息", () => {
    const { ports, calls } = makeMockPorts()
    registerErrorMessagingPorts(ports)
    getAssistantMessageFromError(
      new APIConnectionError("Connection error."),
      "test-model",
    )
    expect(calls[0].content).toContain("API Error")
    expect(calls[0].content).toContain("Unable to connect")
  })

  test("plain Error → 原始消息", () => {
    const { ports, calls } = makeMockPorts()
    registerErrorMessagingPorts(ports)
    getAssistantMessageFromError(new Error("boom"), "test-model")
    expect(calls[0].content).toBe("API Error: boom")
  })

  test("非 Error → prefix only", () => {
    const { ports, calls } = makeMockPorts()
    registerErrorMessagingPorts(ports)
    getAssistantMessageFromError("string", "test-model")
    expect(calls[0].content).toBe("API Error")
  })
})

describe("getAssistantMessageFromError — tool_use 分支", () => {
  test("tool_use mismatch → concurrency issues", () => {
    const { ports, calls } = makeMockPorts()
    registerErrorMessagingPorts(ports)
    getAssistantMessageFromError(
      new APIError(
        "`tool_use` ids were found without `tool_result` blocks immediately after",
        400,
      ),
      "test-model",
    )
    expect(calls[0].content).toContain("concurrency issues")
    expect(calls[0].content).toContain("/rewind")
  })

  test("duplicate tool_use id", () => {
    const { ports, calls } = makeMockPorts()
    registerErrorMessagingPorts(ports)
    getAssistantMessageFromError(
      new APIError("`tool_use` ids must be unique", 400),
      "test-model",
    )
    expect(calls[0].content).toContain("duplicate tool_use ID")
  })
})

describe("getAssistantMessageFromError — 非交互模式", () => {
  test("非交互 → tool_use 无 /rewind 指令", () => {
    const { ports, calls } = makeMockPorts({
      isNonInteractive: () => true,
    })
    registerErrorMessagingPorts(ports)
    getAssistantMessageFromError(
      new APIError("`tool_use` ids must be unique", 400),
      "test-model",
    )
    expect(calls[0].content).not.toContain("/rewind")
  })

  test("非交互 → 404 用 --model 非 /model", () => {
    const { ports, calls } = makeMockPorts({
      isNonInteractive: () => true,
    })
    registerErrorMessagingPorts(ports)
    getAssistantMessageFromError(
      new APIError("not found", 404),
      "test-model",
    )
    expect(calls[0].content).toContain("--model")
    expect(calls[0].content).not.toContain("/model")
  })
})

describe("getErrorMessageIfRefusal", () => {
  test("refusal → 返回 AssistantMessage", () => {
    const { ports } = makeMockPorts()
    registerErrorMessagingPorts(ports)
    const result = getErrorMessageIfRefusal("refusal", "test-model")
    expect(result).toBeDefined()
  })

  test("非 refusal → undefined", () => {
    const { ports } = makeMockPorts()
    registerErrorMessagingPorts(ports)
    expect(getErrorMessageIfRefusal("end_turn", "test-model")).toBeUndefined()
    expect(getErrorMessageIfRefusal(null, "test-model")).toBeUndefined()
  })
})

describe("文案 getters — 交互 vs 非交互", () => {
  test("getPdfTooLargeErrorMessage — 交互含 esc", () => {
    resetErrorMessagingPorts()
    // 无端口注册 → isNonInteractive 默认 false
    expect(getPdfTooLargeErrorMessage()).toContain("esc")
  })

  test("getPdfTooLargeErrorMessage — 非交互含 pdftotext", () => {
    const { ports } = makeMockPorts({
      isNonInteractive: () => true,
    })
    registerErrorMessagingPorts(ports)
    const msg = getPdfTooLargeErrorMessage()
    expect(msg).toContain("pdftotext")
    expect(msg).not.toContain("esc")
  })

  test("getPdfPasswordProtectedErrorMessage — 交互", () => {
    resetErrorMessagingPorts()
    expect(getPdfPasswordProtectedErrorMessage()).toContain("esc")
  })

  test("getImageTooLargeErrorMessage — 交互", () => {
    resetErrorMessagingPorts()
    expect(getImageTooLargeErrorMessage()).toContain("esc")
  })

  test("getRequestTooLargeErrorMessage — 交互", () => {
    resetErrorMessagingPorts()
    expect(getRequestTooLargeErrorMessage()).toContain("esc")
  })

  test("getTokenRevokedErrorMessage — 交互含 /login", () => {
    resetErrorMessagingPorts()
    expect(getTokenRevokedErrorMessage()).toContain("/login")
  })
})

describe("端口注册守卫", () => {
  test("未注册 createApiErrorMessage → throw", () => {
    resetErrorMessagingPorts()
    expect(() =>
      getAssistantMessageFromError(new Error("boom"), "test-model"),
    ).toThrow("ErrorMessagingPorts")
  })
})
