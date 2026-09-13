import { pick } from '../lib/text.js'

export const PLACEHOLDERS = [
  'Ask me anything…',
  'Try "explain this codebase"',
  'Try "write a test for…"',
  'Try "refactor the auth module"',
  'Try "/help" for commands',
  'Try "fix the lint errors"',
  'Try "how does the config loader work?"'
]

export const PLACEHOLDER = pick(PLACEHOLDERS)

/** Idle mid-session composer hint — replaces the fully blank `❯ ` row that
 *  read as a rendering glitch between the input frame and the status rule. */
export const FOLLOW_UP_PLACEHOLDER = 'Reply… (/ for commands)'
