// Atlas — 启动模型配置守卫（2026-09-18，C5 配置目录改名的补强项）。
//
// 事故背景：`.atlasharness` → `.atlas` clean cut 无数据迁移后，`~/.atlas/settings.json`
// 缺失时三个角色池（premium/fast/small，含 ATLAS_<ROLE>_MODEL env）全空，TUI 首条
// 消息即抛 `unknown provider/model reference: `（空串），且无任何首启引导兜底。
//
// 本模块把「是否需要引导」与「写什么」做成纯逻辑（独立叶子模块——
// interactiveHelpers.tsx 导入图太重，单测无法隔离；导入方向 utils → core/modelprovider，
// 不破坏 import-purity 红线），供启动守卫与 ModelSetup 对话框共用。

// R-mp-external 门禁：外域导入 modelprovider 域必须落根门面（C-8 闭环，
// 白名单 0 外域允许）。roles.js 深导 → 门面（getRoleModels/MODEL_ROLES 均已经门面导出）。
import { getRoleModels, MODEL_ROLES } from 'src/modelprovider'
import type { SettingsJson } from './settings/types.js'
import { updateSettingsForSource } from './settings/settings.js'

/**
 * True when NO model is resolvable for ANY role.
 * getRoleModels already folds in the ATLAS_<ROLE>_MODEL env override
 * (highest precedence), so a machine with env-configured models never triggers.
 */
export function needsModelSetup(): boolean {
  return MODEL_ROLES.every((role) => getRoleModels(role).length === 0)
}

export interface ModelSetupInput {
  /** Provider namespace written into settings.providers: 'default' (本地网关, 去 IFF 化档2 新值；旧 'iff' 读取时经 normalizeProvider 归一) or 'openai' (自定义端点). */
  preset: 'default' | 'openai'
  baseURL: string
  modelId: string
  /** Optional — when empty/absent the apiKey key is OMITTED (see buildModelSetupPayload). */
  apiKey?: string
}

/**
 * Pure builder: the settings patch ModelSetup writes when the user confirms.
 * Shape mirrors settings.template.json and what roles.ts resolveModel() reads.
 *
 * `apiKey` is included ONLY when non-empty: a blank string would clobber the
 * existing key on merge, and `undefined` would delete it; omitting the key
 * preserves any prior value and falls back to getGlobalApiKey() (on-disk
 * global key) at resolution time.
 */
export function buildModelSetupPayload(input: ModelSetupInput): SettingsJson {
  const { preset, baseURL, modelId, apiKey } = input
  const provider: Record<string, unknown> = {
    api: 'openai-completions',
    baseURL,
    defaultContextWindow: 256000,
    defaultMaxTokens: 32000,
    models: [{
      id: modelId,
      name: modelId,
      contextWindow: 256000,
      maxTokens: 32000,
    }],
  }
  if (apiKey) {
    provider.apiKey = apiKey
  }
  // 守卫只在三角色池全空时触发，mergeWith 数组整体替换安全，不碰任何活池；
  // 三角色同指一个模型是最小可用配置，用户事后可拆分。每角色独立对象，避免共享引用。
  const roleEntry = () => ({ provider: preset, models: [{ model: `${preset}/${modelId}` }] })
  return {
    providers: {
      [preset]: provider,
    },
    modelRoles: {
      premium: roleEntry(),
      fast: roleEntry(),
      small: roleEntry(),
    },
    defaultRole: 'small',
    availableModels: ['small', 'premium', 'fast'],
  }
}

/**
 * Writes the patch to ~/.atlas/settings.json (userSettings source).
 * updateSettingsForSource handles internal-write marking + cache reset internally.
 * NOTE: NOT saveGlobalConfig — that writes ~/.atlas.json (global config), a different file.
 */
export function writeModelSetupPayload(payload: SettingsJson): { error: Error | null } {
  return updateSettingsForSource('userSettings', payload)
}
