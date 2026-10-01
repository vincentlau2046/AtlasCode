// D-2a S1（M5 切端）：压缩警告抑制态面单源迁 engine（engine/context/
// compactWarningState.ts，React-free store）——本文件退化为 re-export 壳：
// orchestrator 内部（microCompact clear/suppress 调用）+ React hook
// compactWarningHook（useSyncExternalStore 订阅）经本壳统一拿到 engine store
// 单实例（S9 随 orchestrator 目录删除）。
export {
  compactWarningStore,
  suppressCompactWarning,
  clearCompactWarningSuppression,
} from 'src/engine'
