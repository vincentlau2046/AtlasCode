// M2 (docs/06): 角色注册表已迁入 core/modelprovider/roles.js
import { getRoleModel } from 'src/modelprovider'

// When the user has never set teammateDefaultModel in /config, new teammates
// use the premium-role model (the most capable model).
export function getHardcodedTeammateModelFallback(): string {
  return getRoleModel('premium')
}
