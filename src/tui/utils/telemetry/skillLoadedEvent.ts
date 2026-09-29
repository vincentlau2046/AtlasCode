import { getSkillToolCommands } from '../../commands.js'
import { getCharBudget } from '../../tools/SkillTool/prompt.js'

/**
 * Logs a atlas_skill_loaded event for each skill available at session startup.
 * This enables analytics on which skills are available across sessions.
 */
export async function logSkillsLoaded(
  cwd: string,
  contextWindowTokens: number,
): Promise<void> {
  const skills = await getSkillToolCommands(cwd)
  const skillBudget = getCharBudget(contextWindowTokens)

  for (const skill of skills) {
    if (skill.type !== 'prompt') continue

  }
}
