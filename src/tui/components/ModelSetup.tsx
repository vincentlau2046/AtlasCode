import React, { useState } from 'react';
import type { ExitState } from '../hooks/useExitOnCtrlCDWithKeybindings.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { Box, Text } from '../ink.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';
import { buildModelSetupPayload, writeModelSetupPayload } from '../utils/modelSetup.js';
import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.js';
import { Select } from './CustomSelect/select.js';
import { Byline } from './design-system/Byline.js';
import { Dialog } from './design-system/Dialog.js';
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js';
import TextInput from './TextInput.js';

type Preset = 'default' | 'openai';
type Field = 'baseURL' | 'modelId' | 'apiKey';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8999/v1';
const DEFAULT_MODEL_ID = 'Qwen38-27B-TXT';

const PRESET_OPTIONS = [{
  label: '默认网关（本地端点预填）',
  value: 'default',
  description: `预填 ${DEFAULT_BASE_URL} + ${DEFAULT_MODEL_ID}`
}, {
  label: 'OpenAI 兼容端点',
  value: 'openai',
  description: '自行填写 OpenAI 协议 baseURL / 模型 ID'
}];

type ModelSetupProps = {
  onDone: () => void;
};

/**
 * 一次性启动引导（2026-09-18）：三角色模型池全空时由 showSetupScreens 挂载，
 * 确认后写最小 ~/.atlas/settings.json。ESC = 非阻塞跳过（不写盘，走空池报错兜底）；
 * Ctrl+C/D 由 Dialog 内置 useExitOnCtrlCDWithKeybindings 处理（Onboarding 先例）。
 */
export function ModelSetup({
  onDone
}: ModelSetupProps): React.ReactNode {
  const [step, setStep] = useState<'preset' | 'endpoint'>('preset');
  const [preset, setPreset] = useState<Preset>('default');
  const [baseURL, setBaseURL] = useState('');
  const [modelId, setModelId] = useState('');
  // 选填：预填 OpenAI 静态键 env（OpenAI 协议静态键车道），留空走 getGlobalApiKey 回退。
  const [apiKey, setApiKey] = useState(() => (process.env.OPENAI_API_KEY ?? process.env.OPENAI_AUTH_TOKEN ?? '').trim());
  const [focused, setFocused] = useState<Field>('baseURL');
  const [baseCursor, setBaseCursor] = useState(0);
  const [modelCursor, setModelCursor] = useState(0);
  const [keyCursor, setKeyCursor] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const {
    columns
  } = useTerminalSize();

  // Step 1 → 2：按预设预填端点字段
  const handlePresetSelect = (value: string): void => {
    const p = value as Preset;
    setPreset(p);
    if (p === 'default') {
      setBaseURL(DEFAULT_BASE_URL);
      setModelId(DEFAULT_MODEL_ID);
      setBaseCursor(DEFAULT_BASE_URL.length);
      setModelCursor(DEFAULT_MODEL_ID.length);
    } else {
      setBaseURL('');
      setModelId('');
      setBaseCursor(0);
      setModelCursor(0);
    }
    setError(null);
    setFocused('baseURL');
    setStep('endpoint');
  };

  // Dialog 的 onCancel（Esc/n）：endpoint 步先退回预设选择，preset 步 = 跳过引导
  const handleCancel = () => {
    if (step === 'endpoint') {
      setStep('preset');
      setError(null);
      return;
    }
    onDone();
  };

  const handleSubmit = () => {
    const b = baseURL.trim();
    const m = modelId.trim();
    if (!b) {
      setError('baseURL 不能为空');
      setFocused('baseURL');
      return;
    }
    if (!m) {
      setError('模型 ID 不能为空');
      setFocused('modelId');
      return;
    }
    const payload = buildModelSetupPayload({
      preset,
      baseURL: b,
      modelId: m,
      apiKey: apiKey.trim() || undefined
    });
    const {
      error: writeErr
    } = writeModelSetupPayload(payload);
    if (writeErr) {
      setError(`写入 ~/.atlas/settings.json 失败: ${writeErr.message}`);
      return;
    }
    onDone();
  };

  // endpoint 步时 Dialog 的 confirm:no 被让给 'n'（Settings 上下文），Esc 由本键位退回预设选择
  useKeybinding('confirm:no', handleCancel, {
    context: 'Settings',
    isActive: step === 'endpoint'
  });

  function renderInputGuide(exitState: ExitState): React.ReactNode {
    if (exitState.pending) {
      return <Text>Press {exitState.keyName} again to exit</Text>;
    }
    return <Byline>
        <KeyboardShortcutHint shortcut="Enter" action="confirm" />
        <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description={step === 'endpoint' ? '返回' : '跳过'} />
      </Byline>;
  }

  return <Dialog title="AtlasHarness 模型配置" subtitle={step === 'preset' ? '选择模型提供方预设:' : '填写端点信息（Enter 下一字段，Esc 返回）:'} color="permission" onCancel={handleCancel} inputGuide={renderInputGuide} isCancelActive={step === 'preset'}>
      {step === 'preset' ? <Select options={PRESET_OPTIONS} onChange={(value: string) => handlePresetSelect(value)} onCancel={handleCancel} /> : <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" gap={1}>
            <Text>baseURL（必填）</Text>
          </Box>
          <Box flexDirection="row" gap={1}>
            <Text>&gt;</Text>
            <TextInput value={baseURL} onChange={setBaseURL} onSubmit={() => setFocused('modelId')} focus={focused === 'baseURL'} showCursor={true} columns={columns} cursorOffset={baseCursor} onChangeCursorOffset={setBaseCursor} />
          </Box>
          <Box flexDirection="row" gap={1}>
            <Text>模型 ID（必填）</Text>
          </Box>
          <Box flexDirection="row" gap={1}>
            <Text>&gt;</Text>
            <TextInput value={modelId} onChange={setModelId} onSubmit={() => setFocused('apiKey')} focus={focused === 'modelId'} showCursor={true} columns={columns} cursorOffset={modelCursor} onChangeCursorOffset={setModelCursor} />
          </Box>
          <Box flexDirection="row" gap={1}>
            <Text>apiKey（选填，留空走全局回退）</Text>
          </Box>
          <Box flexDirection="row" gap={1}>
            <Text>&gt;</Text>
            <TextInput value={apiKey} onChange={setApiKey} onSubmit={handleSubmit} focus={focused === 'apiKey'} showCursor={true} columns={columns} cursorOffset={keyCursor} onChangeCursorOffset={setKeyCursor} />
          </Box>
          {error ? <Text color="error">{error}</Text> : null}
        </Box>}
    </Dialog>;
}
