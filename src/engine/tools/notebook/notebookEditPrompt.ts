/**
 * engine/tools/notebook — NotebookEditTool prompt 面（S-E2 §8.61 notebook 族
 * 子波）。
 *
 * 旧仓来源（a8af45b）：src/tools/NotebookEditTool/prompt.ts 3L 逐字随迁
 * （DESCRIPTION + PROMPT）。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① PROMPT 含 legacy 措辞「The cell_number is 0-indexed」逐字保留：旧 prompt
 *    的 cell_number 措辞与输入字段 cell_id 并存（旧仓输入面早已是 cell_id，
 *    prompt 未同步更新）→ 逐字保真 > 订正原则，不修改（B 预核登记，复审勿当
 *    笔误重提）。
 */

export const DESCRIPTION =
  'Replace the contents of a specific cell in a Jupyter notebook.'
export const PROMPT = `Completely replaces the contents of a specific cell in a Jupyter notebook (.ipynb file) with new source. Jupyter notebooks are interactive documents that combine code, text, and visualizations, commonly used for data analysis and scientific computing. The notebook_path parameter must be an absolute path, not a relative path. The cell_number is 0-indexed. Use edit_mode=insert to add a new cell at the index specified by cell_number. Use edit_mode=delete to delete the cell at the index specified by cell_number.`
