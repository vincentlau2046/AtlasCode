/**
 * task 域门面（STR-1：外部消费者只 import 域根 index）。
 *
 * L3 自治：task 域不 import 其他域——diskOutput 的 getProjectTempDir 跨域边
 * 经 permissions 薄骨架注入斩断（§8.14 注入序 permissions→task→hooks）。
 *
 * 当前面（切片 3 任务清单 T1 种子）：
 * - task.ts：TaskType/TaskStatus + canonical TaskId（前缀族 b/a/r/t/w/m/d）
 *   + createTaskStateBase
 * - diskOutput.ts：fail-fast stub（T3 填实，STUB_REGISTRY 登记，填实即销）
 * T2 加：TaskOutput 真核心（spill/clear/delete + static 轮询 API 保留）
 */
export * from './task'
export * from './diskOutput'
