/**
 * §8.55 S-C1（C 桶 ① 子波 3 高频族纵切 · 依赖闭包层 1）纯叶子批单测。
 *
 * 覆盖（零磁盘零网络；env 卫生保存/恢复）：
 *  - files/semantic 双函数（旧 zod preprocess 语义 delta 转写：
 *    字符串数字字面量容忍 / "true"/"false" 布尔字面量容忍；z.coerce 族
 *    明确不做的负向断言）
 *  - files/apiLimits 5 常量逐字值（旧仓 constants/apiLimits 裁面）
 *  - shared/tokenEstimation 3 函数（占位填充，旧 services 纯函数子集）
 *  - files/modelRef getCanonicalModelName（旧 getCanonicalName 回退支逐字）
 *  - shared/log logError 冒烟（no-op 链不抛）
 *  - fileUtils 纯函数面（convertLeadingTabsToSpaces / addLineNumbers
 *    env 门双面 / stripLineNumberPrefix）
 *  - fileRead detectLineEndingsForString（CRLF/LF/平局支）
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  semanticToBoolean,
  semanticToNumber,
} from '../../src/engine/tools/files/semantic'
import {
  PDF_AT_MENTION_INLINE_THRESHOLD,
  PDF_EXTRACT_SIZE_THRESHOLD,
  PDF_MAX_EXTRACT_SIZE,
  PDF_MAX_PAGES_PER_READ,
  PDF_TARGET_RAW_SIZE,
} from '../../src/engine/tools/files/apiLimits'
import {
  bytesPerTokenForFileType,
  roughTokenCountEstimation,
  roughTokenCountEstimationForFileType,
} from '../../src/shared'
import {
  getCanonicalModelName,
} from '../../src/engine/tools/files/modelRef'
import { logError } from '../../src/shared'
import {
  addLineNumbers,
  convertLeadingTabsToSpaces,
  isCompactLinePrefixEnabled,
  stripLineNumberPrefix,
} from '../../src/engine/tools/files/fileUtils'
import {
  detectLineEndingsForString,
} from '../../src/engine/tools/files/fileRead'

const ENV_KEY = 'ATLAS_DISABLE_COMPACT_LINE_PREFIX'
let savedEnv: string | undefined

beforeEach(() => {
  savedEnv = process.env[ENV_KEY]
  delete process.env[ENV_KEY]
})

afterEach(() => {
  if (savedEnv === undefined) delete process.env[ENV_KEY]
  else process.env[ENV_KEY] = savedEnv
})

describe('semanticToNumber（§8.55 delta 转写：字符串数字字面量容忍）', () => {
  test('数字字符串 "30" → 30', () => {
    expect(semanticToNumber('30')).toBe(30)
  })
  test('负数/小数字符串 "-5" / "3.14" → 数值', () => {
    expect(semanticToNumber('-5')).toBe(-5)
    expect(semanticToNumber('3.14')).toBe(3.14)
  })
  test('非数字字符串 / null / undefined 原样透传（下游拒绝）', () => {
    expect(semanticToNumber('abc')).toBe('abc')
    // "1e2" 不匹配 /^-?\d+(\.\d+)?$/ → 透传（旧仓逐字口径）
    expect(semanticToNumber('1e2')).toBe('1e2')
    expect(semanticToNumber(null)).toBeNull()
    expect(semanticToNumber(undefined)).toBeUndefined()
  })
  test('数值输入原样透传（非字符串支）', () => {
    expect(semanticToNumber(42)).toBe(42)
  })
  test('z.coerce 负向面："" / " " 不 coerce（旧仓排除理由：掩盖输入 bug）', () => {
    expect(semanticToNumber('')).toBe('')
    expect(semanticToNumber(' ')).toBe(' ')
  })
})

describe('semanticToBoolean（"true"/"false" 字面量容忍，JS 真值支排除）', () => {
  test('"true" → true / "false" → false', () => {
    expect(semanticToBoolean('true')).toBe(true)
    expect(semanticToBoolean('false')).toBe(false)
  })
  test('布尔原样透传', () => {
    expect(semanticToBoolean(true)).toBe(true)
    expect(semanticToBoolean(false)).toBe(false)
  })
  test('z.coerce 负向面：其他字符串（"1"/"0"）不 coerce', () => {
    expect(semanticToBoolean('1')).toBe('1')
    expect(semanticToBoolean('0')).toBe('0')
  })
})

describe('apiLimits 5 常量（旧仓 constants/apiLimits 裁面逐字值）', () => {
  test('PDF 面 5 常量值', () => {
    expect(PDF_TARGET_RAW_SIZE).toBe(20 * 1024 * 1024)
    expect(PDF_EXTRACT_SIZE_THRESHOLD).toBe(3 * 1024 * 1024)
    expect(PDF_MAX_EXTRACT_SIZE).toBe(100 * 1024 * 1024)
    expect(PDF_MAX_PAGES_PER_READ).toBe(20)
    expect(PDF_AT_MENTION_INLINE_THRESHOLD).toBe(10)
  })
})

describe('shared/tokenEstimation（占位填充，旧 services 纯函数子集）', () => {
  test('roughTokenCountEstimation 默认 4 bytes/token 四舍五入', () => {
    expect(roughTokenCountEstimation('x'.repeat(8))).toBe(2)
    expect(roughTokenCountEstimation('x'.repeat(7))).toBe(2) // 7/4=1.75 → 2
    expect(roughTokenCountEstimation('')).toBe(0)
  })
  test('bytesPerTokenForFileType：json 族 2 其余 4', () => {
    expect(bytesPerTokenForFileType('json')).toBe(2)
    expect(bytesPerTokenForFileType('jsonl')).toBe(2)
    expect(bytesPerTokenForFileType('jsonc')).toBe(2)
    expect(bytesPerTokenForFileType('txt')).toBe(4)
  })
  test('roughTokenCountEstimationForFileType 文件型感知', () => {
    // 8 字符 json：8/2=4（默认 4 bytes/token 则为 2）
    expect(roughTokenCountEstimationForFileType('x'.repeat(8), 'json')).toBe(4)
    expect(roughTokenCountEstimationForFileType('x'.repeat(8), 'py')).toBe(2)
  })
})

describe('modelRef getCanonicalModelName（旧 getCanonicalName 回退支逐字）', () => {
  test('小写化（元数据表旧仓已删，直接取回退语义）', () => {
    expect(getCanonicalModelName('GPT-4o')).toBe('gpt-4o')
    expect(getCanonicalModelName('x')).toBe('x')
  })
})

describe('shared/log logError（no-op 链冒烟：不抛即通过）', () => {
  test('Error / 非 Error 输入均不抛', () => {
    expect(() => logError(new Error('boom'))).not.toThrow()
    expect(() => logError('string error')).not.toThrow()
    expect(() => logError(undefined)).not.toThrow()
  })
})

describe('fileUtils 纯函数面', () => {
  test('convertLeadingTabsToSpaces：行首 tab → 双空格；无 tab 原引用透传', () => {
    expect(convertLeadingTabsToSpaces('\ta\n\t\tb')).toBe('  a\n    b')
    const noTab = '  a'
    expect(convertLeadingTabsToSpaces(noTab)).toBe(noTab)
  })

  test('addLineNumbers 默认 compact 前缀（env 未设 = killswitch 关）', () => {
    expect(
      addLineNumbers({ content: 'a\nb', startLine: 1 }),
    ).toBe('1\ta\n2\tb')
  })

  test('ATLAS_DISABLE_COMPACT_LINE_PREFIX=1 → 填充箭头格式（6 位 pad）', () => {
    process.env[ENV_KEY] = '1'
    expect(isCompactLinePrefixEnabled()).toBe(false)
    expect(addLineNumbers({ content: 'a', startLine: 1 })).toBe('     1→a')
  })

  test('addLineNumbers 空内容 → 空串；startLine 1-indexed 偏移', () => {
    expect(addLineNumbers({ content: '', startLine: 5 })).toBe('')
    expect(addLineNumbers({ content: 'x', startLine: 10 })).toBe('10\tx')
  })

  test('stripLineNumberPrefix：箭头填充形 / compact tab 形 双向剥离', () => {
    expect(stripLineNumberPrefix('     1→abc')).toBe('abc')
    expect(stripLineNumberPrefix('10\tabc')).toBe('abc')
    expect(stripLineNumberPrefix('no-prefix')).toBe('no-prefix')
  })
})

describe('fileRead detectLineEndingsForString', () => {
  test('CRLF 多数 → CRLF', () => {
    expect(detectLineEndingsForString('a\r\nb\r\nc\n')).toBe('CRLF')
  })
  test('LF 多数 → LF', () => {
    expect(detectLineEndingsForString('a\nb\nc\r\n')).toBe('LF')
  })
  test('平局（crlfCount == lfCount）→ LF（> 非 >=，旧仓逐字）', () => {
    expect(detectLineEndingsForString('a\r\nb\n')).toBe('LF')
  })
})
