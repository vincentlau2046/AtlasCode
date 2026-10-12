/**
 * /output-style [name] — 0.1.60 TUI-1（CC 2.1.269）。
 *
 * outputStyle 配置面在场（settings 字段 `outputStyle` + /config 消费面），命令本体
 * 0.1.40 W1 裁除后本波重加。参数面：无参 = 展示当前 style + 可用列表；带 name =
 * 写配置面切换（userSettings 落盘 + 输出 style 缓存 + 系统提示 section 缓存失效 →
 * in-session 生效，不重启）；非法 name（不在可用集）= 报错面。零回归 = 既有
 * outputStyle 配置语义不变（本命令仅消费入口，复用既有 getOutputStyleConfig 消费面）。
 */
import type { Command } from '../../commands.js'

const outputStyle = {
  type: 'local',
  name: 'output-style',
  description:
    'Show or switch the output style (no argument = current + available list)',
  supportsNonInteractive: false,
  argumentHint: '[name]',
  load: () => import('./output-style.js'),
} satisfies Command

export default outputStyle
