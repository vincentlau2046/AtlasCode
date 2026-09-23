/**
 * 权限更新 zod schema（E-4 S-4c2，§8.35）
 *
 * 旧仓来源（a8af45b）: src/utils/permissions/PermissionUpdateSchema.ts（78L，
 * 刻意零复杂依赖——旧仓经此避免 types/hooks.ts 循环 import；新仓同构：
 * 仅依赖域内 PermissionRule 两 schema + permissionMode external schema +
 * shared lazySchema）。
 *
 * 旧 `import z from 'zod/v4'` → 新仓 zod 主入口即 v4（PermissionRule.ts 同改法）。
 * 类型 re-export 不随迁：PermissionUpdate / PermissionUpdateDestination 已
 * B 波契约冻结下沉 shared/types-session（域 index 门面统一出口）。
 *
 * 消费面登记（H6 预声明接缝）：本版零消费点——旧消费 = types/hooks.ts /
 * SDK controlSchemas / bridge permissionCallbacks / swarm permissionSync，
 * 均 E-5 hooks-runner / SDK 面 / 组合根残留守（落时随消费点挂接，勿当遗漏重提）。
 */
import { z } from 'zod'
import { lazySchema } from '../shared'
import {
  permissionBehaviorSchema,
  permissionRuleValueSchema,
} from './PermissionRule'
import { externalPermissionModeSchema } from './permissionMode'

/**
 * PermissionUpdateDestination is where a new permission rule should be saved
 * to.（旧仓 5 值 enum 逐字——不含 command/policySettings/flagSettings 等
 * 规则**源**；destination = update 落点面，更窄。）
 */
export const permissionUpdateDestinationSchema = lazySchema(() =>
  z.enum([
    // User settings (global)
    'userSettings',
    // Project settings (shared per-directory)
    'projectSettings',
    // Local settings (gitignored)
    'localSettings',
    // In-memory for the current session only
    'session',
    // From the command line arguments
    'cliArg',
  ]),
)

export const permissionUpdateSchema = lazySchema(() =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('addRules'),
      rules: z.array(permissionRuleValueSchema()),
      behavior: permissionBehaviorSchema(),
      destination: permissionUpdateDestinationSchema(),
    }),
    z.object({
      type: z.literal('replaceRules'),
      rules: z.array(permissionRuleValueSchema()),
      behavior: permissionBehaviorSchema(),
      destination: permissionUpdateDestinationSchema(),
    }),
    z.object({
      type: z.literal('removeRules'),
      rules: z.array(permissionRuleValueSchema()),
      behavior: permissionBehaviorSchema(),
      destination: permissionUpdateDestinationSchema(),
    }),
    z.object({
      type: z.literal('setMode'),
      mode: externalPermissionModeSchema(),
      destination: permissionUpdateDestinationSchema(),
    }),
    z.object({
      type: z.literal('addDirectories'),
      directories: z.array(z.string()),
      destination: permissionUpdateDestinationSchema(),
    }),
    z.object({
      type: z.literal('removeDirectories'),
      directories: z.array(z.string()),
      destination: permissionUpdateDestinationSchema(),
    }),
  ]),
)
