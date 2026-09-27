/**
 * autoMode 子域 — 分类器自动放行跟踪（§8.65，旧仓 classifierApprovals.ts 88L 语义）。
 *
 * 旧仓来源：setClassifierApproval / getClassifierApproval（bash 分类器）+
 * setYoloClassifierApproval / getYoloClassifierApproval（auto-mode 分类器）+
 * set/clear/is/subscribe ClassifierChecking（检查中指示）+ delete/clear。
 * 填充点 = useCanUseTool.ts / permissions.ts，读取点 = UserToolSuccessMessage.tsx
 * （TUI 面，消费随 TUI / provider 波）。本波冻结面 + 测试。
 *
 * 裁剪 delta（复审勿当遗漏重提）：
 * ① 旧 `feature('BASH_CLASSIFIER')` / `feature('TRANSCRIPT_CLASSIFIER')` 门 → 新仓
 *    bun:bundle feature() 恒 false，保留门则全部 setter/getter 恒 no-op（无价值 + 不可测）。
 *    故新仓恒生效（门复活随 provider 波 ③ 接线时按需加回）。两门裁后语义不同：
 *    - TRANSCRIPT 门（yolo/auto-mode 支）：旧仓 ON_BY_DEFAULT 默认开 → 裁门 =
 *      旧默认保真（行为不变）。
 *    - BASH 门（set/getClassifierApproval）：旧仓默认关（非 ON_BY_DEFAULT）→ 裁门
 *      = 真激活（旧默认下恒 no-op，新仓恒生效）。当前零活消费方（bash 分类器
 *      本体未随迁，前向接缝），激活为惰性无副作用，登记防复审误判为遗漏。
 * ② 旧 `createSignal`（utils/signal.js）→ 子域本地 createSignal（permissions 域 L3 自治
 *    不 import engine/messaging；本地实现 subscribe/emit/clear 逐字语义，供
 *    subscribeClassifierChecking 消费——检查中指示 UI 面随 TUI 波）。
 */

type ClassifierApproval = {
  classifier: 'bash' | 'auto-mode'
  matchedRule?: string
  reason?: string
}

const CLASSIFIER_APPROVALS = new Map<string, ClassifierApproval>()
const CLASSIFIER_CHECKING = new Set<string>()

/** 本地事件信号原语（delta ②）：纯监听器集合，无快照/getState。 */
type Signal = {
  subscribe: (listener: () => void) => () => void
  emit: () => void
  clear: () => void
}
function createSignal(): Signal {
  const listeners = new Set<() => void>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    emit() {
      for (const l of listeners) l()
    },
    clear() {
      listeners.clear()
    },
  }
}
const classifierChecking = createSignal()

export function setClassifierApproval(
  toolUseID: string,
  matchedRule: string,
): void {
  CLASSIFIER_APPROVALS.set(toolUseID, {
    classifier: 'bash',
    matchedRule,
  })
}

export function getClassifierApproval(
  toolUseID: string,
): string | undefined {
  const approval = CLASSIFIER_APPROVALS.get(toolUseID)
  if (!approval || approval.classifier !== 'bash') return undefined
  return approval.matchedRule
}

export function setYoloClassifierApproval(
  toolUseID: string,
  reason: string,
): void {
  CLASSIFIER_APPROVALS.set(toolUseID, { classifier: 'auto-mode', reason })
}

export function getYoloClassifierApproval(
  toolUseID: string,
): string | undefined {
  const approval = CLASSIFIER_APPROVALS.get(toolUseID)
  if (!approval || approval.classifier !== 'auto-mode') return undefined
  return approval.reason
}

export function setClassifierChecking(toolUseID: string): void {
  CLASSIFIER_CHECKING.add(toolUseID)
  classifierChecking.emit()
}

export function clearClassifierChecking(toolUseID: string): void {
  CLASSIFIER_CHECKING.delete(toolUseID)
  classifierChecking.emit()
}

export const subscribeClassifierChecking = classifierChecking.subscribe

export function isClassifierChecking(toolUseID: string): boolean {
  return CLASSIFIER_CHECKING.has(toolUseID)
}

export function deleteClassifierApproval(toolUseID: string): void {
  CLASSIFIER_APPROVALS.delete(toolUseID)
}

export function clearClassifierApprovals(): void {
  CLASSIFIER_APPROVALS.clear()
  CLASSIFIER_CHECKING.clear()
  classifierChecking.emit()
}
