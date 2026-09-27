/**
 * Hard-coded fallback model for teammates when no model is explicitly configured.
 *
 * 源 = 旧仓 a8af45b src/utils/swarm/teammateModel.ts（8L）逐字迁移（S-E2a）。
 * Delta ① 旧仓 core/modelprovider roles 直连 → 新仓 modelprovider 域门面
 *（getRoleModel 已在门面宽面块 [L140 区] 导出，零扩面——S-E2a 勘察误判为
 * 窄面缺口，tsc 查重后核销）。
 * 消费面 = S-E2c InProcessBackend spawn（config.model 缺省支）。
 */
import { getRoleModel } from '../modelprovider'

export function getHardcodedTeammateModelFallback(): string | undefined {
  return getRoleModel('premium')
}
