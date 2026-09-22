/**
 * diskOutput — task 输出磁盘层（C-Deep 切片 3 T3 填实，STUB_REGISTRY 登记）
 *
 * 旧仓 utils/task/diskOutput.ts 451L：getTaskOutputDir（首调 memoize，
 * join(getProjectTempDir(), getSessionId(), 'tasks')）/ DiskTaskOutput
 * 队列 drain / MAX_TASK_OUTPUT_BYTES 5GB cap / getTaskOutput tail 8MB。
 * getProjectTempDir 跨域边 → permissions 薄骨架注入（§8.14 注入序
 * permissions→task→hooks）；MAX_TASK_OUTPUT_BYTES + getTaskOutputPath
 * 接回 executor ShellCommand 残余（L280 killedForSize / L324 watchdog）。
 *
 * 当前态 = fail-fast stub（Task.ts createTaskStateBase 的 outputFile 消费，
 * T3 填实后从 STUB_REGISTRY 销项——实质内容 <5 行即空壳，门①强制登记）。
 */
export function getTaskOutputPath(taskId: string): string {
  throw new Error(`diskOutput 未填实（C-Deep 切片 3 T3）— getTaskOutputPath(${taskId}) 不可用`)
}
