import * as React from 'react'
import type { CommandResultDisplay } from '../../commands.js'
import { Pane } from '../../components/design-system/Pane.js'
import {
  Select,
  type OptionWithDescription,
} from '../../components/CustomSelect/index.js'
import { Text } from '../../ink.js'
import { useAppState, useSetAppState } from '../../state/AppState.js'
import { getMainLoopModel, renderModelName } from '../../utils/model/model.js'
import {
  getInitialSettings,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'
import type { SettingsJson } from '../../utils/settings/types.js'
import {
  AUTOCOMPACT_PRESET_WINDOW_TIERS,
  lookupAutoCompactWindowSetting,
  normalizeAutoCompactWindowSetting,
  parseAutoCompactTierArg,
  parseAutoCompactTierInput,
  type AutoCompactWindowPerModel,
  type AutoCompactWindowSetting,
  type AutoCompactWindowSettingLike,
} from 'src/engine'
import type { LocalJSXCommandCall } from '../../types/command.js'

/**
 * #250 concern 2（issule-analyst 专项）：/autocompact 命令本体。
 *
 * 档位面：预设 100k/128k/200k/256k（AUTOCOMPACT_PRESET_WINDOW_TIERS 单一事实源）
 * + 自定义输入框（"150k" → 窗口 cap / "75%" / "75" → 阈值百分比，裸数 = pct，
 * parseAutoCompactTierInput 纯解析）+ auto（缺省）+ off（禁用自动压缩，
 * 手动 /compact 保留）。
 *
 * 持久化 = ThemePicker 双写先例：updateSettingsForSource('userSettings',
 * { autoCompactWindow })（settings.json user 车道；mergeWith 语义下切档后旧
 * 兄弟键惰性残留，zod 按 kind 判别 + 读侧剥离 → 惰性无害）
 * + setAppState 覆写（当 session 立即生效；contextHostWiring 的
 * getInitialSettings 缓存在 updateSettingsForSource 后重置 → 引擎 model-string
 * / agentLoopDeps 两车道同步见新档，env 胜 settings 合并纪律在 engine 侧）。
 *
 * 0.1.69 D-1（Main 裁定）：写档键 = 当前主循环模型 getMainLoopModel()
 * （per-model 键控面；读-改-写整 map——旧单档遗留值经
 * normalizeAutoCompactWindowSetting 归一 default 键单点过渡，无批量迁移，
 * 其他模型键原样保留）；UI 现形 = 选择器带当前模型标签（最小面，per-model
 * 档矩阵 UI 不入境）。写面单点 cast = engine per-model 形（索引签名含
 * undefined）→ settings schema record 输出形（运行时同构）。
 */

type Props = {
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}

/** 选项值：'auto' / 'off' / 'custom'（输入框）/ number（预设档 tokens）。 */
type TierOptionValue = 'auto' | 'off' | 'custom' | number

const PRESET_TIERS: readonly number[] = [...AUTOCOMPACT_PRESET_WINDOW_TIERS]

/**
 * 0.1.69 D-1：现档按模型取档（per-model 键 → default 键 → 缺省；raw 值形
 * = 旧单档 | per-model map，经 normalizeAutoCompactWindowSetting 归一）。
 * 0.1.80 K1-B①：经 engine lookupAutoCompactWindowSetting 单点查表（精确键
 * → basename 回落 → default 键），与 resolveAutoCompactWindow 读写同源，
 * 档位显示/生效一致。
 */
function currentTierFor(
  raw: AutoCompactWindowSettingLike | undefined,
  model: string,
): AutoCompactWindowSetting | undefined {
  return lookupAutoCompactWindowSetting(
    normalizeAutoCompactWindowSetting(raw),
    model,
  )
}

/** 现档 → 选项值（预设档命中自身，非预设 window / pct → 自定义框带初值）。 */
function currentToOptionValue(
  setting: AutoCompactWindowSetting | undefined,
): TierOptionValue {
  if (!setting || setting.kind === 'auto') return 'auto'
  if (setting.kind === 'off') return 'off'
  if (setting.kind === 'window' && PRESET_TIERS.includes(setting.tokens)) {
    return setting.tokens
  }
  return 'custom'
}

/** 自定义输入框初值（现档为自定义 window / pct 时回填可编辑形）。 */
function customInitialValue(
  setting: AutoCompactWindowSetting | undefined,
): string {
  if (!setting || setting.kind === 'auto' || setting.kind === 'off') {
    return ''
  }
  return setting.kind === 'window'
    ? `${setting.tokens / 1000}k`
    : `${setting.pct}%`
}

/** 持久化成功后的 onDone 结果行（用户可见回执；0.1.69 D-1 带模型标签）。 */
function describeTier(setting: AutoCompactWindowSetting, model: string): string {
  const label = ` [${renderModelName(model)}]`
  switch (setting.kind) {
    case 'auto':
      return `Auto-compact: Auto (default)${label} — compact near the model window limit`
    case 'off':
      return `Auto-compact: Off${label} (manual /compact still works)`
    case 'window':
      return `Auto-compact window: ${setting.tokens / 1000}k tokens${label}`
    case 'pct':
      return `Auto-compact threshold: ${setting.pct}% of the effective window${label}`
  }
}

/**
 * 双写持久化（ThemePicker 先例 + 0.1.69 D-1 per-model 键控）：读-改-写整
 * map（旧单档遗留值经归一 = default 键单点过渡，其他模型键原样保留）
 * + settings 落盘 + AppState 覆写（当 session 立即生效；引擎 model-string /
 * agentLoopDeps 两车道经 getInitialSettings 缓存重置同步见新档）。
 */
function persistTier(
  setting: AutoCompactWindowSetting,
  model: string,
  setAppState: ReturnType<typeof useSetAppState>,
  onDone: Props['onDone'],
): void {
  const map: AutoCompactWindowPerModel = normalizeAutoCompactWindowSetting(
    getInitialSettings().autoCompactWindow,
  )
  map[model] = setting
  // 单点 cast（engine per-model 形索引签名含 undefined → settings schema
  // record 输出形；运行时同构，写面唯一 cast 点）
  const mapForSettings = map as unknown as SettingsJson['autoCompactWindow']
  const { error } = updateSettingsForSource('userSettings', {
    autoCompactWindow: mapForSettings,
  })
  if (error) {
    onDone(`Failed to persist auto-compact tier: ${error.message}`, {
      display: 'system',
    })
    return
  }
  setAppState(prev => ({
    ...prev,
    settings: { ...prev.settings, autoCompactWindow: mapForSettings },
  }))
  onDone(describeTier(setting, model))
}

/** 参数直用形（/autocompact 128k）：挂载即双写持久化（0.1.69 D-1 键 = 当前模型），
 * 不渲染选择器。 */
function AutoCompactApply({
  setting,
  onDone,
}: {
  setting: AutoCompactWindowSetting
  onDone: Props['onDone']
}): React.ReactNode {
  const setAppState = useSetAppState()
  const doneRef = React.useRef(false)
  const model = getMainLoopModel()
  React.useEffect(() => {
    if (doneRef.current) {
      return
    }
    doneRef.current = true
    persistTier(setting, model, setAppState, onDone)
  }, [setting, model, onDone, setAppState])
  return null
}

function AutoCompactCommand({ onDone }: Props): React.ReactNode {
  const setAppState = useSetAppState()
  // 0.1.69 D-1：写档键 + 选择器现形 = 当前主循环模型（各模型各取己档）
  const model = getMainLoopModel()
  const current = useAppState(s => s.settings.autoCompactWindow)
  const [inputError, setInputError] = React.useState<string | null>(null)

  const apply = (setting: AutoCompactWindowSetting) => {
    persistTier(setting, model, setAppState, onDone)
  }

  const options: OptionWithDescription<TierOptionValue>[] = [
    {
      label: 'Auto (default)',
      value: 'auto',
      description:
        'Compact when context approaches the model window (window − 20k reserve − 13k buffer)',
    },
    ...PRESET_TIERS.map(tokens => ({
      label: `${tokens / 1000}k window`,
      value: tokens,
      description: `Cap the effective context window at ${tokens / 1000}k tokens`,
    })),
    {
      label: 'Custom…',
      value: 'custom',
      type: 'input',
      placeholder: 'e.g. 150k (window) or 75% (bare number = percent)',
      initialValue: customInitialValue(currentTierFor(current, model)),
      onChange: (raw: string) => {
        const parsed = parseAutoCompactTierInput(raw)
        if (!parsed) {
          setInputError(
            'Invalid value — use "150k" (window, ≥1k) or "75%" / "75" (percent, 1–100)',
          )
          return
        }
        setInputError(null)
        apply(parsed)
      },
    },
    {
      label: 'Off',
      value: 'off',
      description: 'Disable auto-compact (manual /compact still works)',
    },
  ]

  return (
    <Pane color="permission">
      <Text bold={true}>
        {`Auto-compact window tier — ${renderModelName(model)}`}
      </Text>
      <Select
        defaultValue={currentToOptionValue(currentTierFor(current, model))}
        options={options}
        onChange={value => {
          if (value === 'auto') {
            apply({ kind: 'auto' })
          } else if (value === 'off') {
            apply({ kind: 'off' })
          } else if (typeof value === 'number') {
            apply({ kind: 'window', tokens: value })
          }
          // 'custom' = 输入选项：提交走上方 option.onChange（parse 后 apply）
        }}
        onCancel={() => {
          onDone('Auto-compact picker dismissed', { display: 'system' })
        }}
      />
      {inputError ? <Text color="error">{inputError}</Text> : null}
    </Pane>
  )
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const raw = (args ?? '').trim()
  if (raw === '') {
    // 无参 = 选择器形（预设档 + 自定义输入框 + auto/off）
    return <AutoCompactCommand onDone={onDone} />
  }
  const parsed = parseAutoCompactTierArg(raw)
  if (parsed) {
    // 参数直用形（/autocompact 128k）：免选择器，挂载即双写持久化
    return <AutoCompactApply setting={parsed} onDone={onDone} />
  }
  // 未识别参数：用法提示早退路径（onDone 先于返回触发 → 各 runner 的
  // doneWasCalled 守卫跳过 setToolJSX；不写 settings，不误改现档）
  onDone(
    `Unrecognized /autocompact argument "${raw}" — usage: /autocompact <100k|128k|200k|256k|Nk|P%|auto|off> (no argument for the picker)`,
    { display: 'system' },
  )
  return null
}
