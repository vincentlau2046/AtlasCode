/**
 * ascend executor 组合根注入点（M3-S3，D-3 Ascend 独立实施波）。
 *
 * 16 工具经 getAscendExecutor() 取 AscendExecutor 实例（DIP：工具不引组合根
 * compose.ts，经域内访问点取实例）。默认 = defaultAscendConfig() 惰性构造
 * （等价旧仓 getCoreDependencies().ascendExecutor 单例）；S5 mount.ts 经
 * setAscendExecutor 替换为组合根装配好的实例（ModelProvider 单例"注入窗口"
 * 同族先例——组合根唯一装配点，工具面零改动）。
 */
import { AscendExecutor } from './AscendExecutor'
import { defaultAscendConfig } from './types'

let _instance: AscendExecutor | null = null

/** 组合根注入点：S5 mount 装配后调用，替换惰性默认实例。 */
export function setAscendExecutor(exec: AscendExecutor): void {
  _instance = exec
}

/** 取 AscendExecutor 实例（惰性默认 = defaultAscendConfig()）。 */
export function getAscendExecutor(): AscendExecutor {
  if (!_instance) _instance = new AscendExecutor(defaultAscendConfig())
  return _instance
}

/** 测试面：还原惰性默认（避免跨文件泄漏 setAscendExecutor 的实例）。 */
export function resetAscendExecutorForTests(): void {
  _instance = null
}
