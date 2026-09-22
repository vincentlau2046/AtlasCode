/**
 * modelprovider 域错误分类单测 — classifyAPIError + categorizeRetryableAPIError
 *
 * 纯函数测试：构造 APIError 类族实例，验分类返回值。
 * 无网络/无磁盘/无 PTY。
 */
import { describe, test, expect } from "bun:test"
import {
  APIError,
  APIConnectionError,
  APIConnectionTimeoutError,
} from "../../src/modelprovider/types"
import {
  classifyAPIError,
  categorizeRetryableAPIError,
  startsWithApiErrorPrefix,
  isValidAPIMessage,
  API_ERROR_MESSAGE_PREFIX,
  REPEATED_529_ERROR_MESSAGE,
} from "../../src/modelprovider/modelErrors"

describe("classifyAPIError", () => {
  test("aborted — Request was aborted.", () => {
    expect(classifyAPIError(new Error("Request was aborted."))).toBe("aborted")
  })

  test("api_timeout — APIConnectionTimeoutError", () => {
    expect(classifyAPIError(new APIConnectionTimeoutError("timeout"))).toBe(
      "api_timeout",
    )
  })

  test("api_timeout — APIConnectionError with timeout message", () => {
    expect(
      classifyAPIError(new APIConnectionError("Connection timeout")),
    ).toBe("api_timeout")
  })

  test("repeated_529", () => {
    expect(
      classifyAPIError(new Error(REPEATED_529_ERROR_MESSAGE)),
    ).toBe("repeated_529")
  })

  test("rate_limit — 429", () => {
    expect(classifyAPIError(new APIError("rate limited", 429))).toBe(
      "rate_limit",
    )
  })

  test("server_overload — 529", () => {
    expect(classifyAPIError(new APIError("overloaded", 529))).toBe(
      "server_overload",
    )
  })

  test("server_overload — overloaded_error type", () => {
    expect(
      classifyAPIError(
        new APIError('{"type":"overloaded_error"}', 500),
      ),
    ).toBe("server_overload")
  })

  test("prompt_too_long", () => {
    expect(classifyAPIError(new Error("Prompt is too long"))).toBe(
      "prompt_too_long",
    )
  })

  test("pdf_too_large", () => {
    expect(
      classifyAPIError(new Error("maximum of 100 PDF pages exceeded")),
    ).toBe("pdf_too_large")
  })

  test("pdf_password_protected", () => {
    expect(
      classifyAPIError(
        new Error("The PDF specified is password protected"),
      ),
    ).toBe("pdf_password_protected")
  })

  test("image_too_large — image exceeds maximum", () => {
    expect(
      classifyAPIError(
        new APIError("image exceeds maximum size", 400),
      ),
    ).toBe("image_too_large")
  })

  test("image_too_large — image dimensions exceed many-image", () => {
    expect(
      classifyAPIError(
        new APIError("image dimensions exceed many-image limit", 400),
      ),
    ).toBe("image_too_large")
  })

  test("tool_use_mismatch", () => {
    expect(
      classifyAPIError(
        new APIError(
          "`tool_use` ids were found without `tool_result` blocks immediately after",
          400,
        ),
      ),
    ).toBe("tool_use_mismatch")
  })

  test("unexpected_tool_result", () => {
    expect(
      classifyAPIError(
        new APIError(
          "unexpected `tool_use_id` found in `tool_result`",
          400,
        ),
      ),
    ).toBe("unexpected_tool_result")
  })

  test("duplicate_tool_use_id", () => {
    expect(
      classifyAPIError(
        new APIError("`tool_use` ids must be unique", 400),
      ),
    ).toBe("duplicate_tool_use_id")
  })

  test("invalid_model", () => {
    expect(
      classifyAPIError(new APIError("invalid model name", 400)),
    ).toBe("invalid_model")
  })

  test("credit_balance_low", () => {
    expect(
      classifyAPIError(new Error("Credit balance is too low")),
    ).toBe("credit_balance_low")
  })

  test("invalid_api_key — x-api-key", () => {
    expect(
      classifyAPIError(new Error("invalid x-api-key provided")),
    ).toBe("invalid_api_key")
  })

  test("token_revoked", () => {
    expect(
      classifyAPIError(
        new APIError("OAuth token has been revoked", 403),
      ),
    ).toBe("token_revoked")
  })

  test("oauth_org_not_allowed", () => {
    expect(
      classifyAPIError(
        new APIError(
          "OAuth authentication is currently not allowed for this organization",
          401,
        ),
      ),
    ).toBe("oauth_org_not_allowed")
  })

  test("auth_error — 401", () => {
    expect(classifyAPIError(new APIError("unauthorized", 401))).toBe(
      "auth_error",
    )
  })

  test("auth_error — 403", () => {
    expect(classifyAPIError(new APIError("forbidden", 403))).toBe(
      "auth_error",
    )
  })

  test("server_error — 500", () => {
    expect(classifyAPIError(new APIError("internal", 500))).toBe(
      "server_error",
    )
  })

  test("client_error — 400", () => {
    expect(classifyAPIError(new APIError("bad request", 400))).toBe(
      "client_error",
    )
  })

  test("connection_error — APIConnectionError", () => {
    expect(classifyAPIError(new APIConnectionError("Connection error."))).toBe(
      "connection_error",
    )
  })

  test("unknown — non-Error", () => {
    expect(classifyAPIError("string error")).toBe("unknown")
  })

  test("unknown — plain Error", () => {
    expect(classifyAPIError(new Error("something"))).toBe("unknown")
  })
})

