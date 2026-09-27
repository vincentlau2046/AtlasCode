/**
 * 文本资产模块声明（bunfig.toml `[loader]` `".txt" = "text"`）。
 *
 * 这些扩展名的 ES import 在 `bun build`（CLI 入口打包）时内联为原始字符串字面量，
 * dev/test（bun 直跑）返回原始文本——default export = 文件原始内容。
 * 消费点：auto-mode 分类器提示词（src/permissions/autoMode/prompts/*.txt，§8.65）。
 *
 * 仅声明 `*.txt`（本波唯一文本资产族）；`*.md` / `*.py` 若后续经 ES import 消费，
 * 按同型补声明（bunfig 已映射，声明未先行 = 防死接缝）。
 */
declare module '*.txt' {
  const content: string
  export default content
}
