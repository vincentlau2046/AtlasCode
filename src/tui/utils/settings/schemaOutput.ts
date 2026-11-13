import { toJSONSchema } from 'zod/v4'
import { jsonStringify } from '../slowOperations'
import { SettingsSchema } from '../../../kernel/settings/types'

export function generateSettingsJSONSchema(): string {
  const jsonSchema = toJSONSchema(SettingsSchema(), { unrepresentable: 'any' })
  return jsonStringify(jsonSchema, null, 2)
}
