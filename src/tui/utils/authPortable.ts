// 0.1.72 块 C-1（de-ant 收尾）：darwin keychain 移除 helper 已清零——唯一
// 消费点 auth.ts 的 keychain 移除私有 helper 已随块 C-1b 删除，故本文件仅
// 保留 config 持久化助手（恒等锚：非 darwin 行为零变更）。
// 保留 normalizeApiKeyForConfig（config 持久化活消费：auth.ts / interactiveHelpers /
// Onboarding / Config）。
export function normalizeApiKeyForConfig(apiKey: string): string {
  return apiKey.slice(-20)
}
