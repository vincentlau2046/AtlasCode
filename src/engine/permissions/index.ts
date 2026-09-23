/**
 * engine/permissions 子门面（STR-1：外部消费者经 engine 根 index 消费；
 * 本子门面 = L3 连接器层组织 + 测试直 import 位）。
 *
 * E-4 S-4c1（§8.34）落：
 * - permissionRulesLoader：权限规则磁盘加载 / 写回（旧 permissionsLoader 296L
 *   全迁 + deletePermissionRule ⑩ 签名 + syncPermissionRulesFromDisk 接缝⑤
 *   核销；依赖改法 ⑦ 全走 engine/config + shared + permissions 域门面）
 * - permissionSetup：CLI 初始权限上下文装配 9 函数保留面（② GB 裁 /
 *   ③ auto 支裁 / ④ validate 支裁 → E-6 / auto-mode 波）
 *
 * L3 定位：本层 = 跨域连接器（import shared / bootstrap / engine·config /
 * engine·tools / permissions 域）；permissions 纯叶域约束不变（叶域不 import
 * engine），测试只 import 域根 / engine 根门面（口径不变）。
 */
export * from './permissionRulesLoader'
export * from './permissionSetup'
