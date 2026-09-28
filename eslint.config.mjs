/**
 * AtlasCode 边界 lint 配置（A 波, charter L8 规则映射；v0.12 八域扩展 + tests 门面收口）
 *
 * 16 element types（L3 v0.12 十二顶层目录 + C 桶 ③ shell·swarm 波 swarm 域 §8.66 R1
 * + §8.67 D 波 S-E2c lsp 域 + §8.68 remote 波 S-E2a remote 域
 * + §8.68 remote 波 S-E2b mcp 域）+ 1 特例（mount
 * 挂载边, DEP-5 白名单）。
 * 规则映射：
 *   DEP-1 单向无环     → element-types: shared 禁一切内部依赖
 *   DEP-2 八域零向上   → element-types: 八域 allow=[shared] only
 *   DEP-3 域依赖洁净   → element-types: 八域不 import utils/services（只 shared）
 *   DEP-4 engine 隔离  → element-types: engine allow=[shared+八域], 不含 ascend/atlascode
 *   DEP-5 挂载边       → element-types: atlascode 不含 ascend; mount 特例 allow ascend
 *   STR-1 门面收口     → entry-point: 外部只许 import index.ts（src 域间 + tests→src）
 *   PRT-2 零副作用     → no-restricted-syntax: 顶层 register* 调用
 *
 * v0.12（2026-09-23）：
 *   - 四域→八域，task/bootstrap/permissions/hooks 经 port 解耦加入（每域 allow=[shared] only）
 *   - tests/ 纳入 STR-1 entry-point（#2 缺口修复：tests import src 必须走域根 index.ts，
 *     不得 reach 内部文件；tests 内部 import fixtures/helpers 不受约束）
 *
 * lint 配置层可演进（charter L847）；eslint 具体选项 A 波定, 后续波次可微调。
 * 全 error 无存量豁免（charter L848）。
 */
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";

// ── elements 定义（src/tests 共用单一事实源）──
const ELEMENTS = [
  // mount 必须在 atlascode 之前：file-mode 优先匹配, 避免 mount.ts 落入 atlascode folder-mode
  { type: "mount", pattern: "src/atlascode/mount.ts", mode: "file" },

  { type: "shared", pattern: "src/shared", mode: "folder" },
  { type: "sandbox", pattern: "src/sandbox", mode: "folder" },
  { type: "memory", pattern: "src/memory", mode: "folder" },
  { type: "executor", pattern: "src/executor", mode: "folder" },
  { type: "modelprovider", pattern: "src/modelprovider", mode: "folder" },
  // v0.12 C-Deep 四域（port 解耦顶层域, allow=[shared] only）
  { type: "task", pattern: "src/task", mode: "folder" },
  { type: "bootstrap", pattern: "src/bootstrap", mode: "folder" },
  { type: "permissions", pattern: "src/permissions", mode: "folder" },
  { type: "hooks", pattern: "src/hooks", mode: "folder" },
  { type: "engine", pattern: "src/engine", mode: "folder" },
  { type: "ascend", pattern: "src/ascend", mode: "folder" },
  // C 桶 ③ shell·swarm 波（§8.66 R1）：swarm 新顶层域（旧仓 swarm 树 7217L 可插拔域包）
  { type: "swarm", pattern: "src/swarm", mode: "folder" },
  // §8.67 D 波 S-E2c：lsp 新顶层域（旧仓 services/lsp 9 文件 2464L client 域
  // + 配置注入窗 + manager 单例；engine/tools/lsp LSPTool 本体消费其门面）
  { type: "lsp", pattern: "src/lsp", mode: "folder" },
  // §8.68 remote 波 S-E2a：remote 新顶层域（旧仓 UDS 5 站点族基础设施：门
  // isUdsInboxEnabled + socket 客户端 stub + messaging 启动 + bridge handle +
  // 跨 session 消息 stub + parseAddress 消费窗 re-export；engine/tools/team
  // SendMessageTool 5 站点族消费其门面，L3 engine↛swarm 经本域门面保持）
  { type: "remote", pattern: "src/remote", mode: "folder" },
  // §8.68 remote 波 S-E2b：mcp 新顶层域（旧仓 services/mcp 3209L client.ts
  // 6 文件落域：8 型 config zod union + 本地 JSON-RPC stdio 客户端 + 最小
  // 2 源发现 + 连接生命周期 manager（stdio live / 非 stdio 前向接缝登记）+
  // 3 供应商 LRU 20；LSP 域先例同构，engine 侧反向接线 DEP-4 allow 面）
  { type: "mcp", pattern: "src/mcp", mode: "folder" },
  // §8.71 CLI 公共域波 S-C1：cli 新顶层公共域（跨壳公共层，用户裁定 2026-09-28：
  // CLI 不属于任何壳；壳（atlascode/ + 未来 atlasoffice/）降消费方；不塞
  // shared（叶子域纪律：CLI 面需消费 engine 根门面））
  { type: "cli", pattern: "src/cli", mode: "folder" },
  { type: "atlascode", pattern: "src/atlascode", mode: "folder" },
];

