/**
 * AtlasWeb S0-R contract 类型闭包 shim（R-3）。
 *
 * 本域对 contract 公开类型的唯一类型入口：**相对路径**引用（而非
 * 'src/...' 别名），使 tsc emitDeclarationOnly 产出的 d.ts 在 pack
 * （dist/web-session-runtime）内相对可解析、零仓库内 specifier 泄漏
 * （§4.5 加载图审计面：声明只依赖 contract 公开类型）。运行时零开销
 * （纯 type re-export）。
 */

export type {
  WebSessionEvent,
  WebSessionProjection,
} from '../../kernel/protocol/webSessionV0'
