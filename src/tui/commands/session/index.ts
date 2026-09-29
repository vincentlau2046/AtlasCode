import type { Command } from '../../commands.js'

const session = {
  type: 'local-jsx',
  name: 'session',
  aliases: ['remote'],
  description: 'Show session info (remote QR code or local session details)',
  // Always enabled — local mode shows session info, remote mode shows QR code
  load: () => import('./session.js'),
} satisfies Command

export default session