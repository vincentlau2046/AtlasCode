/**
 * 跨域常量叶子（C-Deep 切片 3 T3：task 输出磁盘上限单一事实源）。
 *
 * 旧仓单一事实源分裂两处：utils/task/diskOutput.ts L30-31（
 * MAX_TASK_OUTPUT_BYTES / MAX_TASK_OUTPUT_BYTES_DISPLAY）+
 * utils/ShellCommand.ts L54（SIZE_WATCHDOG_INTERVAL_MS）。上限的两个
 * 消费者在新仓分属两域——task（diskOutput：pipe 模式 DiskTaskOutput
 * 超限只追加截断标记 + 丢 chunk）与 executor（ShellCommand：file 模式
 * 5s 轮询 stat watchdog，超限 kill 后台任务）——L3 四域互不 import，
 * shared 是唯一跨域叶子下沉处 → 上限落此单一事实源。watchdog 轮询
 * 间隔单消费者（executor）→ 留 executor 域内（ShellCommand.ts 模块
 * 常量），不随下沉。
 *
 * 显示串不再单设 DISPLAY 常量：两消费点改用 shared formatFileSize(bytes)
 * 推导（默认 5GB → '5GB'，与旧仓 '5GB' 字面一致；自定义上限时随值
 * 缩放，优于旧仓硬编码字面）。
 */

/** task 输出磁盘文件上限：5GB。pipe 模式丢弃线 = file 模式 watchdog kill 线。 */
export const MAX_TASK_OUTPUT_BYTES = 5 * 1024 * 1024 * 1024
