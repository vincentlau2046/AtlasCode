/**
 * 2026-10-05 §4b A 波 A1：危险 shell 前缀护栏纯谓词判别单测。
 *
 * 语义（spec §4b-A1 锁定）：危险前缀（rm / sudo / cd / 单字符 / 通配符）在审批
 * 弹框**不出现 always 选项**（「don't ask again」）。谓词按前缀首词（命令名）
 * 判定 —— `rmq` 与 `rm` 区分（非 startsWith）；同时接受裸前缀形
 * （editablePrefix：`npm`）与规则形（suggestionForPrefix 的 ruleContent：`npm:*`）。
 * 分层纪律：纯字符串逻辑，零磁盘/零网络。
 */
import { describe, test, expect } from 'bun:test'
import { isDangerousShellPrefix } from '../../src/tui/utils/permissions/dangerousShellPrefix'

const DANGEROUS = [
  'rm',
  'rm:*',
  'rm -rf /tmp',
  'RM',
  'sudo',
  'sudo:*',
  'sudo -u x cmd',
  'cd',
  'cd:*',
  'x',
  'x:*',
  '*',
  ':*',
]

const SAFE = [
  'npm',
  'npm:*',
  'npm run',
  'git',
  'git commit -m hi',
  'ls',
  'ls -la',
  'rmq',
  'rmq:*',
  'python3',
  'python3 -c',
  '',
  '   ',
]

describe('A1 isDangerousShellPrefix：危险前缀护栏', () => {
  test('危险前缀 → true（rm/sudo/cd/单字符/通配）', () => {
    for (const p of DANGEROUS) {
      expect(isDangerousShellPrefix(p), `expected dangerous: ${JSON.stringify(p)}`).toBe(true)
    }
  })

  test('安全前缀 → false（含 rmq 词边界区分 + 规则形 :*）', () => {
    for (const p of SAFE) {
      expect(isDangerousShellPrefix(p), `expected safe: ${JSON.stringify(p)}`).toBe(false)
    }
  })
})
