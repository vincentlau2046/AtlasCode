/**
 * engine/tools/files — Jupyter Notebook 解析面（§8.55 S-C3，旧仓
 * src/utils/notebook.ts 224L 逐字随迁；delta 仅 import 重指 + 宽骨架
 * 型替换 + expandPath 2 参显式化，函数体逻辑逐字不变）。
 *
 * 消费面：Read 本体 notebook 支（S-C5 随迁）readNotebook /
 * mapNotebookCellsToToolResult / parseCellId。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - ImageBlockParam / TextBlockParam → shared ContentBlockParam 宽骨架
 *    （新仓 shared/types.ts 无独立具名块型 = B 波分叉契约，S-7b 鸭子
 *    最小形先例；构造面 { type:'text'|'image', ... } 经索引签名零行为差）。
 *  - BASH_TOOL_NAME → ../toolNames（engine/tools 单一事实源）。
 *  - formatOutput → ../bash 子门面（bashUtils L164，旧 BashTool/utils）。
 *  - jsonParse → ../../session 门面（engine/session 域内，旧
 *    utils/slowOperations）。
 *  - Notebook 型族 → ./notebookTypes（旧 types/notebook.ts any-stub 逐字）。
 *  - expandPath 2 参纪律（S-C1 先例）：旧 1 参缺省 cwd →
 *    expandPath(notebookPath, getCwd()) 逐调用点显式化。
 *  - getFsImplementation（含 readFileBytes 加法，S-C1 fs-operations）→
 *    shared。
 */
import { BASH_TOOL_NAME } from '../toolNames'
import { formatOutput } from '../bash'
import type {
  NotebookCell,
  NotebookCellOutput,
  NotebookCellSource,
  NotebookCellSourceOutput,
  NotebookContent,
  NotebookOutputImage,
} from './notebookTypes'
import {
  ContentBlockParam,
  expandPath,
  getFsImplementation,
  ToolResultBlockParam,
} from '../../../shared'
import { getCwd } from '../../../bootstrap'
import { jsonParse } from '../../session'

const LARGE_OUTPUT_THRESHOLD = 10000

function isLargeOutputs(
  outputs: (NotebookCellSourceOutput | undefined)[],
): boolean {
  let size = 0
  for (const o of outputs) {
    if (!o) continue
    size += (o.text?.length ?? 0) + (o.image?.image_data.length ?? 0)
    if (size > LARGE_OUTPUT_THRESHOLD) return true
  }
  return false
}

function processOutputText(text: string | string[] | undefined): string {
  if (!text) return ''
  const rawText = Array.isArray(text) ? text.join('') : text
  const { truncatedContent } = formatOutput(rawText)
  return truncatedContent
}

function extractImage(
  data: Record<string, unknown>,
): NotebookOutputImage | undefined {
  if (typeof data['image/png'] === 'string') {
    return {
      image_data: data['image/png'].replace(/\s/g, ''),
      media_type: 'image/png',
    }
  }
  if (typeof data['image/jpeg'] === 'string') {
    return {
      image_data: data['image/jpeg'].replace(/\s/g, ''),
      media_type: 'image/jpeg',
    }
  }
  return undefined
}

function processOutput(output: NotebookCellOutput) {
  switch (output.output_type) {
    case 'stream':
      return {
        output_type: output.output_type,
        text: processOutputText(output.text),
      }
    case 'execute_result':
    case 'display_data':
      return {
        output_type: output.output_type,
        text: processOutputText(output.data?.['text/plain']),
        image: output.data && extractImage(output.data),
      }
    case 'error':
      return {
        output_type: output.output_type,
        text: processOutputText(
          `${output.ename}: ${output.evalue}\n${output.traceback.join('\n')}`,
        ),
      }
  }
}

