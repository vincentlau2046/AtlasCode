import type { Command } from '../../commands.js'

export default {
  type: 'local-jsx',
  name: 'sidebar',
  description: 'Open the multi-page side drawer (1-5: Diff/Plan/Activity/Decisions/Budget)',
  load: () => import('./sidebar.js'),
} satisfies Command
