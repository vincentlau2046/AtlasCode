/**
 * bin 入口（package.json "atlascode" → dist/cli.js；build 根路径不变）— 薄壳。
 *
 * S-C1 壳瘦身（§8.71.1.4）：CLI 公共逻辑归 src/cli/ 公共域（用户裁定 2026-09-28：
 * CLI = 跨壳公共层，不属于壳）。本文件仅保 bin 占位——前向接缝登记：S-C2 落
 * cli 域入口（parse + dispatch + dev 面）后，本文件换为显式 re-export 承接 bin；
 * TUI 默认启动支归 launcher 薄壳（#152 壳波），不经 bin。
 *
 * 状态: A 波骨架占位（export {} 零行为；dist/cli.js 0 bytes = 已知基线）。
 */
export {}
