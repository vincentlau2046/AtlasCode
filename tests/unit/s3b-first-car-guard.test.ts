/**
 * 0.1.106 S3b 切片 2 出口首车守卫（S3a 格② 同构；f4 段 G 条件 a/b）：
 *   格 3（59 对表锚，f4 终定 种子 23 + 随迁 36 含 detectRepository
 *   scanner-动态边补洞）：59 文件逐一存在于 src/kernel/<sub> 且
 *   src/tui/<sub> 已不在场（恰合断言，防半途漂移）。
 *   逃逸格（断言不弱化）：59 文件 import 落点 ∈ kernel∪shared∪外部包∪
 *   逃逸格顶层域（bootstrap/modelprovider/engine/swarm）∪缝/型提取单元，
 *   tui 逃逸 = 0（缝消费已切 kernel/state，type 边已提取 kernel/types）。
 *   缝消费对表（f4 条件 a「log.ts 系逐条对表」）：3 缝消费者
 *   （log/slowOperations/gitFilesystem）含 getKernelBootstrapNoopSeam
 *   且零 bootstrapState 直调残留。
 *   提取单元：messageQueueTypes 整迁 + fileHistoryTypes /
 *   toolResultStorageTypes / configScope 三新文件在场 + 源侧 re-export 在场。
 *
 * I/O 面：只读 src（同 S3a 判据格范型）→ unit 层。
 */
import { describe, test, expect } from 'bun:test'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const REPO = join(import.meta.dir, '..', '..')
const SRC = join(REPO, 'src')

/** 首车 59 文件（kernel 相对路径；f4 终定锚 2026-11-13）。 */
const CAR_59 = [
  'kernel/constants/figures.ts',
  'kernel/ink/stringWidth.ts',
  'kernel/types/logs.ts',
  'kernel/utils/argumentSubstitution.ts',
  'kernel/utils/bash/bashPipeCommand.ts',
  'kernel/utils/bash/registry.ts',
  'kernel/utils/bash/shellPrefix.ts',
  'kernel/utils/bash/shellQuote.ts',
  'kernel/utils/bash/shellQuoting.ts',
  'kernel/utils/caCerts.ts',
  'kernel/utils/cachePaths.ts',
  'kernel/utils/debug.ts',
  'kernel/utils/detectRepository.ts',
  'kernel/utils/diagLogs.ts',
  'kernel/utils/displayTags.ts',
  'kernel/utils/env.ts',
  'kernel/utils/envValidation.ts',
  'kernel/utils/execFileNoThrow.ts',
  'kernel/utils/execFileNoThrowPortable.ts',
  'kernel/utils/execSyncWrapper.ts',
  'kernel/utils/fileRead.ts',
  'kernel/utils/findExecutable.ts',
  'kernel/utils/format.ts',
  'kernel/utils/fsOperations.ts',
  'kernel/utils/git.ts',
  'kernel/utils/git/gitFilesystem.ts',
  'kernel/utils/git/gitignore.ts',
  'kernel/utils/intl.ts',
  'kernel/utils/json.ts',
  'kernel/utils/jsonRead.ts',
  'kernel/utils/log.ts',
  'kernel/utils/memoize.ts',
  'kernel/utils/mtls.ts',
  'kernel/utils/nativeInstaller/packageManagers.ts',
  'kernel/utils/permissions/PermissionMode.ts',
  'kernel/utils/permissions/PermissionUpdateSchema.ts',
  'kernel/utils/platform.ts',
  'kernel/utils/plugins/gitAvailability.ts',
  'kernel/utils/powershell/dangerousCmdlets.ts',
  'kernel/utils/powershell/parser.ts',
  'kernel/utils/powershell/staticPrefix.ts',
  'kernel/utils/privacyLevel.ts',
  'kernel/utils/profilerBase.ts',
  'kernel/utils/proxy.ts',
  'kernel/utils/settings/managedPath.ts',
  'kernel/utils/settings/mdm/settings.ts',
  'kernel/utils/settings/schemaOutput.ts',
  'kernel/utils/settings/validation.ts',
  'kernel/utils/shell/outputLimits.ts',
  'kernel/utils/shell/powershellDetection.ts',
  'kernel/utils/shell/readOnlyCommandValidation.ts',
  'kernel/utils/shell/shellToolUtils.ts',
  'kernel/utils/slowOperations.ts',
  'kernel/utils/startupProfiler.ts',
  'kernel/utils/swarm/constants.ts',
  'kernel/utils/tasks.ts',
  'kernel/utils/teammateMailbox.ts',
  'kernel/utils/truncate.ts',
  'kernel/utils/which.ts',
] as const

