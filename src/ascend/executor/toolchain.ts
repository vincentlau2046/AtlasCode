/**
 * ascend toolchain（bisheng/atc/msame/msprof/npu-smi 等）
 *
 * M3-S2（D-3 Ascend 独立实施波）：NpuToolchain 接口 + skill-prompt 占位符替换助手
 * 经 executor 域门面 re-export（单一事实源 = src/executor/toolchain.ts；ascend 域 DIP
 * 只 import executor 接口，不重复定义）。{{toolchain.commands.<key>}} 的二进制名映射
 * 由 AscendExecutor.commands（本域 toolchain 实例）提供，注册期经
 * applyToolchainPlaceholders 解析进 skill 文本。
 */
export { type NpuToolchain, applyToolchainPlaceholders } from 'src/executor'
