// P1a 抽屉键位注册（spec §4 P1a 键位）：抽屉打开时激活 'SidePanel' context
// （useRegisterKeybindingContext 先例：Autocomplete/ThemePicker），其 bindings
// 在同键上优先于 Chat/Global（activeContexts 解析链）；抽屉关闭时 context
// 注销 + handlers 全透传（return false），既有键行为零改动。

import { useMemo } from 'react'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import { useRegisterKeybindingContext } from '../../keybindings/KeybindingContext.js'
import { useIsModalOverlayActive } from '../../context/overlayContext.js'
import { useSidePanel } from './store.js'
import { createSidePanelHandlers } from './sidePanelHandlers.js'

export function SidePanelKeybindings() {
  const panel = useSidePanel()
  // 打开时注册 active context：SidePanel 的 bindings 同键优先
  useRegisterKeybindingContext('SidePanel', panel.open)
  // 0.1.23 P0a 回归修（红线③）：模态 overlay（权限弹框/模型选择等）激活时侧栏
  // 全键透传——否则 1-5（本地 context 恒入匹配栈）抢消费、饿死模态数字选。
  const isModalActive = useIsModalOverlayActive()
  // handlers 读 store 状态 + 模态态（闭包捕获注入值）→ useMemo([isModalActive])
  // 稳定引用（模态开合时重建 → useKeybindings 重注册），避免每渲染重注册
  const handlers = useMemo(
    () => createSidePanelHandlers({ isModalActive }),
    [isModalActive],
  )
  useKeybindings(handlers, { context: 'SidePanel' })
  return null
}
