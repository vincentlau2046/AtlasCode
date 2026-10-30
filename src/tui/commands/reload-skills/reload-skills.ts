/**
 * /reload-skills 命令本体（0.1.60 TUI-3，CC 2.1.152）。
 *
 * 复用 skillChangeDetector 的强制重扫面 reloadSkillsNow()（watcher scheduleReload
 * 尾部同序：clearSkillCaches + clearCommandsCache + resetSentSkillNames +
 * skillsChanged.emit），使会话内 skill registry 刷新（新增/移除/变更 skill 不重启
 * 生效）。与 /reload-plugins（插件 Layer-3 refresh）同族面，本命令仅覆盖 skill 面。
 */
import type { LocalCommandCall } from '../../types/command.js'
import { reloadSkillsNow } from '../../utils/skills/skillChangeDetector.js'

export const call: LocalCommandCall = async (_args, _context) => {
  reloadSkillsNow()
  return {
    type: 'text',
    // K3-C L44（上游 299）：补 skill 列表重发语义——reloadSkillsNow 内含
    // resetSentSkillNames，下一条用户提示会把完整 skill 列表重发给模型
    //（registry 刷新对模型可见，不只是 TUI 面）。
    value:
      'Re-scanned skill directories; in-session skill registry refreshed (new/removed/changed skills now active without restart). The complete skill list will be re-sent to the model with your next message.',
  }
}
