// P1a 抽屉键位注册（spec §4 P1a 键位）：抽屉打开时激活 'SidePanel' context
// （useRegisterKeybindingContext 先例：Autocomplete/ThemePicker），其 bindings
// 在同键上优先于 Chat/Global（activeContexts 解析链）；抽屉关闭时 context
// 注销 + handlers 全透传（return false），既有键行为零改动。

import { useMemo } from 'react'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import { useRegisterKeybindingContext } from '../../keybindings/KeybindingContext.js'
import { useSidePanel } from './store.js'
import { createSidePanelHandlers } from './sidePanelHandlers.js'

export function SidePanelKeybindings() {
  const panel = useSidePanel()
  // 打开时注册 active context：SidePanel 的 bindings 同键优先
  useRegisterKeybindingContext('SidePanel', panel.open)
  // handlers 读 store 状态（闭包无状态）→ useMemo 稳定引用，避免 useKeybindings
  // 每渲染重注册
  const handlers = useMemo(() => createSidePanelHandlers(), [])
  useKeybindings(handlers, { context: 'SidePanel' })
  return null
}
