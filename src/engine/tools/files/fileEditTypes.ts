/**
 * engine/tools/files — FileEdit 类型面（C 桶 ① 子波 3 §8.55 S-C1 先落
 * 纯类型块；S-C6 扩 JSON schema 块）。
 *
 * 旧仓来源（a8af45b）：src/tools/FileEditTool/types.ts 85L 的纯类型部分
 * （FileEditInput / EditInput / FileEdit）。delta 登记：
 *  - 旧 inputSchema/outputSchema = zod lazySchema（zod/v4 + semanticBoolean
 *    预处理）→ 新 shared Tool 契约 = 纯 JSON schema（S-C6 转写，模型面
 *    type 仍 boolean，字符串容忍经 files/semantic.ts 运行时转换）；
 *    outputSchema 新契约无槽位 → 不迁（结果面 = mapToolResultToToolResultBlockParam
 *    纯文本，登记）。
 *  - 旧 FileEditInput = z.output<InputSchema>（semanticBoolean 下 input 侧
 *    unknown → output 侧 replace_all: boolean | undefined）→ 新手工 duck
 *    （bashToolInput 先例）：replace_all 可选。
 */

// Parsed input — what call() receives（duck 型，类型位单一事实源）
export type FileEditInput = {
  file_path: string
  old_string: string
  new_string: string
  /** 旧 zod .default(false).optional()：缺省 false；字符串 "false"/"true" 经
   *  semanticToBoolean 运行时容忍（§8.55 delta 登记）。 */
  replace_all?: boolean
}

// Individual edit without file_path
export type EditInput = Omit<FileEditInput, 'file_path'>

// Runtime version where replace_all is always defined（call() 入口补齐）
export type FileEdit = {
  old_string: string
  new_string: string
  replace_all: boolean
}
