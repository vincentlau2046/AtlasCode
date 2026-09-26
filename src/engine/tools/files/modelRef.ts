/**
 * engine/tools/files — 主循环模型引用（C 桶 ① 子波 3 §8.55，关键语义
 * 裁定 D 组 ①）。
 *
 * 旧仓来源（a8af45b）：src/utils/model/model.ts 358L 的 getMainLoopModel /
 * getCanonicalName（新仓未落，model/model.ts 整文件不随迁）。delta 裁定
 * 登记（防「以为已全」）：
 *  - 旧 getMainLoopModel = 用户 settings 链（modelRoles.small 池头 >
 *    ATLAS_MODEL > 默认；旧 L105 语义 = 主循环跑 small 角色池头）→ 新 =
 *    modelprovider `getRoleConfig('small').model`（与 engine/query spine
 *    默认 role 'small' 一致；未配置 = '' 空串，调用面按保守分支处理）。
 *  - 旧 getCanonicalName = resolveModel 元数据表（旧仓已删，L204 头注：
 *    「现网模型名由 3-role + provider 元数据驱动，不再有 claude-* 版本
 *    前缀」）→ 回退支逐字 = `fullModelName.toLowerCase()`，新仓直接取
 *    回退语义（无元数据表可查）。
 * 消费方：Read 缓解面（shouldIncludeFileReadMitigation，MITIGATION_EXEMPT_MODELS
 * 恒不命中 = OpenAI 协议世界恒含缓解提示，行为保守等价）+ pdfUtils
 * isPDFSupported（claude-3-haiku 子串判，新模型名恒不命中 = PDF 块面恒
 * 支持）。
 */
import { getRoleConfig } from '../../../modelprovider'

/** 主循环模型名（small 角色池头；未配置 = ''）。 */
export function getMainLoopModelName(): string {
  return getRoleConfig('small').model ?? ''
}

/** 规范名（旧 getCanonicalName 回退语义逐字：小写）。 */
export function getCanonicalModelName(fullModelName: string): string {
  return fullModelName.toLowerCase()
}
