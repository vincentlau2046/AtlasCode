/**
 * M3-S2（D-3 Ascend 独立实施波）— ascend executor 地基判别单测（零网络/零真实 CANN）。
 *
 * 覆盖移植自 AtlasHarness 的 executor 地基（src/ascend/executor/，经 STR-1 门面
 * src/ascend 消费）：
 *   - argSigFromArgs：command+arg-shape → fixture key 推导（build/test/CLI/python3 族）
 *   - resolveFixture：场景命中 → fallback <argSig>_happy → undefined（legacy 占位）
 *   - AscendExecutor mockExec（经 exec mock 面）：fixture replay 非重言（happy exit 0 /
 *     oom exit 1 / unmapped legacy 占位）
 *   - shouldMock（mock 决策 port）：force / non-interactive auto-mock / 显式关
 *   - defaultAscendConfig：env 缺省读
 *
 * 仅测 mock 路径（mock:true / 注入 port），不触发真实 execa spawn。
 */
import { describe, test, expect, afterAll } from 'bun:test'
import {
  argSigFromArgs,
  resolveFixture,
  AscendExecutor,
  DefaultAscendMockPort,
  defaultAscendConfig,
  type AscendConfig,
  type AscendMockPort,
} from '../../src/ascend'

const cfg: AscendConfig = {
  mock: true,
  cannVersion: '8.0.0',
  templateVersion: '8.0.0',
  deviceId: 0,
  timeoutMs: 120_000,
  promptEnabled: true,
}

function portOf(flag: string | undefined, nonInteractive: string | undefined, scenario: string): AscendMockPort {
  return {
    getAscendMockFlag: () => flag,
    getMockOnNonInteractiveFlag: () => nonInteractive,
    getMockScenario: () => scenario,
  }
}

describe('M3-S2 ascend executor 地基', () => {
  afterAll(() => {
    // 还原类级 mock port（避免跨文件泄漏）
    AscendExecutor.setMockPort(new DefaultAscendMockPort())
  })

  describe('argSigFromArgs（key 推导）', () => {
    test('python3 setup.py → build / test_*.py → test', () => {
      expect(argSigFromArgs(['setup.py'], 'python3')).toBe('build')
      expect(argSigFromArgs(['test_gelu.py'], 'python3')).toBe('test')
    })
    test('CLI 命令自 key（deploy/debug 面）', () => {
      expect(argSigFromArgs([], 'atc')).toBe('atc')
      expect(argSigFromArgs([], 'msame')).toBe('msame')
      expect(argSigFromArgs([], 'auto_optimizer')).toBe('autoopt')
      expect(argSigFromArgs([], 'msaicerr.py')).toBe('msaicerr')
      expect(argSigFromArgs([], 'ada-pa')).toBe('adapa')
      expect(argSigFromArgs([], 'npucollect.sh')).toBe('npucollect')
    })
    test('python3 -m ais_bench → bench / img2bin.py → img2bin / msquickcmp', () => {
      expect(argSigFromArgs(['-m', 'ais_bench'], 'python3')).toBe('bench')
      expect(argSigFromArgs(['img2bin.py'], 'python3')).toBe('img2bin')
      expect(argSigFromArgs(['main.py', '-om', 'x'], 'python3')).toBe('msquickcmp')
    })
    test('msprof --export/--analyze → msprof_analyze；capture（无 flag）→ undefined', () => {
      expect(argSigFromArgs(['--export=on'], 'msprof')).toBe('msprof_analyze')
      expect(argSigFromArgs([], 'msprof')).toBeUndefined()
    })
    test('unmapped 命令 → undefined', () => {
      expect(argSigFromArgs([], 'npu-smi')).toBeUndefined()
    })
  })

  describe('resolveFixture（场景解析 + fallback）', () => {
    test('场景命中（build oom → 非重言 exit 1）', () => {
      const fx = resolveFixture('build', 'oom')
      expect(fx?.exitCode).toBe(1)
      expect(fx?.stderr).toContain('out of memory')
    })
    test('fallback 到 <argSig>_happy（未知场景）', () => {
      const fx = resolveFixture('build', 'nonexistent-scenario')
      expect(fx?.exitCode).toBe(0)
      expect(fx?.stdout).toContain('build_ext')
    })
    test('unmapped argSig → undefined（走 legacy 占位）', () => {
      expect(resolveFixture(undefined, 'happy')).toBeUndefined()
    })
  })

  describe('AscendExecutor mockExec（fixture replay 经 exec mock 面）', () => {
    const ex = new AscendExecutor(cfg)

    test('build happy → exit 0 + bisheng stdout', async () => {
      const r = await ex.exec('python3', ['setup.py'], { mock: true })
      expect(r.exitCode).toBe(0)
      expect(r.ok).toBe(true)
      expect(r.stdout).toContain('bisheng -x asc')
    })

    test('build oom 场景 → exit 1（非重言，mock 可返错误路径）', async () => {
      AscendExecutor.setMockPort(portOf('1', undefined, 'oom'))
      const r = await ex.exec('python3', ['setup.py'], { mock: true })
      expect(r.exitCode).toBe(1)
      expect(r.ok).toBe(false)
      expect(r.stderr).toContain('out of memory')
    })

    test('unmapped 命令 → legacy [mock] 占位 exit 0', async () => {
      const r = await ex.exec('npu-smi', ['info'], { mock: true })
      expect(r.exitCode).toBe(0)
      expect(r.stdout).toContain('[mock] npu-smi info')
    })
  })

  describe('shouldMock（mock 决策 port）', () => {
    test('ATLAS_ASCEND_MOCK=1 → force mock', () => {
      AscendExecutor.setMockPort(portOf('1', undefined, 'happy'))
      expect(AscendExecutor.shouldMock()).toBe(true)
    })
    test('非交互 + auto-mock 未禁 → mock', () => {
      AscendExecutor.setMockPort(portOf(undefined, '1', 'happy'))
      expect(AscendExecutor.shouldMock({ isNonInteractiveSession: true })).toBe(true)
    })
    test('auto-mock 显式关（=0）+ 非交互 → real（false）', () => {
      AscendExecutor.setMockPort(portOf(undefined, '0', 'happy'))
      expect(AscendExecutor.shouldMock({ isNonInteractiveSession: true })).toBe(false)
    })
    test('非交互 + auto-mock 缺省（env 未设 ≠0）→ 默认 auto-mock（true）', () => {
      AscendExecutor.setMockPort(portOf(undefined, undefined, 'happy'))
      expect(AscendExecutor.shouldMock({ isNonInteractiveSession: true })).toBe(true)
    })
    test('交互会话 + 无 flag → real（false）', () => {
      AscendExecutor.setMockPort(portOf(undefined, undefined, 'happy'))
      expect(AscendExecutor.shouldMock({ isNonInteractiveSession: false })).toBe(false)
    })
  })

  describe('defaultAscendConfig（env 缺省读）', () => {
    test('缺省值（clean env）', () => {
      const c = defaultAscendConfig()
      expect(c.cannVersion).toBe('8.0.0')
      expect(c.templateVersion).toBe('8.0.0')
      expect(c.deviceId).toBe(0)
      expect(c.timeoutMs).toBe(120_000)
      expect(c.promptEnabled).toBe(true)
    })
  })
})
