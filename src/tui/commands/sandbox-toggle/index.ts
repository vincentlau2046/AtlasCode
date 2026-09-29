import figures from 'figures'
import type { Command } from '../../commands.js'
import { getSandboxManager } from 'src/tui/sandboxCompat'

const command = {
  name: 'sandbox',
  get description() {
    const currentlyEnabled = getSandboxManager().isSandboxingEnabled()
    const autoAllow = getSandboxManager().isAutoAllowBashIfSandboxedEnabled()
    const allowUnsandboxed = getSandboxManager().areUnsandboxedCommandsAllowed()
    const isLocked = getSandboxManager().areSandboxSettingsLockedByPolicy()
    const hasDeps = getSandboxManager().checkDependencies().errors.length === 0

    // Show warning icon if dependencies missing, otherwise enabled/disabled status
    let icon: string
    if (!hasDeps) {
      icon = figures.warning
    } else {
      icon = currentlyEnabled ? figures.tick : figures.circle
    }

    let statusText = 'sandbox disabled'
    if (currentlyEnabled) {
      statusText = autoAllow
        ? 'sandbox enabled (auto-allow)'
        : 'sandbox enabled'

      // Add unsandboxed fallback status
      statusText += allowUnsandboxed ? ', fallback allowed' : ''
    }

    if (isLocked) {
      statusText += ' (managed)'
    }

    return `${icon} ${statusText} (⏎ to configure)`
  },
  argumentHint: 'exclude "command pattern"',
  get isHidden() {
    return (
      !getSandboxManager().isSupportedPlatform() ||
      !getSandboxManager().isPlatformInEnabledList()
    )
  },
  immediate: true,
  type: 'local-jsx',
  load: () => import('./sandbox-toggle.js'),
} satisfies Command

export default command