function processCell(
  cell: NotebookCell,
  index: number,
  codeLanguage: string,
  includeLargeOutputs: boolean,
): NotebookCellSource {
  const cellId = cell.id ?? `cell-${index}`
  const cellData: NotebookCellSource = {
    cellType: cell.cell_type,
    source: Array.isArray(cell.source) ? cell.source.join('') : cell.source,
    execution_count:
      cell.cell_type === 'code' ? cell.execution_count || undefined : undefined,
    cell_id: cellId,
  }
  // Avoid giving text cells the code language.
  if (cell.cell_type === 'code') {
    cellData.language = codeLanguage
  }

  if (cell.cell_type === 'code' && cell.outputs?.length) {
    const outputs = cell.outputs.map(processOutput)
    if (!includeLargeOutputs && isLargeOutputs(outputs)) {
      cellData.outputs = [
        {
          output_type: 'stream',
          text: `Outputs are too large to include. Use ${BASH_TOOL_NAME} with: cat <notebook_path> | jq '.cells[${index}].outputs'`,
        },
      ]
    } else {
      cellData.outputs = outputs
    }
  }

  return cellData
}

function cellContentToToolResult(cell: NotebookCellSource): ContentBlockParam {
  const metadata = []
  if (cell.cellType !== 'code') {
    metadata.push(`<cell_type>${cell.cellType}</cell_type>`)
  }
  if (cell.language !== 'python' && cell.cellType === 'code') {
    metadata.push(`<language>${cell.language}</language>`)
  }
  const cellContent = `<cell id="${cell.cell_id}">${metadata.join('')}${cell.source}</cell id="${cell.cell_id}">`
  return {
    text: cellContent,
    type: 'text',
  }
}

function cellOutputToToolResult(
  output: NotebookCellSourceOutput,
): ContentBlockParam[] {
  const outputs: ContentBlockParam[] = []
  if (output.text) {
    outputs.push({
      text: `\n${output.text}`,
      type: 'text',
    })
  }
  if (output.image) {
    outputs.push({
      type: 'image',
      source: {
        data: output.image.image_data,
        media_type: output.image.media_type,
        type: 'base64',
      },
    })
  }
  return outputs
}

function getToolResultFromCell(cell: NotebookCellSource) {
  const contentResult = cellContentToToolResult(cell)
  const outputResults = cell.outputs?.flatMap(cellOutputToToolResult)
  return [contentResult, ...(outputResults ?? [])]
}

/**
 * Reads and parses a Jupyter notebook file into processed cell data
 */
export async function readNotebook(
  notebookPath: string,
  cellId?: string,
): Promise<NotebookCellSource[]> {
  // delta（S-C3）：expandPath 2 参纪律——旧 1 参缺省 cwd → 显式 getCwd()
  const fullPath = expandPath(notebookPath, getCwd())
  const buffer = await getFsImplementation().readFileBytes(fullPath)
  const content = buffer.toString('utf-8')
  const notebook = jsonParse(content) as NotebookContent
  const language = notebook.metadata.language_info?.name ?? 'python'
  if (cellId) {
    const cell = notebook.cells.find(c => c.id === cellId)
    if (!cell) {
      throw new Error(`Cell with ID "${cellId}" not found in notebook`)
    }
    return [processCell(cell, notebook.cells.indexOf(cell), language, true)]
  }
  return notebook.cells.map((cell, index) =>
    processCell(cell, index, language, false),
  )
}

/**
 * Maps notebook cell data to tool result block parameters with sophisticated text block merging
 */
export function mapNotebookCellsToToolResult(
  data: NotebookCellSource[],
  toolUseID: string,
): ToolResultBlockParam {
  const allResults = data.flatMap(getToolResultFromCell)

  // Merge adjacent text blocks
  return {
    tool_use_id: toolUseID,
    type: 'tool_result' as const,
    content: allResults.reduce<ContentBlockParam[]>(
      (acc, curr) => {
        if (acc.length === 0) return [curr]

        const prev = acc[acc.length - 1]
        if (prev && prev.type === 'text' && curr.type === 'text') {
          // Merge the text blocks
          // delta（S-C3）：宽骨架索引签名 → text 成员 cast 收窄
          // （纯类型面，运行时逐字旧行为）
          ;(prev as unknown as { text: string }).text +=
            '\n' + (curr as unknown as { text: string }).text
          return acc
        }

        acc.push(curr)
        return acc
      },
      [],
    ),
  }
}

export function parseCellId(cellId: string): number | undefined {
  const match = cellId.match(/^cell-(\d+)$/)
  if (match && match[1]) {
    const index = parseInt(match[1], 10)
    return isNaN(index) ? undefined : index
  }
  return undefined
}
