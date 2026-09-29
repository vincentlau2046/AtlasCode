import type { Command } from '../../commands.js'

const tasklist = {
  type: 'local-jsx',
  name: 'tasklist',
  aliases: ['filetsks'],
  description: 'List and inspect file-based tasks (TaskCreate / TaskUpdate)',
  load: () => import('./tasklist.js'),
} satisfies Command

export default tasklist