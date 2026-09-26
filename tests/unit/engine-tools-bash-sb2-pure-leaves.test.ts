/**
 * engine/tools/bash S-B2 纯叶子本体 unit 面（Bash 本体纵切子波 §8.54，
 * C 桶 ① 子波 2）。
 *
 * unit 层（零盘）：
 *  - commandSemantics interpretCommandResult 语义表（grep/rg/find/diff/
 *    test/[ 特判 + 默认支 + 管道取最后段）
 *  - commentLabel extractBashCommentLabel（# label / #! shebang 排除）
 *  - destructiveCommandWarning 模式表（git/rm/DB/k8s/terraform + dry-run
 *    负向断言）
 *  - sedEditParser parse 面（-i 族/-e/--expression/白名单 flags/负例）+
 *    applySedSubstitution BRE→ERE 判别 + `&`/`\&` 替换面
 *  - bashUtils stripEmptyLines / data-URI 族 / buildImageToolResult /
 *    formatOutput（BASH_MAX_OUTPUT_LENGTH env 面）/ stdErr reset 附言 /
 *    createContentSummary 200 字截断 / resizeShellImageOutput stdout 支
 *    （D-3 未缩放重编码语义）
 *
 * 深度 import（门面归集 = S-B5，本切片不预支）：
 *  ../../src/engine/tools/bash/{commandSemantics,commentLabel,
 *  destructiveCommandWarning,sedEditParser,bashUtils}
 *
 * 探针锚点登记（§8.54 ⑧ 突变面，S-B6 消费）：
 *  - P-B3 = applySedSubstitution BRE→ERE 占位符顺序（BACKSLASH/PLUS 保护
 *    步互换）→ S-B6 重选：原登记判别支对互换不敏感（0 红），活锚 =
 *    「BRE \\\\+ 字面反斜杠+字面 plus」测（保护步顺序真敏感输入）。
 */
import { describe, test, expect } from 'bun:test'
import { interpretCommandResult } from '../../src/engine/tools/bash/commandSemantics'
import { extractBashCommentLabel } from '../../src/engine/tools/bash/commentLabel'
import { getDestructiveCommandWarning } from '../../src/engine/tools/bash/destructiveCommandWarning'
import {
  applySedSubstitution,
  isSedInPlaceEdit,
  parseSedEditCommand,
  type SedEditInfo,
} from '../../src/engine/tools/bash/sedEditParser'
import {
  buildImageToolResult,
  createContentSummary,
  formatOutput,
  isImageOutput,
  parseDataUri,
  resizeShellImageOutput,
  stdErrAppendShellResetMessage,
  stripEmptyLines,
} from '../../src/engine/tools/bash/bashUtils'
import { getOriginalCwd } from '../../src/bootstrap'
import type { ContentBlockParam } from '../../src/shared'

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    fn()
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

describe('interpretCommandResult 语义表', () => {
  test('grep/rg exit 1 = 无匹配非错误', () => {
    expect(interpretCommandResult('grep foo bar', 1, '', '')).toEqual({
      isError: false,
      message: 'No matches found',
    })
    expect(interpretCommandResult('rg foo bar', 1, '', '')).toEqual({
      isError: false,
      message: 'No matches found',
    })
    // exit 2+ = 真错误
    expect(interpretCommandResult('grep foo bar', 2, '', 'err')).toEqual({
      isError: true,
      message: undefined,
    })
  })

  test('find/diff/test/[ 特判', () => {
    expect(interpretCommandResult('find / -name x', 1, '', '')).toEqual({
      isError: false,
      message: 'Some directories were inaccessible',
    })
    expect(interpretCommandResult('diff a b', 1, 'x', '')).toEqual({
      isError: false,
      message: 'Files differ',
    })
    expect(interpretCommandResult('test -f x', 1, '', '')).toEqual({
      isError: false,
      message: 'Condition is false',
    })
    expect(interpretCommandResult('[ -f x ]', 1, '', '')).toEqual({
      isError: false,
      message: 'Condition is false',
    })
  })

  test('默认支：非 0 = 错误 + 消息；0 = 成功', () => {
    expect(interpretCommandResult('ls', 1, '', '')).toEqual({
      isError: true,
      message: 'Command failed with exit code 1',
    })
    expect(interpretCommandResult('ls', 0, 'out', '')).toEqual({
      isError: false,
      message: undefined,
    })
  })

  test('管道取最后段定语义', () => {
    // exit 1 由 grep（出口）产生 → 无匹配非错误
    expect(
      interpretCommandResult('echo a | grep zzz', 1, '', ''),
    ).toEqual({
      isError: false,
      message: 'No matches found',
    })
  })
})

