/**
 * 2026-10-05 §4b A 波 A3（f4 批准）：automode 选项 label 钉 + 门控可见性契约。
 *
 * 两个 shell 选项 builder（bashToolUseOptions / powershellToolUseOptions，
 * 均 React-free 可直接单测）在 showAutoModeOption=true 时输出第 4 选项
 * 「Enable automode」（value 'yes-auto-mode'，A3 起的定稿 label；旧文案
 * 'Auto mode' 不再出现）；未传参（gate 不可见场景）时选项隐藏。
 * 三个 dialog 表面（Bash / PowerShell / File）选中该选项后经 AutoModeConfirm
 * 4 行确认视图（1 Confirm 2 Cancel）才 dispatch 切模 —— 表面活链归 PTY 探针，
 * 本单测只钉 builder 面（label + value + 隐藏契约）。
 */
import { describe, expect, test } from 'bun:test';
import { bashToolUseOptions } from '../../src/tui/components/permissions/BashPermissionRequest/bashToolUseOptions.js';
import { powershellToolUseOptions } from '../../src/tui/components/permissions/PowerShellPermissionRequest/powershellToolUseOptions.js';

const noop = () => {};

describe('A3 automode option label — shell builders', () => {
  test('bash: showAutoModeOption=true 输出 Enable automode（value yes-auto-mode）', () => {
    const options = bashToolUseOptions({
      onRejectFeedbackChange: noop,
      onAcceptFeedbackChange: noop,
      showAutoModeOption: true
    });
    const auto = options.find(o => o.value === 'yes-auto-mode');
    expect(auto?.label).toBe('Enable automode');
    expect(auto?.description).toBe('Switch this session to auto mode; this request is re-checked by the auto gate');
  });

  test('bash: 未传 showAutoModeOption 时选项隐藏（gate 不可见场景）', () => {
    const options = bashToolUseOptions({
      onRejectFeedbackChange: noop,
      onAcceptFeedbackChange: noop
    });
    expect(options.some(o => o.value === 'yes-auto-mode')).toBe(false);
    expect(options.some(o => o.label === 'Auto mode')).toBe(false);
  });

  test('powershell: showAutoModeOption=true 输出 Enable automode（value yes-auto-mode）', () => {
    const options = powershellToolUseOptions({
      onRejectFeedbackChange: noop,
      onAcceptFeedbackChange: noop,
      showAutoModeOption: true
    });
    const auto = options.find(o => o.value === 'yes-auto-mode');
    expect(auto?.label).toBe('Enable automode');
  });

  test('powershell: 未传 showAutoModeOption 时选项隐藏', () => {
    const options = powershellToolUseOptions({
      onRejectFeedbackChange: noop,
      onAcceptFeedbackChange: noop
    });
    expect(options.some(o => o.value === 'yes-auto-mode')).toBe(false);
    expect(options.some(o => o.label === 'Auto mode')).toBe(false);
  });
});
