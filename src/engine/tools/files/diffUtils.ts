/**
 * engine/tools/files — diff 工具面（C 桶 ① 子波 3 §8.55 S-C1 依赖闭包层，
 * 旧仓 src/utils/diff.ts 172L 逐字随迁；delta 登记如下，函数体逐字不变）。
 *
 * delta 登记（防「以为已全」）：
 *  - `diff` 依赖新增（§8.55 C 组裁定：纯 JS 无 native，package.json
 *    "diff": "^9.0.0"）；structuredPatch 7 参形 + timeout 选项 = abortable
 *    重载（返回 StructuredPatch | undefined），旧 `if (!result) return []`
 *    守卫逐字保留。
 *  - getLocCounter（旧仓 bootstrap/state 遥测 LOC 计数器）→ 裁：新仓无
 *    getLocCounter（2026-09-18 遥测 879 点整删，计数面无后端），
 *    countLinesChanged 内两调用点裁除（本文件 delta 面，行为 delta 登记；
 *    cost state addToTotalLinesChanged 保留——bootstrap state 有真实消费者）。
 *  - count（旧仓 utils/array.ts 5L 零依赖纯叶子）→ 域内联（不为 5 行叶子
 *    跨兄弟域 import bash 门面 count；旧 array.ts 另两导出 intersperse/uniq
 *    本波零消费者，不随迁）。
 *  - FileEdit 型 → ./fileEditTypes（旧仓 tools/FileEditTool/types.ts 纯类型
 *    块，S-C1 先落）；convertLeadingTabsToSpaces → ./fileUtils（旧仓
 *    utils/file.ts，本波 S-C1 提前随迁——diffUtils 消费故并入本切片，
 *    S-C1/S-C2 分片订正登记）。
 *  - addToTotalLinesChanged → bootstrap 门面（旧仓 cost-tracker.ts；新仓
 *    落 bootstrap/state.ts，cost state 累加器族）。
 */
import { type StructuredPatchHunk, structuredPatch } from 'diff'
import { addToTotalLinesChanged } from '../../../bootstrap'
import type { FileEdit } from './fileEditTypes'
import { convertLeadingTabsToSpaces } from './fileUtils'

export const CONTEXT_LINES = 3
export const DIFF_TIMEOUT_MS = 5_000

// 旧仓 utils/array.ts count 逐字内联（delta 见头注）
function count<T>(arr: readonly T[], pred: (x: T) => unknown): number {
  let n = 0
  for (const x of arr) n += +!!pred(x)
  return n
}

/**
 * Shifts hunk line numbers by offset. Use when getPatchForDisplay received
 * a slice of the file (e.g. readEditContext) rather than the whole file —
 * callers pass `ctx.lineOffset - 1` to convert slice-relative to file-relative.
 */
export function adjustHunkLineNumbers(
  hunks: StructuredPatchHunk[],
  offset: number,
): StructuredPatchHunk[] {
  if (offset === 0) return hunks
  return hunks.map(h => ({
    ...h,
    oldStart: h.oldStart + offset,
    newStart: h.newStart + offset,
  }))
}

// For some reason, & confuses the diff library, so we replace it with a token,
// then substitute it back in after the diff is computed.
const AMPERSAND_TOKEN = '<<:AMPERSAND_TOKEN:>>'

const DOLLAR_TOKEN = '<<:DOLLAR_TOKEN:>>'

function escapeForDiff(s: string): string {
  return s.replaceAll('&', AMPERSAND_TOKEN).replaceAll('$', DOLLAR_TOKEN)
}

function unescapeFromDiff(s: string): string {
  return s.replaceAll(AMPERSAND_TOKEN, '&').replaceAll(DOLLAR_TOKEN, '$')
}

/**
 * Count lines added and removed in a patch and update the total
 * For new files, pass the content string as the second parameter
 * @param patch Array of diff hunks
 * @param newFileContent Optional content string for new files
 */
export function countLinesChanged(
  patch: StructuredPatchHunk[],
  newFileContent?: string,
): void {
  let numAdditions = 0
  let numRemovals = 0

  if (patch.length === 0 && newFileContent) {
    // For new files, count all lines as additions
    numAdditions = newFileContent.split(/\r?\n/).length
  } else {
    numAdditions = patch.reduce(
      (acc, hunk) => acc + count(hunk.lines, _ => _.startsWith('+')),
      0,
    )
    numRemovals = patch.reduce(
      (acc, hunk) => acc + count(hunk.lines, _ => _.startsWith('-')),
      0,
    )
  }

  addToTotalLinesChanged(numAdditions, numRemovals)

  // delta 登记：旧仓此下两行 getLocCounter()?.add(...) 遥测 LOC 计数
  // （added/removed 分型）随 879 点遥测整删而裁（见头注）。

}

export function getPatchFromContents({
  filePath,
  oldContent,
  newContent,
  ignoreWhitespace = false,
  singleHunk = false,
}: {
  filePath: string
  oldContent: string
  newContent: string
  ignoreWhitespace?: boolean
  singleHunk?: boolean
}): StructuredPatchHunk[] {
  const result = structuredPatch(
    filePath,
    filePath,
    escapeForDiff(oldContent),
    escapeForDiff(newContent),
    undefined,
    undefined,
    {
      ignoreWhitespace,
      context: singleHunk ? 100_000 : CONTEXT_LINES,
      timeout: DIFF_TIMEOUT_MS,
    },
  )
  if (!result) {
    return []
  }
  return result.hunks.map(_ => ({
    ..._,
    lines: _.lines.map(unescapeFromDiff),
  }))
}

/**
 * Get a patch for display with edits applied
 * @param filePath The path to the file
 * @param fileContents The contents of the file
 * @param edits An array of edits to apply to the file
 * @param ignoreWhitespace Whether to ignore whitespace changes
 * @returns An array of hunks representing the diff
 *
 * NOTE: This function will return the diff with all leading tabs
 * rendered as spaces for display
 */

export function getPatchForDisplay({
  filePath,
  fileContents,
  edits,
  ignoreWhitespace = false,
}: {
  filePath: string
  fileContents: string
  edits: FileEdit[]
  ignoreWhitespace?: boolean
}): StructuredPatchHunk[] {
  const preparedFileContents = escapeForDiff(
    convertLeadingTabsToSpaces(fileContents),
  )
  const result = structuredPatch(
    filePath,
    filePath,
    preparedFileContents,
    edits.reduce((p, edit) => {
      const { old_string, new_string } = edit
      const replace_all = 'replace_all' in edit ? edit.replace_all : false
      const escapedOldString = escapeForDiff(
        convertLeadingTabsToSpaces(old_string),
      )
      const escapedNewString = escapeForDiff(
        convertLeadingTabsToSpaces(new_string),
      )

      if (replace_all) {
        return p.replaceAll(escapedOldString, () => escapedNewString)
      } else {
        return p.replace(escapedOldString, () => escapedNewString)
      }
    }, preparedFileContents),
    undefined,
    undefined,
    {
      context: CONTEXT_LINES,
      ignoreWhitespace,
      timeout: DIFF_TIMEOUT_MS,
    },
  )
  if (!result) {
    return []
  }
  return result.hunks.map(_ => ({
    ..._,
    lines: _.lines.map(unescapeFromDiff),
  }))
}
