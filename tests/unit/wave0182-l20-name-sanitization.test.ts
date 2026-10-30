/**
 * 0.1.82 K3-C L20 判别单测（上游 296）：skill/command 文件·目录名含
 * 隐藏·方向·空白字符或 `<>` 不再提供（静默过滤裁定，工单 §101：
 * 「不再提供（改名前）」——不破交互流）。
 *
 * 红例三族：U+202E（RLO 方向覆写）/ `<>`（提示·标签注入面）/ 隐藏空白
 * （U+200B 零宽空格、U+00A0 NBSP）。ASCII 空格放行（既有带空格技能名
 * 零破坏）。
 *
 * 双体：engine src/engine/skill/commandNameSafety.ts 与 TUI
 * src/tui/utils/commandNameSafety.ts 同构双副本，两体同断言
 * （wave0182-skill-param-caps 先例）；行为面 = 两体各自的
 * getSkillDirCommands 装载器（tmpdir 真目录红例：坏名技能修前被提供）。
 *
 * 隔离纪律：ATLAS_CONFIG_DIR 指向 tmp（user skills 面 ENOENT 空）；
 * 项目面 = tmp cwd 的 .atlas/skills/；--isolate 每文件独立进程 +
 * clearSkillCaches 清 memoize。
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

// fs 隔离须在 skill 模块首次加载前置位（less-permission-prompts-skill
// 先例：--isolate 独立进程，顶层置位不外泄）
const cfgDir = await mkdtemp(join(tmpdir(), 'atlas-l20-cfg-'))
process.env.ATLAS_CONFIG_DIR = cfgDir

import {
  clearSkillCaches,
  getSkillDirCommands,
} from '../../src/engine/skill'
import { isUnsafeCommandName as engineIsUnsafe } from '../../src/engine/skill/commandNameSafety.js'

const tui = await import('../../src/tui/skills/loadSkillsDir.js')
const tuiSafety = await import('../../src/tui/utils/commandNameSafety.js')

const BAD_NAMES = [
  'bad‮', // RLO 方向覆写（视觉欺骗面）
  'ev<b>il', // 尖括（提示/标签注入面）
  'zw​sp', // 零宽空格（隐藏空白）
  'nb sp', // NBSP（隐藏空白）
]

const COPIES = [
  { label: 'engine', isUnsafe: engineIsUnsafe },
  { label: 'tui', isUnsafe: tuiSafety.isUnsafeCommandName },
] as const

// ── 纯谓词（双体同断言）─────────────────────────────────────────────

describe('K3-C L20：isUnsafeCommandName 谓词（双体）', () => {
  for (const { label, isUnsafe } of COPIES) {
    describe(label, () => {
      test(`红例三族全拒 [${label}]`, () => {
        for (const name of BAD_NAMES) {
          expect(isUnsafe(name)).toBe(true)
        }
        // BOM / 软连字符 / 控制字符 / LRI-PDI 隔离区
        expect(isUnsafe('﻿x')).toBe(true)
        expect(isUnsafe('so­ft')).toBe(true)
        expect(isUnsafe('ctl\u001B')).toBe(true)
        expect(isUnsafe('iso⁦lit')).toBe(true)
        // 空名
        expect(isUnsafe('')).toBe(true)
      })

      test(`良性名全放行（含 ASCII 空格 / 命名空间 / CJK）[${label}]`, () => {
        expect(isUnsafe('my-skill')).toBe(false)
        expect(isUnsafe('my skill')).toBe(false) // ASCII 空格放行（零破坏裁定）
        expect(isUnsafe('ns:cmd')).toBe(false)
        expect(isUnsafe('skill2')).toBe(false)
        expect(isUnsafe('算子开发')).toBe(false)
        expect(isUnsafe('plugin:name:sub')).toBe(false)
      })
    })
  }
})

// ── 装载器行为面（坏名技能不提供，双体）───────────────────────────────

async function makeSkillsTree(root: string): Promise<string> {
  const skillsRoot = join(root, '.atlas', 'skills')
  for (const name of ['good-skill', ...BAD_NAMES]) {
    const dir = join(skillsRoot, name)
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'SKILL.md'),
      '---\ndescription: l20 test skill\n---\n\nbody\n',
      'utf-8',
    )
  }
  return skillsRoot
}

const LOADERS = [
  {
    label: 'engine',
    getSkillDirCommands: (cwd: string) => getSkillDirCommands(cwd),
    clearCache: () => clearSkillCaches(),
  },
  {
    label: 'tui',
    getSkillDirCommands: (cwd: string) => tui.getSkillDirCommands(cwd),
    clearCache: () => tui.clearSkillCaches(),
  },
] as const

let roots: string[] = []

beforeEach(() => {
  roots = []
})

afterEach(async () => {
  for (const l of LOADERS) l.clearCache()
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

describe('K3-C L20：装载器静默过滤坏名技能（双体）', () => {
  for (const { label, getSkillDirCommands: load, clearCache } of LOADERS) {
    test(`U+202E / <> / 隐藏空白名技能不提供，好名技能照常 [${label}]`, async () => {
      const root = await mkdtemp(join(tmpdir(), `atlas-l20-${label}-`))
      roots.push(root)
      await makeSkillsTree(root)
      try {
        const commands = await load(root)
        const names = commands.map(c => c.name)
        expect(names).toContain('good-skill')
        expect(names).not.toContain('bad‮')
        expect(names).not.toContain('ev<b>il')
        expect(names).not.toContain('zw​sp')
        expect(names).not.toContain('nb sp')
        expect(names).toHaveLength(1)
      } finally {
        clearCache()
      }
    })
  }
})
