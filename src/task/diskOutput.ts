/**
 * diskOutput — task 输出磁盘层（C-Deep 切片 3 T3 填实，当前态 = fail-fast 面）
 *
 * 旧仓 utils/task/diskOutput.ts 451L：getTaskOutputDir（首调 memoize，
 * join(getProjectTempDir(), getSessionId(), 'tasks')）/ DiskTaskOutput
 * 队列 drain / MAX_TASK_OUTPUT_BYTES 5GB cap（append 超限只追加截断标记 +
 * 丢 chunk）/ getTaskOutput tail 8MB / getTaskOutputDelta 偏移读 /
 * cleanupTaskOutput 真删。getProjectTempDir 跨域边 → permissions 薄骨架
 * 注入（§8.14 注入序 permissions→task→hooks）；MAX_TASK_OUTPUT_BYTES +
 * getTaskOutputPath 接回 executor ShellCommand 残余（L280 killedForSize /
 * L324 watchdog）。
 *
 * 当前态 = fail-fast（T2 起 TaskOutput ctor/spill 消费本面即抛错，非静默
 * 透传——loud ≠ hollow，同 port 注入窗口 fail-fast idiom）：T3 填实后
 * 本注释替换为真实现头注。真实现跟踪 = §8.14 / 任务清单 T3 / T7 H6 断言
 * ②③（deleteOutputFile 真删 + 5GB cap 同构边界）/ 门③ wave-c tag 清零兜底。
 */
export function getTaskOutputPath(taskId: string): string {
  throw new Error(
    `diskOutput 未填实（C-Deep 切片 3 T3）— getTaskOutputPath(${taskId}) 不可用`,
  )
}

export class DiskTaskOutput {
  constructor(_taskId: string) {
    throw new Error(
      'diskOutput 未填实（C-Deep 切片 3 T3）— DiskTaskOutput 不可用',
    )
  }
  append(_content: string): void {
    throw new Error('diskOutput 未填实（C-Deep 切片 3 T3）')
  }
  flush(): Promise<void> {
    throw new Error('diskOutput 未填实（C-Deep 切片 3 T3）')
  }
  cancel(): void {
    throw new Error('diskOutput 未填实（C-Deep 切片 3 T3）')
  }
}
