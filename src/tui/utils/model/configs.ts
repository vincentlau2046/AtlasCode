import type { ModelName } from './model.js'

// P3 de-Claude: the 10-entry claude-* model table (haiku35…opus46) was the
// Anthropic model-metadata system. It is replaced by a 3-role table
// (premium/small/fast). Each role's model is resolved from the config file
// (settings.modelRoles) via getRoleModel(); the values below are only the
// built-in IFF gateway defaults (local OpenAI-protocol endpoint on :8999),
// used when a role is not configured in settings.json.
export type RoleKey = 'premium' | 'small' | 'fast'

export const ROLE_MODELS: Record<RoleKey, string> = {
  premium: 'qwen38-27b-abliterated',
  small: 'qwen38-27b-abliterated',
  fast: 'qwen38-27b-abliterated',
}
