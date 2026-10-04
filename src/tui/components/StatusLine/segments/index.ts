// Registry + index——segment 组件注册表与统一导出
// 新增 segment 时在此注册即可，StatusLine.tsx 通过 registry.get(type) 查找

import { ModelSegment } from './ModelSegment.js'
import { ContextBarSegment } from './ContextBarSegment.js'
import { ContextAbsoluteSegment } from './ContextAbsoluteSegment.js'
import { CostSegment } from './CostSegment.js'
import { TokensInSegment, TokensOutSegment } from './TokensSegment.js'
import { ToolsCountSegment } from './ToolsCountSegment.js'
import { ThinkingLevelSegment } from './ThinkingLevelSegment.js'
import { GitBranchSegment } from './GitBranchSegment.js'
import { GitFilesSegment } from './GitFilesSegment.js'
import { GitCombinedSegment } from './GitCombinedSegment.js'
import { TokSegment } from './TokSegment.js'
import { CwdSegment } from './CwdSegment.js'
import { ControlLinkSegment } from './ControlLinkSegment.js'
import { PermissionModeSegment } from './PermissionModeSegment.js'
import { SessionDurationSegment } from './SessionDurationSegment.js'
import { RoleFallbackSegment } from './RoleFallbackSegment.js'
import { AutoCompactWarningSegment } from './AutoCompactWarningSegment.js'
import type { SegmentComponent } from './types.js'

export const segmentRegistry = new Map<string, SegmentComponent>([
  ['model', ModelSegment],
  ['role-fallback', RoleFallbackSegment],
  ['auto-compact-warning', AutoCompactWarningSegment],
  ['permission-mode', PermissionModeSegment],
  ['context-bar', ContextBarSegment],
  ['context-absolute', ContextAbsoluteSegment],
  ['cost', CostSegment],
  ['tokens-in', TokensInSegment],
  ['tokens-out', TokensOutSegment],
  ['tools-count', ToolsCountSegment],
  ['thinking-level', ThinkingLevelSegment],
  ['git-branch', GitBranchSegment],
  ['git-files', GitFilesSegment],
  ['git-combined', GitCombinedSegment],
  ['tok-s', TokSegment],
  ['session-duration', SessionDurationSegment],
  ['cwd', CwdSegment],
  ['control-link', ControlLinkSegment],
])

export {
  type SegmentRenderContext,
  type SegmentComponent,
  type SegmentConfig,
  type StatusLineJsonConfig,
  type StatusLineCommandInputLike,
  DEFAULT_SIMPLE_LINE1,
  DEFAULT_DETAILED_LINE1,
  DEFAULT_DETAILED_LINE2,
  contextColorForPercentage,
  truncateToWidth,
  renderSegmentLine,
} from './types.js'