describe("categorizeRetryableAPIError", () => {
  test("529 → rate_limit", () => {
    expect(categorizeRetryableAPIError(new APIError("overloaded", 529))).toBe(
      "rate_limit",
    )
  })

  test("429 → rate_limit", () => {
    expect(categorizeRetryableAPIError(new APIError("rate limited", 429))).toBe(
      "rate_limit",
    )
  })

  test("401 → authentication_failed", () => {
    expect(
      categorizeRetryableAPIError(new APIError("unauthorized", 401)),
    ).toBe("authentication_failed")
  })

  test("403 → authentication_failed", () => {
    expect(
      categorizeRetryableAPIError(new APIError("forbidden", 403)),
    ).toBe("authentication_failed")
  })

  test("503 → server_error", () => {
    expect(
      categorizeRetryableAPIError(new APIError("unavailable", 503)),
    ).toBe("server_error")
  })

  test("400 → unknown", () => {
    expect(
      categorizeRetryableAPIError(new APIError("bad request", 400)),
    ).toBe("unknown")
  })
})

describe("startsWithApiErrorPrefix", () => {
  test("true for API Error prefix", () => {
    expect(startsWithApiErrorPrefix("API Error: something")).toBe(true)
  })

  test("true for login+prefix variant", () => {
    expect(
      startsWithApiErrorPrefix("Please run /login · API Error: something"),
    ).toBe(true)
  })

  test("false for unrelated text", () => {
    expect(startsWithApiErrorPrefix("Hello world")).toBe(false)
  })
})

describe("isValidAPIMessage", () => {
  test("true for well-formed message", () => {
    expect(
      isValidAPIMessage({
        content: [],
        model: "test-model",
        usage: { input_tokens: 10 },
      }),
    ).toBe(true)
  })

  test("false — missing content", () => {
    expect(
      isValidAPIMessage({ model: "test", usage: {} }),
    ).toBe(false)
  })

  test("false — missing model", () => {
    expect(
      isValidAPIMessage({ content: [], usage: {} }),
    ).toBe(false)
  })

  test("false — null", () => {
    expect(isValidAPIMessage(null)).toBe(false)
  })
})

test("API_ERROR_MESSAGE_PREFIX 常量", () => {
  expect(API_ERROR_MESSAGE_PREFIX).toBe("API Error")
})
