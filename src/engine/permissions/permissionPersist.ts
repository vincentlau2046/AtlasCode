/**
 * engine/permissions — 权限更新持久化族（E-4 S-4c2，§8.35）
 *
 * 旧仓来源（a8af45b）: src/utils/permissions/PermissionUpdate.ts 389L 的
 * persist 族（supportsPersistence / persistPermissionUpdate(s) /
 * createReadRuleSuggestion）。apply 族（applyPermissionUpdate(s) /
 * convertRulesToUpdates）已 S-4b 落域 permissionUpdate.ts，本文件仅 persist。
 *
 * 落位裁定（§8.35 ①④⑥）：
 *   - persist 族依赖 addPermissionRulesToSettings（同目录 loader）+
 *     getSettingsForSource / updateSettingsForSource（engine/config）→
 *     域纯叶约束下必落 engine 侧 L3 连接器层（域不可 import engine）。
 *   - createReadRuleSuggestion 旧 toPosixPath（permissions/filesystem）
 *     不随迁（新仓 POSIX 单平台，filesystem.ts 头注既有裁定）→ 路径原串
 *     直用（`posix.isAbsolute` 判定 + `/**` 后缀逐字）。
 *   - 裁出不随迁：extractRules / hasRules（新仓零消费点，H6 死接缝禁；
 *     E-6 suggestions 面落时随消费点补）。
 *
 * 消费面登记（H6 预声明接缝，防死接缝误判）：
 *   - persistPermissionUpdate(s)：权限对话框持久化 / 组合根（旧消费 =
 *     hooks/toolPermission / swarm / structuredIO / bridge，全残留守）
 *   - createReadRuleSuggestion：E-6 pathValidation 487L suggestion 面 +
 *     filesystem getAtlasTempDir 族（旧 BashTool/PowerShellTool
 *     pathValidation + permissions/filesystem.ts:1437 消费点）
 */
import { posix } from 'path'
import {
  logForDebugging,
  type PermissionUpdate,
  type PermissionUpdateDestination,
} from '../../shared'
import {
  getSettingsForSource,
  updateSettingsForSource,
  type EditableSettingSource,
} from '../config'
import {
  permissionRuleValueFromString,
  permissionRuleValueToString,
} from '../../permissions'
import { addPermissionRulesToSettings } from './permissionRulesLoader'

export function supportsPersistence(
  destination: PermissionUpdateDestination,
): destination is EditableSettingSource {
  return (
    destination === 'localSettings' ||
    destination === 'userSettings' ||
    destination === 'projectSettings'
  )
}

/**
 * Persists a permission update to the appropriate settings source（旧仓
 * 六型写回逐字；依赖改法 = engine/config settings 面 + 同目录 loader）。
 */
export function persistPermissionUpdate(update: PermissionUpdate): void {
  if (!supportsPersistence(update.destination)) return

  logForDebugging(
    `Persisting permission update: ${update.type} to source '${update.destination}'`,
  )

  switch (update.type) {
    case 'addRules': {
      logForDebugging(
        `Persisting ${update.rules.length} ${update.behavior} rule(s) to ${update.destination}`,
      )
      addPermissionRulesToSettings(
        {
          ruleValues: update.rules,
          ruleBehavior: update.behavior,
        },
        update.destination,
      )
      break
    }

    case 'addDirectories': {
      logForDebugging(
        `Persisting ${update.directories.length} director${update.directories.length === 1 ? 'y' : 'ies'} to ${update.destination}`,
      )
      const existingSettings = getSettingsForSource(update.destination)
      const existingDirs =
        existingSettings?.permissions?.additionalDirectories || []

      // Add new directories, avoiding duplicates
      const dirsToAdd = update.directories.filter(
        dir => !existingDirs.includes(dir),
      )

      if (dirsToAdd.length > 0) {
        const updatedDirs = [...existingDirs, ...dirsToAdd]
        updateSettingsForSource(update.destination, {
          permissions: {
            additionalDirectories: updatedDirs,
          },
        })
      }
      break
    }

    case 'removeRules': {
      // Handle rule removal
      logForDebugging(
        `Removing ${update.rules.length} ${update.behavior} rule(s) from ${update.destination}`,
      )
      const existingSettings = getSettingsForSource(update.destination)
      const existingPermissions = existingSettings?.permissions || {}
      const existingRules = existingPermissions[update.behavior] || []

      // Convert rules to normalized strings for comparison
      // Normalize via parse→serialize roundtrip so "Bash(*)" and "Bash" match
      const rulesToRemove = new Set(
        update.rules.map(permissionRuleValueToString),
      )
      const filteredRules = existingRules.filter(rule => {
        const normalized = permissionRuleValueToString(
          permissionRuleValueFromString(rule),
        )
        return !rulesToRemove.has(normalized)
      })

      updateSettingsForSource(update.destination, {
        permissions: {
          [update.behavior]: filteredRules,
        },
      })
      break
    }

    case 'removeDirectories': {
      logForDebugging(
        `Removing ${update.directories.length} director${update.directories.length === 1 ? 'y' : 'ies'} from ${update.destination}`,
      )
      const existingSettings = getSettingsForSource(update.destination)
      const existingDirs =
        existingSettings?.permissions?.additionalDirectories || []

      // Remove specified directories
      const dirsToRemove = new Set(update.directories)
      const filteredDirs = existingDirs.filter(dir => !dirsToRemove.has(dir))

      updateSettingsForSource(update.destination, {
        permissions: {
          additionalDirectories: filteredDirs,
        },
      })
      break
    }

    case 'setMode': {
      logForDebugging(
        `Persisting mode '${update.mode}' to ${update.destination}`,
      )
      updateSettingsForSource(update.destination, {
        permissions: {
          defaultMode: update.mode,
        },
      })
      break
    }

    case 'replaceRules': {
      logForDebugging(
        `Replacing all ${update.behavior} rules in ${update.destination} with ${update.rules.length} rule(s)`,
      )
      const ruleStrings = update.rules.map(permissionRuleValueToString)
      updateSettingsForSource(update.destination, {
        permissions: {
          [update.behavior]: ruleStrings,
        },
      })
      break
    }
  }
}

/**
 * Persists multiple permission updates to the appropriate settings sources.
 * Only persists updates with persistable sources（旧仓逐字）。
 */
export function persistPermissionUpdates(updates: PermissionUpdate[]): void {
  for (const update of updates) {
    persistPermissionUpdate(update)
  }
}

/**
 * Creates a Read rule suggestion for a directory（旧仓语义逐字；
 * toPosixPath 裁——POSIX 单平台，路径原串直用）。
 * @returns A PermissionUpdate for a Read rule, or undefined for the root
 *   directory（根目录过宽，不成为合理权限目标）
 */
export function createReadRuleSuggestion(
  dirPath: string,
  destination: PermissionUpdateDestination = 'session',
): PermissionUpdate | undefined {
  // 旧仓 = toPosixPath(dirPath)（Windows 反斜杠转换）；新仓 POSIX 单平台
  // → 原串直用（§8.35 裁定 ④）
  const pathForPattern = dirPath

  // Root directory is too broad to be a reasonable permission target
  if (pathForPattern === '/') {
    return undefined
  }

  // For absolute paths, prepend an extra / to create //path/** pattern
  const ruleContent = posix.isAbsolute(pathForPattern)
    ? `/${pathForPattern}/**`
    : `${pathForPattern}/**`

  return {
    type: 'addRules',
    rules: [
      {
        toolName: 'Read',
        ruleContent,
      },
    ],
    behavior: 'allow',
    destination,
  }
}
