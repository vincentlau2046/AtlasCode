/**
 * engine/tools/notebook 子门面（S-E2 §8.61 notebook 族子波，STR-1 显式名块
 * 纪律）。
 *
 * 覆盖：NotebookEditTool 本体 + JSON schema 常量 + prompt 面 + Input/Output
 * duck 型 2（旧仓 tools/NotebookEditTool 490L 本体 + prompt 3L + UI 92L 裁剪
 * 随迁；LSP 860L + client 域 2464L 重分类 D 波 LSP 域，§8.61.1.1）。
 *
 * 纪律（tools/index.ts config/askUser 块先例）：逐名显式 re-export，无
 * `export *`；各文件头注 delta 登记不随门面重复（单一事实源 = 各模块头注）。
 *
 * 消费方：tools/ 门面 re-export 块 + 注册表 49 口径无条件注册位
 * （§8.61.1.3）。
 */
export {
  NOTEBOOK_EDIT_TOOL_INPUT_SCHEMA,
  NotebookEditTool,
  type NotebookEditInput,
  type NotebookEditOutput,
} from './notebookEditTool'
export { DESCRIPTION, PROMPT } from './notebookEditPrompt'