const EXTRACTION_UNITS = [
  'kernel/types/messageQueueTypes.ts',
  'kernel/types/fileHistoryTypes.ts',
  'kernel/types/toolResultStorageTypes.ts',
  'kernel/types/configScope.ts',
] as const

/** 逃逸格合法顶层域（S3a 口径：kernel∪shared∪现存顶层域）。 */
const GRID_DOMAINS = new Set([
  'kernel', 'shared', 'bootstrap', 'modelprovider', 'engine', 'swarm',
])

/** 3 缝消费者（kernel 树内经 getKernelBootstrapNoopSeam 消费 bootstrapState no-op 4 名）。 */
const SEAM_CONSUMERS = [
  'kernel/utils/log.ts',
  'kernel/utils/slowOperations.ts',
  'kernel/utils/git/gitFilesystem.ts',
] as const

describe('S3b 切片 2 格 3：出口首车 59 对表（f4 终定锚）', () => {
  test('① 59 文件恰合：kernel 落点在场 + tui 原位清空', () => {
    expect(CAR_59).toHaveLength(59)
    for (const rel of CAR_59) {
      expect({ rel, exists: existsSync(join(SRC, rel)) }).toEqual({
        rel, exists: true,
      })
      const tuiPath = join(SRC, 'tui', rel.slice('kernel/'.length))
      expect({ rel, tuiResidue: existsSync(tuiPath) }).toEqual({
        rel, tuiResidue: false,
      })
    }
  })

  test('② 提取单元 4 文件在场', () => {
    for (const rel of EXTRACTION_UNITS) {
      expect(existsSync(join(SRC, rel))).toBe(true)
    }
  })
})

describe('S3b 切片 2 逃逸格：59 文件 import 落点（断言不弱化）', () => {
  const FROM_RE = /(from\s+|import\s+|import\(\s*|require\(\s*)(['"])([^'"]+)\2/g

  function resolveSpec(importer: string, spec: string): string | null {
    if (spec.startsWith('.')) {
      const base = join(importer, '..', spec)
      for (const c of [base, base.replace(/\.js$/, '.ts'), `${base}/index.ts`]) {
        if (existsSync(c) && /\.(ts|tsx)$/.test(c)) return c
      }
      return null
    }
    if (spec.startsWith('src/')) {
      const stem = spec.endsWith('.js') ? spec.slice(0, -3) : spec
      for (const c of [
        join(REPO, stem + '.ts'),
        join(REPO, stem + '.tsx'),
        join(REPO, stem, 'index.ts'),
      ]) {
        if (existsSync(c)) return c
      }
      return null
    }
    return null // 外部包
  }

  test('③ tui 逃逸 = 0；落点全在逃逸格（kernel/shared/现存顶层域/外部）', () => {
    const escapes: string[] = []
    for (const rel of CAR_59) {
      const file = join(SRC, rel)
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(FROM_RE)) {
        const target = resolveSpec(file, m[3])
        if (!target) continue // 外部包
        const relTarget = target.startsWith(SRC + '/')
          ? target.slice(SRC.length + 1)
          : null
        if (relTarget === null) continue
        const domain = relTarget.split('/')[0]
        if (!GRID_DOMAINS.has(domain)) {
          escapes.push(`${rel} → ${relTarget}`)
        }
      }
    }
    expect(escapes).toEqual([])
  })

  test('④ 3 缝消费者对表：getKernelBootstrapNoopSeam 在场 + bootstrapState 直调清零', () => {
    for (const rel of SEAM_CONSUMERS) {
      const text = readFileSync(join(SRC, rel), 'utf8')
      expect({ rel, seam: text.includes('getKernelBootstrapNoopSeam') }).toEqual({
        rel, seam: true,
      })
      expect({
        rel,
        residue: /from\s+'[^']*bootstrapState/.test(text),
      }).toEqual({
        rel, residue: false,
      })
    }
  })

  test('⑤ 源侧 re-export 兜底在场（3 型提取单元）', () => {
    expect(
      readFileSync(join(SRC, 'tui/utils/fileHistory.ts'), 'utf8'),
    ).toContain("from '../../kernel/types/fileHistoryTypes.js'")
    expect(
      readFileSync(join(SRC, 'tui/utils/toolResultStorage.ts'), 'utf8'),
    ).toContain("from '../../kernel/types/toolResultStorageTypes.js'")
    const mcpTypes = readFileSync(join(SRC, 'tui/services/mcp/types.ts'), 'utf8')
    expect(mcpTypes).toContain("from '../../../kernel/types/configScope.js'")
    // validation.ts（随迁）直接消费 kernel/types 单源
    expect(
      readFileSync(join(SRC, 'kernel/utils/settings/validation.ts'), 'utf8'),
    ).toContain("from '../../types/configScope.js'")
  })
})
