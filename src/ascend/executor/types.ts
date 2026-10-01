/**
 * ascend executor 类型
 *
 * M3-S2（D-3 Ascend 独立实施波）：AscendConfig 类型单一事实源 = src/executor/types.ts
 * （AtlasCode 侧已登记"保留供 ascend 域 import，type-only 零运行时耦合"；此处 re-export
 * 供 ascend 域 STR-1 消费 + 组合根注入）。defaultAscendConfig 从 AtlasHarness
 * src/core/factory.ts 平移（读 env 一次，启动后不可变）。
 */
import type { AscendConfig } from 'src/executor'

export type { AscendConfig }
export type { MockFixture } from './ascendMockFixtures'

/**
 * 读 env 一次组装 AscendConfig（启动后不可变；旧仓 factory.ts defaultAscendConfig 逐字）。
 * 组合根（compose.ts / mount.ts）经此构造 AscendExecutor。
 */
export function defaultAscendConfig(): AscendConfig {
  return {
    mock:
      process.env.ATLAS_ASCEND_MOCK === '1' ||
      (process.env.ATLAS_MOCK_ON_NONINTERACTIVE !== '0' &&
        process.env.ATLAS_MOCK_ON_NONINTERACTIVE !== undefined),
    cannVersion: process.env.CANN_PKG_VER || '8.0.0',
    templateVersion: process.env.ASCEND_TEMPLATE_VERSION || '8.0.0',
    deviceId: parseInt(process.env.ASCEND_DEVICE_ID || '0', 10),
    timeoutMs: parseInt(process.env.ASCEND_TIMEOUT || '120000', 10),
    promptEnabled: process.env.ATLAS_ASCEND_PROMPT !== '0',
  }
}
