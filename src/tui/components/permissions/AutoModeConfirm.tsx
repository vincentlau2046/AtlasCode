import React from 'react';
import { Box, Text } from '../../ink.js';
import { Select } from '../CustomSelect/select.js';
import type { OptionWithDescription } from '../CustomSelect/select.js';

/**
 * 2026-10-05 §4b A 波 A3（f4 批准）：automode 切换确认视图（4 行文案 + 2 键）。
 *
 * 权限弹框（Bash / PowerShell / File 三处）选中「Enable automode」选项后先
 * 展示本视图（替代原选项列表），Confirm 才走 applyAutoModePermissionOption
 * （切模 + re-dispatch 的唯一点）；Cancel / Esc 回原选项列表（该请求仍
 * pending，后续 Esc/No 按 A2 语义）。Shift+Tab 手动切模不经此门（手动操作，
 * 非权限弹框面切模）。文案 4 行（f4 定稿）：
 *   Entering automode / auto-approved by safety classifier /
 *   Switch back: Shift+Tab / 1 Confirm 2 Cancel
 */
type AutoModeConfirmProps = {
  onConfirm(): void;
  onCancel(): void;
};
export function AutoModeConfirm({ onConfirm, onCancel }: AutoModeConfirmProps): React.ReactNode {
  const options: OptionWithDescription<string>[] = [{
    label: 'Confirm',
    value: 'confirm'
  }, {
    label: 'Cancel',
    value: 'cancel'
  }];
  return <Box flexDirection="column">
      <Text bold color="permission">Entering automode</Text>
      <Text dimColor>auto-approved by safety classifier</Text>
      <Text dimColor>Switch back: Shift+Tab</Text>
      <Select options={options} defaultFocusValue="confirm" onChange={value => {
      if (value === 'confirm') {
        onConfirm();
      } else {
        onCancel();
      }
    }} onCancel={onCancel} />
    </Box>;
}
