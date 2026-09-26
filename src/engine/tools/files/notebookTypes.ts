/**
 * engine/tools/files — Notebook 型骨架（§8.55 S-C3，旧仓
 * src/types/notebook.ts 9L 逐字随迁）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - 旧仓本文件即全 `any` stub 型（上游选择：NotebookCell 族未定型，
 *    LSP 宽面同口径）；纯类型文件零运行时，逐字随迁保 import 面。
 *    真实型收紧（VSCode NotebookCell 形状）= 前向接缝，不阻塞本波。
 */
export type NotebookCellType = any;
export type NotebookCell = any;
export type NotebookDocument = any;
export const NotebookCellKind: any = { Markup: 1, Code: 2 };
export type NotebookContent = any;
export type NotebookCellSource = any;
export type NotebookCellSourceOutput = any;
export type NotebookOutputImage = any;
export type NotebookCellOutput = any;
