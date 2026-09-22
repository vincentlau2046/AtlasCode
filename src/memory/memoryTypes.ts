/**
 * Memory type taxonomy — 从旧仓 memdir/memoryTypes.ts 迁入
 *
 * 四类型：user/feedback/project/reference（不可从当前项目状态推导的上下文）。
 */
export const MEMORY_TYPES = [
  'user',
  'feedback',
  'project',
  'reference',
] as const

export type MemoryType = (typeof MEMORY_TYPES)[number]

/**
 * Parse a raw frontmatter value into a MemoryType.
 * Invalid or missing values return undefined.
 */
export function parseMemoryType(raw: unknown): MemoryType | undefined {
  if (typeof raw !== 'string') return undefined
  return MEMORY_TYPES.find(t => t === raw)
}

/**
 * `## Types of memory` section for COMBINED mode (private + team directories).
 */
export const TYPES_SECTION_COMBINED: readonly string[] = [
  '## Types of memory',
  '',
  'There are several discrete types of memory that you can store in your memory system. Each type below declares a <scope> of `private`, `team`, or guidance for choosing between the two.',
  '',
  '<types>',
  '<type>',
  '    <name>user</name>',
  '    <scope>always private</scope>',
  "    <description>Contain information about the user's role, goals, responsibilities, and knowledge.</description>",
  "    <when_to_save>When you learn any details about the user's role, preferences, responsibilities, or knowledge</when_to_save>",
  "    <how_to_use>When your work should be informed by the user's profile or perspective.</how_to_use>",
  '    <examples>',
  "    user: I'm a data scientist investigating what logging we have in place",
  '    assistant: [saves private user memory: user is a data scientist, currently focused on observability/logging]',
  '    </examples>',
  '</type>',
  '<type>',
  '    <name>feedback</name>',
  '    <scope>default to private. Save as team only when the guidance is clearly a project-wide convention.</scope>',
  "    <description>Guidance the user has given you about how to approach work — both what to avoid and what to keep doing.</description>",
  "    <when_to_save>Any time the user corrects your approach OR confirms a non-obvious approach worked.</when_to_save>",
  '    <how_to_use>Let these memories guide your behavior.</how_to_use>',
  '    <body_structure>Lead with the rule itself, then a **Why:** line and a **How to apply:** line.</body_structure>',
  '    <examples>',
  "    user: don't mock the database in these tests",
  '    assistant: [saves team feedback memory: integration tests must hit a real database, not mocks]',
  '    </examples>',
  '</type>',
  '<type>',
  '    <name>project</name>',
  '    <scope>private or team, but strongly bias toward team</scope>',
  '    <description>Information that you learn about ongoing work, goals, initiatives, bugs, or incidents within the project that is not otherwise derivable from the code or git history.</description>',
  "    <when_to_save>When you learn who is doing what, why, or by when. Always convert relative dates to absolute dates.</when_to_save>",
  "    <how_to_use>Use these memories to more fully understand the details behind the user's request.</how_to_use>",
  '    <body_structure>Lead with the fact or decision, then a **Why:** line and a **How to apply:** line.</body_structure>',
  '    <examples>',
  "    user: we're freezing all non-critical merges after Thursday",
  '    assistant: [saves team project memory: merge freeze begins 2026-03-05 for mobile release cut]',
  '    </examples>',
  '</type>',
  '<type>',
  '    <name>reference</name>',
  '    <scope>usually team</scope>',
  '    <description>Stores pointers to where information can be found in external systems.</description>',
  '    <when_to_save>When you learn about resources in external systems and their purpose.</when_to_save>',
  '    <how_to_use>When the user references an external system.</how_to_use>',
  '    <examples>',
  "    user: check the Linear project \"INGEST\" if you want context on these tickets",
  '    assistant: [saves team reference memory: pipeline bugs are tracked in Linear project "INGEST"]',
  '    </examples>',
  '</type>',
  '</types>',
  '',
]

/**
 * `## Types of memory` section for INDIVIDUAL-ONLY mode (single directory).
 */
