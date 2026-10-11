/**
 * /tui command - minimal metadata only.
 * Implementation is lazy-loaded from tui.ts to reduce startup time.
 *
 * AD-14（0.1.51 C-2，CC 2.1.110）：全屏渲染 in-session 切换（不重启）——
 * /tui fullscreen 开、/tui off 关、无参 = 状态面。双写 userSettings
 * tui.fullscreen + fullscreen.ts 运行时覆写槽（当 session 立即生效）。
 */
import type { Command } from '../../commands.js'

const tui = {
  type: 'local-jsx',
  name: 'tui',
  description:
    'Toggle fullscreen rendering for this session (no restart): /tui fullscreen|off, no argument = status',
  immediate: true,
  argumentHint: '<fullscreen|off>',
  load: () => import('./tui.js'),
} satisfies Command

export default tui
