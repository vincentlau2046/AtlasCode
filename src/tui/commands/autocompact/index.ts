import type { Command } from '../../commands.js'

const autocompact = {
  type: 'local-jsx',
  name: 'autocompact',
  description:
    'Set the auto-compact window tier (picker, or /autocompact 128k direct: 100k/128k/200k/256k/Nk/P%/auto/off)',
  load: () => import('./autocompact.js'),
} satisfies Command

export default autocompact
