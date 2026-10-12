/**
 * /reload-skills — 0.1.60 TUI-3（CC 2.1.152）。
 *
 * 会话内 skill registry 重扫刷新：skills 目录变更 / 插件装卸后无需重启生效。
 * 触发既有 skillChangeDetector 的强制重扫面（clearSkillCaches + clearCommandsCache
 * + resetSentSkillNames + skillsChanged.emit）→ REPL useSkillsChange 订阅该信号后
 * 重取 getCommands() 刷新 typeahead/help 列表。仅本命令面（交互安装自动 refresh
 * 不扩 scope，0.1.04 TUI audit「Layer-3 refresh」缺口同族面）。
 */
import type { Command } from '../../commands.js'

const reloadSkills = {
  type: 'local',
  name: 'reload-skills',
  description:
    'Re-scan skill directories and refresh the in-session skill registry',
  supportsNonInteractive: false,
  load: () => import('./reload-skills.js'),
} satisfies Command

export default reloadSkills
