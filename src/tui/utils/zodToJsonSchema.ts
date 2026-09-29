/**
 * Converts Zod v4 schemas to JSON Schema using native toJSONSchema.
 *
 * B1 (docs/06 §十一): 实现体已下沉至 core/modelprovider/schema.js（模块收口）；
 * 本路径保留为兼容 re-export，存量消费方（utils/api.ts、utils/toolSearch.ts、
 * entrypoints/mcp.ts）引用清零后删除（strangler 收尾）。
 */
export { zodToJsonSchema, type JsonSchema7Type } from 'src/modelprovider'
