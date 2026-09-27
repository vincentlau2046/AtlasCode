/**
 * engine/tools/team — SnipTool prompt 伴随件（C 桶 ③ shell·swarm 波 S-E2d；
 * §8.66 补差侧，旧仓 tools/SnipTool/prompt.ts 2L + def 内联 description/prompt
 * 文案随迁）。
 *
 * 旧仓来源（a8af45b）：src/tools/SnipTool/SnipTool.ts def 成员
 * description()（短描述）/ prompt()（长提示词）逐字；旧 prompt.ts 本体 =
 * `export const prompt: any = '';` 空导出（真文案 = def prompt() 成员，
 * 本文件承载）。
 */

/** 旧 def description() 逐字（web 族口径：短描述面经 team/ 子门面
 * SNIP_DESCRIPTION 别名 re-export）。 */
export const DESCRIPTION =
  'Snips the current conversation history into a compact summary.'

/** 旧 def prompt() 逐字（新契约 description() 单面 = 本 PROMPT，
 * sendMessageTool delta ⑧ 先例）。 */
export const PROMPT =
  'You can use this tool to snip (summarize) the conversation history, ' +
  'replacing older turns with a short summary to keep the context window small.'