describe('extractBashCommentLabel', () => {
  test('# label 首行提取（多 # + 空白剥除）', () => {
    expect(extractBashCommentLabel('# deploy v2')).toBe('deploy v2')
    expect(extractBashCommentLabel('###  spaced')).toBe('spaced')
  })

  test('shebang / 非注释 / 空 = undefined', () => {
    expect(extractBashCommentLabel('#!/bin/sh\necho')).toBeUndefined()
    expect(extractBashCommentLabel('echo hi\n# comment')).toBeUndefined()
    expect(extractBashCommentLabel('echo hi')).toBeUndefined()
    expect(extractBashCommentLabel('#\nbody')).toBeUndefined()
    expect(extractBashCommentLabel('')).toBeUndefined()
  })
})

describe('getDestructiveCommandWarning 模式表', () => {
  test('git 数据丢失族', () => {
    expect(getDestructiveCommandWarning('git reset --hard')).toBe(
      'Note: may discard uncommitted changes',
    )
    expect(getDestructiveCommandWarning('git push origin -f')).toBe(
      'Note: may overwrite remote history',
    )
    expect(getDestructiveCommandWarning('git push --force-with-lease')).toBe(
      'Note: may overwrite remote history',
    )
    expect(getDestructiveCommandWarning('git clean -fd')).toBe(
      'Note: may permanently delete untracked files',
    )
    // dry-run 负向断言
    expect(getDestructiveCommandWarning('git clean -nd')).toBeNull()
    expect(getDestructiveCommandWarning('git checkout .')).toBe(
      'Note: may discard all working tree changes',
    )
    expect(getDestructiveCommandWarning('git restore .')).toBe(
      'Note: may discard all working tree changes',
    )
    expect(getDestructiveCommandWarning('git stash drop x')).toBe(
      'Note: may permanently remove stashed changes',
    )
    expect(getDestructiveCommandWarning('git branch -D old')).toBe(
      'Note: may force-delete a branch',
    )
  })

  test('git 安全旁路族', () => {
    expect(getDestructiveCommandWarning('git commit --no-verify')).toBe(
      'Note: may skip safety hooks',
    )
    expect(getDestructiveCommandWarning('git commit --amend')).toBe(
      'Note: may rewrite the last commit',
    )
  })

  test('rm 族（递归/强制/复合）', () => {
    expect(getDestructiveCommandWarning('rm -rf /tmp/x')).toBe(
      'Note: may recursively force-remove files',
    )
    expect(getDestructiveCommandWarning('rm -r x')).toBe(
      'Note: may recursively remove files',
    )
    expect(getDestructiveCommandWarning('rm -f x')).toBe(
      'Note: may force-remove files',
    )
  })

  test('DB / k8s / terraform 族', () => {
    expect(getDestructiveCommandWarning('DROP TABLE users')).toBe(
      'Note: may drop or truncate database objects',
    )
    expect(getDestructiveCommandWarning('truncate schema public')).toBe(
      'Note: may drop or truncate database objects',
    )
    expect(getDestructiveCommandWarning('DELETE FROM t;')).toBe(
      'Note: may delete all rows from a database table',
    )
    expect(getDestructiveCommandWarning('kubectl delete pod x')).toBe(
      'Note: may delete Kubernetes resources',
    )
    expect(getDestructiveCommandWarning('terraform destroy')).toBe(
      'Note: may destroy Terraform infrastructure',
    )
  })

  test('无害命令 = null', () => {
    expect(getDestructiveCommandWarning('git status')).toBeNull()
    expect(getDestructiveCommandWarning('ls -la')).toBeNull()
  })
})