// ── STR-1 entry-point 规则（src 域间 + tests→src 共用）──
const ENTRY_POINT_RULES = [
  "error",
  {
    default: "disallow",
    rules: [
      // folder-mode 元素: 只 index.ts 是公共出口
      { target: "*", allow: "index.ts" },
      // mount (file-mode): 单文件元素, 自身即入口, 允许被 import
      { target: "mount", allow: "mount.ts" },
    ],
  },
];

export default tseslint.config(
  // ── 全局忽略 ──
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "tests/fixtures/**",
      "scripts/**",
      "ascend-official/**",
    ],
  },

  // ── TS 基座（parser + recommended, src + tests 共用）──
  ...tseslint.configs.recommended,

  // ── src 边界规则（DEP + STR-1 + PRT-2）──
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    plugins: {
      boundaries,
    },
    settings: {
      "boundaries/elements": ELEMENTS,
      "import/resolver": {
        typescript: { project: "./tsconfig.json" },
      },
    },
    rules: {
      // Claude Code fork 风格：tsconfig noImplicitAny=false, 全仓 SDK option 类型
      // 广用 any（旧仓 879 调用点）。no-explicit-any 与基座风格冲突, 关闭。
      // 边界/门面/副作用规则仍全 error（这些是 AtlasCode 架构核心）。
      "@typescript-eslint/no-explicit-any": "off",
      // _ 前缀 = 故意未用（TS 标准约定，no-op stub / API 兼容保留参数）
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // ── DEP · 依赖方向（lint 桶, A 波全 error）──
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            // DEP-1: shared 是唯一叶子, 不 import 任何内部模块
            {
              from: "shared",
              disallow: [
                "shared", "sandbox", "memory", "executor", "modelprovider",
                "task", "bootstrap", "permissions", "hooks",
                "engine", "ascend", "swarm", "lsp", "remote", "mcp",
                "atlascode", "mount",
              ],
            },
            // DEP-2/3: 八域零向上 — 只依赖 shared（不 import engine/ascend/atlascode/彼此）
            // v0.12: 四域→八域，task/bootstrap/permissions/hooks 经 port 解耦加入
            //        （port 类型/适配器经 compose.ts 注入, 非跨域 import → allow=[shared] only 成立）
            {
              from: ["sandbox", "memory", "executor", "modelprovider", "task", "bootstrap", "permissions", "hooks"],
              allow: ["shared"],
            },
            // DEP-1/4: engine 依赖八域+shared 向下合法; 不依赖 atlascode/ascend（DEP-4）
            // v0.12: 四域→八域（engine 波接线 hooks-runner/permissions-engine/task 消费）
            {
              from: "engine",
              allow: ["shared", "sandbox", "memory", "executor", "modelprovider", "task", "bootstrap", "permissions", "hooks", "lsp", "remote", "mcp"],
            },
            // ascend (域包): DIP — 依赖 shared + engine(port 接口) + executor(NpuToolchain 接口)
            {
              from: "ascend",
              allow: ["shared", "engine", "executor"],
            },
            // swarm (C 桶 ③ §8.66 R1): 消费型顶层域 — shared(日志/类型/Message 单一事实源)
            // + bootstrap(cwd 状态, exec no-cwd 变体) + permissions(poller 校验面
            // permissionUpdateSchema) + modelprovider(getRoleModel 窄面) + task(S-E2b
            // 任务状态面) + engine(messaging/mailbox/worktree-exec/runAgent/compaction
            // 门面直连, R7 裁定更新: P-S1/P-S2 不建 port) + memory(S-E2b 落位登记:
            // teamHelpers getAtlasConfigHomeDir teams 目录 + teamMemoryOps
            // getAutoMemPath/isAutoMemoryEnabled team 记忆支);
            // 不依赖 ascend/atlascode/hooks。
            // S-E2b/c 实 import 图若需扩 allow 列表, 随该切片头注登记。
            {
              from: "swarm",
              allow: [
                "shared", "bootstrap", "permissions", "modelprovider",
                "task", "engine", "memory",
              ],
            },
            // lsp (§8.67 D 波 S-E2c): LSP client 域 — shared(日志/错误/类型
            // 单一事实源) + bootstrap(cwd 状态, server 工作根面); 不依赖
            // engine/ascend/atlascode/swarm（engine 侧反向接线:
            // engine/tools/lsp LSPTool 本体 → lsp 域门面, DEP-4 allow 面）。
            {
              from: "lsp",
              allow: ["shared", "bootstrap"],
            },
            // remote (§8.68 S-E2a): UDS 5 站点族基础设施 — shared(isEnvTruthy
            // 门 + errorMessage 单一事实源) + swarm(parseAddress 门面
            // re-export 单一事实源, engine↛swarm L3 经 remote 门面保持);
            // 不依赖 engine/ascend/atlascode（engine 侧反向接线:
            // engine/tools/team SendMessage 5 站点族 → remote 门面,
            // DEP-4 allow 面）。
            {
              from: "remote",
              allow: ["shared", "swarm"],
            },
            // mcp (§8.68 S-E2b): MCP client 域 — shared(logForDebugging/
            // logError/lazySchema 单一事实源) + bootstrap(roots/list 反向
            // 请求 getOriginalCwd 面, LSP 域同型); 不依赖 engine/ascend/
            // atlascode/swarm（engine 侧反向接线: engine/tools/mcp
            // createMcpTools 映射侧 → mcp 域门面, DEP-4 allow 面）。
            {
              from: "mcp",
              allow: ["shared", "bootstrap"],
            },
            // cli (§8.71 S-C1/S-C2): CLI 公共域 — 跨壳公共层（L3 公共域）：
            // shared(feature/env 单一事实源) + bootstrap(CLI 入口状态族) +
            // engine/permissions/remote/mcp/hooks（根门面消费，swarm/mcp/remote
            // 同型先例）；不依赖 atlascode/ascend/atlasoffice（公共层不反向
            // 依赖壳）。S-C3/S-C4 handler 波 allow 面如需扩展随该切片头注登记。
            {
              from: "cli",
              allow: [
                "shared", "bootstrap", "engine", "permissions",
                "remote", "mcp", "hooks",
              ],
            },
            // DEP-5: atlascode (壳) 不含 ascend — 仅 mount 白名单可 import ascend
            // v0.12: 壳组合根注入八域（compose.ts setTaskOutputPort/setBootstrapStatePort 等）
            {
              from: "atlascode",
              allow: [
                "shared", "sandbox", "memory", "executor", "modelprovider",
                "task", "bootstrap", "permissions", "hooks", "engine", "swarm",
                "lsp", "mcp", "cli",
              ],
            },
            // DEP-5 白名单: mount 是唯一可 import ascend 的元素（挂载边）
            // v0.12: mount 注入八域（含四新域 port 适配器）
            {
              from: "mount",
              allow: [
                "shared", "sandbox", "memory", "executor", "modelprovider",
                "task", "bootstrap", "permissions", "hooks",
                "engine", "ascend", "lsp", "mcp",
              ],
            },
          ],
        },
      ],

      // ── STR-1 · 门面收口（外部只许 import index.ts; file-mode 元素自身即入口）──
      "boundaries/entry-point": ENTRY_POINT_RULES,

      // 禁未知元素类型（所有内部 import 必须命中某个 element）
      "boundaries/no-unknown": "error",

      // ── PRT-2 · 零模块级副作用（顶层自注册语句; lazy-init ??= 合规）──
      "no-restricted-syntax": [
        "error",
        {
          // 顶层 ExpressionStatement 里的 register*() 调用 = 模块加载即执行注册 = 违规
          selector:
            "Program > ExpressionStatement > CallExpression[callee.name=/^register/i]",
          message:
            "PRT-2: 顶层禁止模块加载时自注册语句。状态/port 注册经 compose.ts 显式注入（lazy-init `??=` 合规）。",
        },
      ],
    },
  },

  // ── tests 门面收口（#2: tests import src 必须走域根 index.ts）──
  // tests/ 不受 DEP/element-types/no-unknown 约束（tests 间 import + fixtures/helpers 不管），
  // 只受 STR-1 entry-point 约束：import src 域时 target 必须是 index.ts（防 reach 内部文件）。
  {
    files: ["tests/**/*.ts"],
    plugins: {
      boundaries,
    },
    settings: {
      "boundaries/elements": ELEMENTS,
      "import/resolver": {
        typescript: { project: "./tsconfig.json" },
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // tests/ 只受 STR-1 门面收口约束
      "boundaries/entry-point": ENTRY_POINT_RULES,
      // tests/ 元素类型/依赖方向/未知元素不管（tests 非域元素）
      "boundaries/element-types": "off",
      "boundaries/no-unknown": "off",
    },
  },
);
