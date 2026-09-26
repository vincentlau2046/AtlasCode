/**
 * engine/tools/bash — windowsPathToPosixPath（§8.53 S-T2b 域内最小实现 →
 * §8.55 S-C2 收敛 shared 单一事实源，C-Deep T5 / §8.55 S-C1 logError
 * 提升先例）。
 *
 * 本文件保留为 bash 域内 re-export 面：bashPermissions / bash 门面
 * （index.ts:171）`./windowsPaths` import 零改动。函数体见
 * shared/windowsPaths（旧仓 utils/windowsPaths.ts 逐字；memoizeWithLRU
 * 裁 = S-T2b 已登记，复审勿当遗漏重提）。
 */
export { windowsPathToPosixPath } from '../../../shared'
