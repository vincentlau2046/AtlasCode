/**
 * wave0183 K4-4（0.1.83 V3-4）— ref 名安全守卫硬化判别（f4 工单 §1.A，上游 300）
 *
 * git check-ref-format 规则补齐：slash 分量不得以 '.' 开头（reftable HEAD 占位
 * `refs/heads/.invalid` 即此形态——git 刻意选非法 ref 名保证永不与真分支冲突；
 * 旧 isSafeRefName 未拒首点分量 → 占位值穿透为「分支名」被上层消费）；分量
 * 不得以 '.lock' 结尾（git 自身锁文件命名空间，永不属于用户 ref）。
 *
 * 双体（engine worktree/git.ts + tui utils/git/gitFilesystem.ts）同硬化同测。
 * isValidGitSha 恒等锚：仅全长 40/64 hex（占位/截断值拒）。
 */
import { describe, expect, test } from 'bun:test'
import {
  isSafeRefName as engineIsSafeRefName,
  isValidGitSha as engineIsValidGitSha,
} from '../../src/engine'
import {
  isSafeRefName as tuiIsSafeRefName,
  isValidGitSha as tuiIsValidGitSha,
} from '../../src/tui/utils/git/gitFilesystem.js'

const twins: Array<[string, typeof engineIsSafeRefName]> = [
  ['engine', engineIsSafeRefName],
  ['tui', tuiIsSafeRefName],
]

for (const [twin, isSafeRefName] of twins) {
  describe(`isSafeRefName 硬化（${twin} 体）`, () => {
    test('reftable HEAD 占位 .invalid 拒（基线红：true 穿透）', () => {
      expect(isSafeRefName('.invalid')).toBe(false)
    })

    test('首点分量拒（git check-ref-format：分量不得以 . 开头）', () => {
      expect(isSafeRefName('.foo')).toBe(false)
      expect(isSafeRefName('a/.foo')).toBe(false)
      expect(isSafeRefName('refs/heads/.hidden')).toBe(false)
    })

    test('.lock 尾分量拒（git 自身锁命名空间）', () => {
      expect(isSafeRefName('foo.lock')).toBe(false)
      expect(isSafeRefName('a/foo.lock')).toBe(false)
    })

    test('合法名不回归', () => {
      expect(isSafeRefName('main')).toBe(true)
      expect(isSafeRefName('feature/x')).toBe(true)
      expect(isSafeRefName('refs/heads/main')).toBe(true)
      expect(isSafeRefName('dependabot/npm_and_yarn/@types/node-18.0.0')).toBe(true)
      expect(isSafeRefName('v1.2.3')).toBe(true)
      expect(isSafeRefName('release-1.2.3+build')).toBe(true)
    })
  })
}

describe('isValidGitSha 恒等锚（双体）', () => {
  test('全长 40/64 hex 真；短/非 hex 假', () => {
    for (const isValidGitSha of [engineIsValidGitSha, tuiIsValidGitSha]) {
      expect(isValidGitSha('0'.repeat(40))).toBe(true)
      expect(isValidGitSha('f'.repeat(64))).toBe(true)
      expect(isValidGitSha('0'.repeat(39))).toBe(false)
      expect(isValidGitSha('g'.repeat(40))).toBe(false)
      expect(isValidGitSha('.invalid')).toBe(false)
      expect(isValidGitSha('')).toBe(false)
    }
  })
})