describe('parseSedEditCommand 解析面', () => {
  test('基本形 sed -i s/p/r/ file', () => {
    expect(parseSedEditCommand('sed -i "s/old/new/" file.txt')).toEqual({
      filePath: 'file.txt',
      pattern: 'old',
      replacement: 'new',
      flags: '',
      extendedRegex: false,
    })
  })

  test('flags / extended / 备份后缀 / -e / --expression 族', () => {
    const g = parseSedEditCommand('sed -i "s/a/b/g" f')
    expect(g?.flags).toBe('g')
    expect(parseSedEditCommand('sed -E -i "s/a/b/" f')?.extendedRegex).toBe(
      true,
    )
    expect(parseSedEditCommand('sed -i.bak "s/a/b/" f')?.filePath).toBe('f')
    expect(parseSedEditCommand('sed --in-place "s/a/b/" f')?.pattern).toBe('a')
    expect(parseSedEditCommand('sed -i -e "s/a/b/" f')?.replacement).toBe('b')
    expect(
      parseSedEditCommand('sed -i --expression=s/a/b/ f')?.pattern,
    ).toBe('a')
  })

  test('负例族 = null', () => {
    expect(parseSedEditCommand('echo s/a/b/')).toBeNull()
    expect(parseSedEditCommand('sed "s/a/b/" f')).toBeNull() // 无 -i
    expect(parseSedEditCommand('sed -i "s/a/b/" f1 f2')).toBeNull() // 双文件
    expect(parseSedEditCommand('sed -i -x "s/a/b/" f')).toBeNull() // 未知 flag
    expect(parseSedEditCommand('sed -i "s/a/b/x" f')).toBeNull() // 非法 flag
    expect(parseSedEditCommand('sed -i "d" f')).toBeNull() // 非替换式
  })

  test('isSedInPlaceEdit 判形', () => {
    expect(isSedInPlaceEdit('sed -i "s/a/b/" f')).toBe(true)
    expect(isSedInPlaceEdit('echo hi')).toBe(false)
  })
})

describe('applySedSubstitution BRE→ERE + 替换面', () => {
  const info = (over: Partial<SedEditInfo>): SedEditInfo => ({
    filePath: 'f',
    pattern: '',
    replacement: '',
    flags: '',
    extendedRegex: false,
    ...over,
  })

  test('ERE 模式直通（a+ = one-or-more）', () => {
    expect(
      applySedSubstitution(
        'xaaay',
        info({ pattern: 'a+', replacement: 'Z', extendedRegex: true }),
      ),
    ).toBe('xZy')
  })

  test('BRE \\+ = one-or-more（P-B3 判别支 1：占位符顺序锚点）', () => {
    // BRE \+ = 一个以上 → 转 ERE a+
    expect(
      applySedSubstitution('xaaay', info({ pattern: 'a\\+', replacement: 'Z' })),
    ).toBe('xZy')
  })

  test('BRE 裸 + = literal（P-B3 判别支 2）', () => {
    // BRE 无 -E：裸 + 字面量 → 转义后匹配 'a+' 整体
    expect(
      applySedSubstitution('xa+y', info({ pattern: 'a+', replacement: 'Z' })),
    ).toBe('xZy')
    // 同模式对 one-or-more 输入不匹配（literal 语义）
    expect(
      applySedSubstitution(
        'xaaay',
        info({ pattern: 'a+', replacement: 'Z' }),
      ),
    ).toBe('xaaay')
  })

  test('BRE \\\\+ = 字面反斜杠 + 字面 plus（P-B3 重选锚：保护步顺序）', () => {
    // S-B6 探针重选登记：原登记判别支 1/2（`a\+` / 裸 `a+`）对 BACKSLASH/PLUS
    // 保护步互换不敏感（两序结果同），0 红失效；真正敏感输入 = `\\+`
    // （双反斜杠 + 裸 plus：第二 \ 被 PLUS 步误消费仅当步序互换）。
    // 正序：BACKSLASH 先保护 `\\` → JS regex 匹配 'a\+' 整体 → 'xZy'。
    // 探针突变（S-B6 实测）：保护步互换 → `\\` 的第二 \ 被 PLUS 步当 `\+`
    // （one-or-more）→ regex 退化为 'a+' 字面 → 对 'xa\+y' 不匹配 →
    // 原样返回 恰 1 红。
    expect(
      applySedSubstitution(
        'xa\\+y',
        info({ pattern: 'a\\\\+', replacement: 'Z' }),
      ),
    ).toBe('xZy')
  })

  test('`&` = 全匹配 / `\\&` = 字面 &', () => {
    expect(
      applySedSubstitution('xfoox', info({ pattern: 'foo', replacement: '<&>' })),
    ).toBe('x<foo>x')
    expect(
      applySedSubstitution('xfoox', info({ pattern: 'foo', replacement: '\\&' })),
    ).toBe('x&x')
  })

  test('g flag 全局替换', () => {
    expect(
      applySedSubstitution(
        'aaa',
        info({ pattern: 'a', replacement: 'Z', flags: 'g', extendedRegex: true }),
      ),
    ).toBe('ZZZ')
  })

  test('转义 \/ = 字面 /', () => {
    expect(
      applySedSubstitution('xa/bx', info({ pattern: 'a\\/', replacement: 'X' })),
    ).toBe('xXbx')
  })

  test('非法 regex = 原内容返回', () => {
    expect(
      applySedSubstitution('(x', info({ pattern: '(', extendedRegex: true })),
    ).toBe('(x')
  })
})

