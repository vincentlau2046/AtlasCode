/**
 * P0b③ 网关不可达给方向不给 mood（docs/tui-differentiation-spec.md §4 P0b 门禁③）。
 *
 * 被测：gatewayUnreachableRemediationHint（modelprovider 纯 leaf，llmTimeoutRemediationHint
 * 姊妹）+ describeEndpointFailure（0.1.64 PR2 复合逻辑纯函数）。
 *
 * 0.1.64 PR2（去 IFF 硬编码）：hint 串参数化——endpointLabel 复合逻辑传入
 * （本地端口 / 云 provider / 通用 host / 缺省 'LLM 端点'），S-C 三锚点保留
 * （gwDown `{label} 不可达` / gwManual `已切人工确认` / gwDoctor `/doctor 排查`）。
 * 超时 / 用户 abort / 拿到 HTTP 状态（网关可达的业务·鉴权错误）/ 非连接错误 → null
 * （零行为变更）。
 *
 * 判别点：SDK APIConnectionError（"Connection error." 固定文案）+ 网络层 errno
 * （message 或 error.cause.code 上，覆盖 loop-robustness #4 ECONNRESET 链盲区）。
 * 分层纪律：纯函数错误分类（无网络/无盘/无 PTY）。
 */
import { describe, test, expect } from 'bun:test'
import {
  gatewayUnreachableRemediationHint,
  llmTimeoutRemediationHint,
  describeEndpointFailure,
} from '../../src/modelprovider'

/** 构建期望 hint 串（S-C 三锚点：gwDown 参数化 / gwManual / gwDoctor 不变）。 */
const expectedHint = (label: string): string =>
  `${label} 不可达：已切人工确认 —— /doctor 排查`

describe('P0b③ gatewayUnreachableRemediationHint 错误分类', () => {
  describe('命中 → 返回参数化串（S-C 三锚点，endpointLabel 复合逻辑）', () => {
    test('SDK APIConnectionError（openai "Connection error." 文案）+ deepseek label', () => {
      const hint = gatewayUnreachableRemediationHint(
        {
          name: 'APIConnectionError',
          message: 'Connection error.',
        },
        'DeepSeek 服务',
      )
      expect(hint).toBe(expectedHint('DeepSeek 服务'))
    })
    test('仅 message === "Connection error."（无名变体）+ 本地端口 label', () => {
      expect(
        gatewayUnreachableRemediationHint(
          { message: 'Connection error.' },
          '本地端口 8999',
        ),
      ).toBe(expectedHint('本地端口 8999'))
    })
    test('网络 errno 在 message 上（fetch failed）+ 通用 host label', () => {
      expect(
        gatewayUnreachableRemediationHint({ message: 'fetch failed' }, 'api.example.com'),
      ).toBe(expectedHint('api.example.com'))
    })
    test('网络 errno 在 error.cause.code 上（ECONNRESET 链，loop-robustness #4 盲区）', () => {
      const hint = gatewayUnreachableRemediationHint(
        {
          message: 'request to https://gateway failed',
          cause: { code: 'ECONNRESET' },
        },
        'OpenAI 服务',
      )
      expect(hint).toBe(expectedHint('OpenAI 服务'))
    })
    test('endpointLabel 缺省 → "LLM 端点"（向后兼容，无 label 传入）', () => {
      expect(
        gatewayUnreachableRemediationHint({ message: 'fetch failed' }),
      ).toBe(expectedHint('LLM 端点'))
    })
  })

  describe('不命中 → null（零行为变更）', () => {
    test('生成超时 → 归 llmTimeout 面（不叠加误导）', () => {
      const timeoutErr = { name: 'APITimeoutError', message: 'Request timed out.' }
      expect(gatewayUnreachableRemediationHint(timeoutErr, 'DeepSeek 服务')).toBeNull()
      // 对照：llmTimeout 面确实认这类（两提示分工不重叠）
      expect(llmTimeoutRemediationHint(timeoutErr)).not.toBeNull()
    })
    test('用户主动 abort（AbortError）→ 非网关不可达', () => {
      expect(
        gatewayUnreachableRemediationHint({ name: 'AbortError', message: 'aborted' }, 'LLM 端点'),
      ).toBeNull()
      expect(
        gatewayUnreachableRemediationHint({ name: 'APIUserAbortError', message: 'aborted' }, 'LLM 端点'),
      ).toBeNull()
    })
    test('HTTP 5xx（拿到状态 = 网关可达，业务错误）', () => {
      expect(
        gatewayUnreachableRemediationHint(
          { name: 'APIError', message: 'Internal Server Error', status: 500 },
          'DeepSeek 服务',
        ),
      ).toBeNull()
    })
    test('HTTP 401 鉴权（网关可达）', () => {
      expect(
        gatewayUnreachableRemediationHint({ message: 'Unauthorized', status: 401 }, 'LLM 端点'),
      ).toBeNull()
    })
    test('非连接错误 → null', () => {
      expect(
        gatewayUnreachableRemediationHint({ message: 'model returned empty' }, 'LLM 端点'),
      ).toBeNull()
    })
    test('null / 非对象 → null', () => {
      expect(gatewayUnreachableRemediationHint(null, 'LLM 端点')).toBeNull()
      expect(gatewayUnreachableRemediationHint('plain string', 'LLM 端点')).toBeNull()
      expect(gatewayUnreachableRemediationHint(undefined, 'LLM 端点')).toBeNull()
    })
  })
})

