/**
 * wrapAnsi 双实现适配器（K6-13⑤⑦, wave 0.1.86）。
 *
 * 快车道用 Bun.wrapAnsi（原生、快），但 2026-11-03 锁面探针（Main lane，
 * hard:true 真实消费者 options 面）实证 Bun 实现有两处 npm 没有的缺陷：
 *
 *  ⑦ SGR 状态跨行携带丢失：`\x1b[1m\x1b[3m…` 样式区被 hard break 切开时，
 *    续行只重发 `\x1b[3m`，bold（\x1b[1m）丢失（npm 每行完整重发状态并成对
 *    收尾）。表格 cell 车道（MarkdownTable.wrapText）与 ink <Ansi> 车道同源
 *    中招——bold/italic 嵌套跨表格边框/换行丢样式。
 *  ⑤ cols<3 宽字符产生前导空行：wrapAnsi('中文', 1, {hard:true}) → '\n中'
 *    （npm 直接 '中'）。极窄终端/单列布局出现空行伪影。
 *
 * 分流规则：含 ANSI CSI 序列的输入（样式内容——⑦ 的触发面）与极窄列宽
 * （⑤ 的触发面）走 npm wrap-ansi（上游生态标准实现，状态携带正确）；
 * 纯文本常规宽度保持 Bun 原生快车道（大段 transcript 的多数场景）。
 * OSC8 超链接换行重发（K6-13②④）双实现均正确，不受分流影响。
 */
import wrapAnsiNpm from 'wrap-ansi'

type WrapAnsiOptions = {
  hard?: boolean
  wordWrap?: boolean
  trim?: boolean
}

const wrapAnsiBun =
  typeof Bun !== 'undefined' && typeof Bun.wrapAnsi === 'function'
    ? Bun.wrapAnsi
    : null

// ⑦ 的触发面：任何 SGR/光标控制序列（\x1b[…）都意味着样式状态需要跨行携带
const ANSI_CSI_RE = /\x1b\[/

const wrapAnsi: (
  input: string,
  columns: number,
  options?: WrapAnsiOptions,
) => string = (input, columns, options) => {
  if (!wrapAnsiBun || columns < 3 || ANSI_CSI_RE.test(input)) {
    return wrapAnsiNpm(input, columns, options)
  }
  return wrapAnsiBun(input, columns, options)
}

export { wrapAnsi }