describe('bashUtils 纯函数面', () => {
  test('stripEmptyLines 首尾空行剥除（内嵌空白保留）', () => {
    expect(stripEmptyLines('\n\na\nb\n\n')).toBe('a\nb')
    expect(stripEmptyLines('a  \n b')).toBe('a  \n b')
    expect(stripEmptyLines('\n \n')).toBe('')
    expect(stripEmptyLines('')).toBe('')
  })

  test('isImageOutput data-URI 形', () => {
    expect(isImageOutput('data:image/png;base64,AA==')).toBe(true)
    expect(isImageOutput('data:image/svg+xml;base64,AA==')).toBe(true)
    expect(isImageOutput('plain text')).toBe(false)
  })

  test('parseDataUri 解析/负例', () => {
    expect(parseDataUri('data:image/png;base64,QQ==')).toEqual({
      mediaType: 'image/png',
      data: 'QQ==',
    })
    expect(parseDataUri('garbage')).toBeNull()
    expect(parseDataUri('data:image/png;base64,')).toBeNull()
  })

  test('buildImageToolResult 图像块/负例', () => {
    const block = buildImageToolResult('data:image/png;base64,QQ==', 'tu_1')
    expect(block).toEqual({
      tool_use_id: 'tu_1',
      type: 'tool_result',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: 'QQ==' },
        },
      ],
    })
    expect(buildImageToolResult('nope', 'tu_1')).toBeNull()
  })

  test('formatOutput 截断面（BASH_MAX_OUTPUT_LENGTH env 面）', () => {
    withEnv({ BASH_MAX_OUTPUT_LENGTH: '10' }, () => {
      const r = formatOutput('line1\nline2\nline3')
      expect(r.totalLines).toBe(3)
      expect(r.truncatedContent).toBe(
        'line1\nline\n\n... [2 lines truncated] ...',
      )
      // 逐字语义：isImage = isImageOutput(content) 值（false 非 undefined，? 仅类型面）
      expect(r.isImage).toBe(false)
    })
    // 图像支不截断
    const img = 'data:image/png;base64,' + 'A'.repeat(100)
    withEnv({ BASH_MAX_OUTPUT_LENGTH: '10' }, () => {
      const r = formatOutput(img)
      expect(r.totalLines).toBe(1)
      expect(r.truncatedContent).toBe(img)
      expect(r.isImage).toBe(true)
    })
  })

  test('stdErrAppendShellResetMessage 附言', () => {
    expect(stdErrAppendShellResetMessage('err line  \n')).toBe(
      `err line\nShell cwd was reset to ${getOriginalCwd()}`,
    )
  })

  test('createContentSummary 计数 + 200 字预览截断', () => {
    const long = 'x'.repeat(250)
    const blocks = [
      { type: 'image' },
      { type: 'text', text: 'hello' },
      { type: 'text', text: long },
    ] as ContentBlockParam[]
    const summary = createContentSummary(blocks)
    expect(summary).toContain('[1 image]')
    expect(summary).toContain('[2 text blocks]')
    expect(summary).toContain('hello')
    expect(summary).toContain('x'.repeat(200) + '...')
    // 空 = 纯前缀
    expect(createContentSummary([])).toBe('MCP Result: ')
  })

  test('resizeShellImageOutput stdout 支（D-3 未缩放重编码）', async () => {
    const uri = 'data:image/png;base64,QQ=='
    await expect(resizeShellImageOutput(uri, undefined, undefined)).resolves.toBe(
      uri,
    )
    await expect(resizeShellImageOutput('not-a-uri', undefined, undefined)).resolves.toBe(
      null,
    )
  })
})