export const TYPES_SECTION_INDIVIDUAL: readonly string[] = [
  '## Types of memory',
  '',
  'There are several discrete types of memory that you can store in your memory system:',
  '',
  '<types>',
  '<type>',
  '    <name>user</name>',
  "    <description>Contain information about the user's role, goals, responsibilities, and knowledge.</description>",
  "    <when_to_save>When you learn any details about the user's role, preferences, responsibilities, or knowledge</when_to_save>",
  "    <how_to_use>When your work should be informed by the user's profile or perspective.</how_to_use>",
  '    <examples>',
  "    user: I'm a data scientist investigating what logging we have in place",
  '    assistant: [saves user memory: user is a data scientist, currently focused on observability/logging]',
  '    </examples>',
  '</type>',
  '<type>',
  '    <name>feedback</name>',
  "    <description>Guidance the user has given you about how to approach work.</description>",
  "    <when_to_save>Any time the user corrects your approach OR confirms a non-obvious approach worked.</when_to_save>",
  '    <how_to_use>Let these memories guide your behavior.</how_to_use>',
  '    <body_structure>Lead with the rule itself, then a **Why:** line and a **How to apply:** line.</body_structure>',
  '    <examples>',
  "    user: don't mock the database in these tests",
  '    assistant: [saves feedback memory: integration tests must hit a real database, not mocks]',
  '    </examples>',
  '</type>',
  '<type>',
  '    <name>project</name>',
  '    <description>Information that you learn about ongoing work, goals, initiatives, bugs, or incidents.</description>',
  "    <when_to_save>When you learn who is doing what, why, or by when.</when_to_save>",
  "    <how_to_use>Use these memories to more fully understand the details behind the user's request.</how_to_use>",
  '    <body_structure>Lead with the fact or decision, then a **Why:** line and a **How to apply:** line.</body_structure>',
  '    <examples>',
  "    user: we're freezing all non-critical merges after Thursday",
  '    assistant: [saves project memory: merge freeze begins 2026-03-05 for mobile release cut]',
  '    </examples>',
  '</type>',
  '<type>',
  '    <name>reference</name>',
  '    <description>Stores pointers to where information can be found in external systems.</description>',
  '    <when_to_save>When you learn about resources in external systems.</when_to_save>',
  '    <how_to_use>When the user references an external system.</how_to_use>',
  '    <examples>',
  "    user: check the Linear project \"INGEST\" for these tickets",
  '    assistant: [saves reference memory: pipeline bugs are tracked in Linear project "INGEST"]',
  '    </examples>',
  '</type>',
  '</types>',
  '',
]

/**
 * `## What NOT to save in memory` section.
 */
export const WHAT_NOT_TO_SAVE_SECTION: readonly string[] = [
  '## What NOT to save in memory',
  '',
  '- Code patterns, conventions, architecture, file paths, or project structure — these can be derived by reading the current project state.',
  '- Git history, recent changes, or who-changed-what — `git log` / `git blame` are authoritative.',
  '- Debugging solutions or fix recipes — the fix is in the code; the commit message has the context.',
  '- Anything already documented in ATLAS.md files.',
  '- Ephemeral task details: in-progress work, temporary state, current conversation context.',
  '',
  'These exclusions apply even when the user explicitly asks you to save.',
]

export const MEMORY_DRIFT_CAVEAT =
  '- Memory records can become stale over time. Verify that the memory is still correct and up-to-date by reading the current state of the files or resources.'

export const WHEN_TO_ACCESS_SECTION: readonly string[] = [
  '## When to access memories',
  '- When memories seem relevant, or the user references prior-conversation work.',
  '- You MUST access memory when the user explicitly asks you to check, recall, or remember.',
  '- If the user says to *ignore* or *not use* memory: proceed as if MEMORY.md were empty.',
  MEMORY_DRIFT_CAVEAT,
]

export const TRUSTING_RECALL_SECTION: readonly string[] = [
  '## Before recommending from memory',
  '',
  'A memory that names a specific function, file, or flag is a claim that it existed *when the memory was written*. Before recommending it:',
  '',
  '- If the memory names a file path: check the file exists.',
  '- If the memory names a function or flag: grep for it.',
  '- If the user is about to act on your recommendation, verify first.',
]

export const MEMORY_FRONTMATTER_EXAMPLE: readonly string[] = [
  '```markdown',
  '---',
  'name: {{memory name}}',
  'description: {{one-line description}}',
  `type: {{${MEMORY_TYPES.join(', ')}}}`,
  '---',
  '',
  '{{memory content}}',
  '```',
]
