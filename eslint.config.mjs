/**
 * AtlasCode 边界 lint 配置（A 波, charter L8 规则映射）
 *
 * 8 element types（L3 八顶层目录）+ 1 特例（mount 挂载边, DEP-5 白名单）。
 * 规则映射：
 *   DEP-1 单向无环     → element-types: shared 禁一切内部依赖
 *   DEP-2 四域零向上   → element-types: 四域 allow=[shared] only
 *   DEP-3 域依赖洁净   → element-types: 四域不 import utils/services（只 shared）
 *   DEP-4 engine 隔离  → element-types: engine allow=[shared+四域], 不含 ascend/atlascode
 *   DEP-5 挂载边       → element-types: atlascode 不含 ascend; mount 特例 allow ascend
 *   STR-1 门面收口     → entry-point: 外部只许 import index.ts
 *   PRT-2 零副作用     → no-restricted-syntax: 顶层 register* 调用
 *
 * lint 配置层可演进（charter L847）；eslint 具体选项 A 波定, 后续波次可微调。
 * 全 error 无存量豁免（charter L848）。
 */
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";

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

  // ── TS 基座（parser + recommended）──
  ...tseslint.configs.recommended,

  // ── 边界规则（DEP + STR-1 + PRT-2）──
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    plugins: {
      boundaries,
    },
    settings: {
      "boundaries/elements": [
        // mount 必须在 atlascode 之前：file-mode 优先匹配, 避免 mount.ts 落入 atlascode folder-mode
        { type: "mount", pattern: "src/atlascode/mount.ts", mode: "file" },

        { type: "shared", pattern: "src/shared", mode: "folder" },
        { type: "sandbox", pattern: "src/sandbox", mode: "folder" },
        { type: "memory", pattern: "src/memory", mode: "folder" },
        { type: "executor", pattern: "src/executor", mode: "folder" },
        { type: "modelprovider", pattern: "src/modelprovider", mode: "folder" },
        { type: "engine", pattern: "src/engine", mode: "folder" },
        { type: "ascend", pattern: "src/ascend", mode: "folder" },
        { type: "atlascode", pattern: "src/atlascode", mode: "folder" },
      ],
      // import resolver：让 boundaries 能将相对路径解析到 .ts 文件 + tsconfig paths
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
                "engine", "ascend", "atlascode", "mount",
              ],
            },
            // DEP-2/3: 四域零向上 — 只依赖 shared（不 import engine/ascend/atlascode/彼此）
            {
              from: ["sandbox", "memory", "executor", "modelprovider"],
              allow: ["shared"],
            },
            // DEP-1/4: engine 依赖四域+shared 向下合法; 不依赖 atlascode/ascend（DEP-4）
            {
              from: "engine",
              allow: ["shared", "sandbox", "memory", "executor", "modelprovider"],
            },
            // ascend (域包): DIP — 依赖 shared + engine(port 接口) + executor(NpuToolchain 接口)
            {
              from: "ascend",
              allow: ["shared", "engine", "executor"],
            },
            // DEP-5: atlascode (壳) 不含 ascend — 仅 mount 白名单可 import ascend
            {
              from: "atlascode",
              allow: [
                "shared", "sandbox", "memory", "executor", "modelprovider", "engine",
              ],
            },
            // DEP-5 白名单: mount 是唯一可 import ascend 的元素（挂载边）
            {
              from: "mount",
              allow: [
                "shared", "sandbox", "memory", "executor", "modelprovider",
                "engine", "ascend",
              ],
            },
          ],
        },
      ],

      // ── STR-1 · 门面收口（外部只许 import index.ts; file-mode 元素自身即入口）──
      "boundaries/entry-point": [
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
      ],

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
);