describe('0.1.64 PR2 describeEndpointFailure 复合逻辑（去 IFF 硬编码）', () => {
  describe('本地 URL → 按端口提示本地端口状态', () => {
    test('127.0.0.1 带端口 → 本地端口 {port}', () => {
      expect(describeEndpointFailure('http://127.0.0.1:8999/v1')).toBe('本地端口 8999')
    })
    test('localhost 带端口 → 本地端口 {port}', () => {
      expect(describeEndpointFailure('http://localhost:3000')).toBe('本地端口 3000')
    })
    test('0.0.0.0 带端口 → 本地端口 {port}', () => {
      expect(describeEndpointFailure('http://0.0.0.0:8080/api')).toBe('本地端口 8080')
    })
    test('本地 URL 无端口 → 本地网关', () => {
      expect(describeEndpointFailure('http://localhost')).toBe('本地网关')
    })
    test('127.x 任意段带端口 → 本地端口 {port}', () => {
      expect(describeEndpointFailure('http://127.0.1.2:11434')).toBe('本地端口 11434')
    })
  })

  describe('已知云 provider → 提示对应 provider 异常', () => {
    test('api.deepseek.com → DeepSeek 服务', () => {
      expect(describeEndpointFailure('https://api.deepseek.com/v1')).toBe('DeepSeek 服务')
    })
    test('api.openai.com → OpenAI 服务', () => {
      expect(describeEndpointFailure('https://api.openai.com/v1')).toBe('OpenAI 服务')
    })
    test('dashscope.aliyuncs.com → 阿里百炼 服务', () => {
      expect(describeEndpointFailure('https://dashscope.aliyuncs.com/api/v1')).toBe(
        '阿里百炼 服务',
      )
    })
    test('api.moonshot.cn → Kimi 服务', () => {
      expect(describeEndpointFailure('https://api.moonshot.cn/v1')).toBe('Kimi 服务')
    })
    test('api.siliconflow.cn → 硅基流动 服务', () => {
      expect(describeEndpointFailure('https://api.siliconflow.cn/v1')).toBe('硅基流动 服务')
    })
    test('api.lkeap.com → 腾讯混元 服务', () => {
      expect(describeEndpointFailure('https://api.lkeap.com/v1')).toBe('腾讯混元 服务')
    })
  })

  describe('通用/自定义端点 → 报 host（经模型配置解析，提示排查或诊断）', () => {
    test('自定义 host → {host}', () => {
      expect(describeEndpointFailure('https://api.example.com/v1')).toBe('api.example.com')
    })
    test('自定义 host 带端口 → {host}（host 不含端口）', () => {
      expect(describeEndpointFailure('https://my-gateway.corp:9000')).toBe('my-gateway.corp')
    })
  })

  describe('缺省 → LLM 端点（generic fallback）', () => {
    test('baseURL 缺失 → LLM 端点', () => {
      expect(describeEndpointFailure(undefined)).toBe('LLM 端点')
    })
    test('baseURL 空串 → LLM 端点', () => {
      expect(describeEndpointFailure('')).toBe('LLM 端点')
    })
    test('baseURL 非 URL（解析失败）→ LLM 端点', () => {
      expect(describeEndpointFailure('not-a-url')).toBe('LLM 端点')
    })
  })

  describe('hint 串组装（复合逻辑端到端，S-C 三锚点）', () => {
    test('本地端口 → 完整 hint', () => {
      const label = describeEndpointFailure('http://127.0.0.1:8999')
      expect(gatewayUnreachableRemediationHint({ message: 'fetch failed' }, label)).toBe(
        '本地端口 8999 不可达：已切人工确认 —— /doctor 排查',
      )
    })
    test('云 provider → 完整 hint', () => {
      const label = describeEndpointFailure('https://api.deepseek.com')
      expect(gatewayUnreachableRemediationHint({ message: 'fetch failed' }, label)).toBe(
        'DeepSeek 服务 不可达：已切人工确认 —— /doctor 排查',
      )
    })
    test('通用 host → 完整 hint', () => {
      const label = describeEndpointFailure('https://api.example.com')
      expect(gatewayUnreachableRemediationHint({ message: 'fetch failed' }, label)).toBe(
        'api.example.com 不可达：已切人工确认 —— /doctor 排查',
      )
    })
  })
})
