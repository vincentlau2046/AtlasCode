/**
 * 2026-10-05 §4b A 波 A5（f4 批准）：statusline 授权模式标签定稿钉。
 *
 * shortTitle 三态 = default / automode enabled / bypass enabled
 * （PERMISSION_MODE_CONFIG，仅 PermissionModeSegment 消费）。
 * title 族不动（A4 verdict 句与 Config 屏仍用 title 原文案）——本单测同时
 * 钉住「title 未改」防误伤：auto 仍 'Auto mode' / bypass 仍 'Bypass Permissions'。
 * auto 条目在 feature('TRANSCRIPT_CLASSIFIER') 门内（2026-09-19 裁定默认开，
 * 单测环境恒在）。
 */
import { describe, expect, test } from 'bun:test';
import {
  permissionModeShortTitle,
  permissionModeTitle,
} from '../../src/tui/utils/permissions/PermissionMode.js';

describe('A5 statusline 授权模式标签（shortTitle 三态）', () => {
  test('default → "default"', () => {
    expect(permissionModeShortTitle('default')).toBe('default');
  });

  test('auto → "automode enabled"', () => {
    expect(permissionModeShortTitle('auto')).toBe('automode enabled');
  });

  test('bypassPermissions → "bypass enabled"', () => {
    expect(permissionModeShortTitle('bypassPermissions')).toBe('bypass enabled');
  });

  test('title 族未改（防误伤 A4/Config 屏文案）', () => {
    expect(permissionModeTitle('auto')).toBe('Auto mode');
    expect(permissionModeTitle('bypassPermissions')).toBe('Bypass Permissions');
    expect(permissionModeTitle('default')).toBe('Default');
  });
});
