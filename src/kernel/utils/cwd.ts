/**
 * tui/utils/cwd — re-export shim（W2-2d，§8.74.3）：本体已归
 * src/bootstrap/cwd.ts 域单源（旧仓 utils/cwd.ts 33L 逐字 C-Deep 切片 3 T4
 * 随迁；本地 ALS 重复体删除——两体逐字同源，域版头注已登记 pwd() 死分支
 * 裁剪〔严格类型下 val 恒 string，object 分支不可达〕= 零运行时差）。
 * 消费方（getCwd / runWithCwdOverride / pwd，66+ 站点）保留旧 import 路径
 * 不变；2e 删净波可将 import 路径直切 'src/bootstrap'（前向接缝登记）。
 */
export { getCwd, pwd, runWithCwdOverride } from 'src/bootstrap'
