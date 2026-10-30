/**
 * 0.1.82 K3-D D3 判别单测（上游 296）：同名插件排除的 /plugin 可见提示。
 *
 * 判别结论（2026-10-30，工单 0.2 表「/plugin 提示某插件 hook 因另一启用
 * 插件同名被排除」行留痕）：
 *  (a) 运行时 hook 注册面（loadPluginHooks）无同名排除——所有 enabled 插件
 *      的 hooks naive merge，两个同名 marketplace 插件都注册（上游「晚加载
 *      同名插件 hook 被跳过」的前提在本仓 hook 面结构性不存在）。
 *  (b) 插件装载面（mergePluginSources）有唯一的同名排除实在面：session
 *      (--plugin-dir) 插件覆盖同名 marketplace 插件——marketplace 版整只
 *      被滤掉（hooks 随之排除）。这正是「某插件（的 hooks）因另一启用插件
 *      同名被排除」的本仓实例。该排除此前**静默**（仅 logForDebugging）：
 *      managed 冲突面有 generic-error 提示先例，session-wins 面零记录 →
 *      /plugin 看不到「已装版为何不生效」。
 *  (c) 异拼写面：name 比较大小写敏感（Set.has 精确匹配），无 canonical
 *      化误排除（上游 casing bug 面在本仓 void）。
 *
 * 修（对齐 296 提示面，文件内先例 = managed 冲突 generic-error）：session
 * 覆盖滤除 marketplace 同名插件时 push generic-error → /plugin
 * （PluginErrors/ManagePlugins 消费 errors 数组）可见。
 *
 * 修前红：① 排除记录断言（errors 空）；恒等锚：无碰撞零 error / managed
 * 冲突既有提示 / session 胜出排除行为本身不变 / 大小写敏感不误排除 /
 * marketplace 间同名不去重（运行时双注册证据）。
 */
import { describe, expect, test } from 'bun:test'

import { mergePluginSources } from '../../src/tui/utils/plugins/pluginLoader.js'
import type { LoadedPlugin } from '../../src/tui/types/plugin.js'

function plugin(name: string, source: string): LoadedPlugin {
  return { name, source, path: `/plugins/${source}/${name}` } as unknown as LoadedPlugin
}

describe('K3-D D3：同名插件排除提示（mergePluginSources）', () => {
  test('① session 覆盖同名 marketplace 插件 → errors 记录排除（/plugin 可见）', () => {
    const r = mergePluginSources({
      session: [plugin('foo', 'foo@inline')],
      marketplace: [plugin('foo', 'foo@official-mkt')],
      builtin: [],
    })
    // session 胜出（既有行为）
    expect(r.plugins.map(p => p.source)).toEqual(['foo@inline'])
    // 排除记录（修面）：用户在 /plugin 须能看到已装版为何不生效
    const hints = r.errors.filter(
      e =>
        e.type === 'generic-error' &&
        e.error.includes('foo') &&
        /override|exclude|skip/i.test(e.error),
    )
    expect(hints.length).toBe(1)
    expect(hints[0]?.plugin).toBe('foo')
    expect(hints[0]?.source).toBe('foo@official-mkt')
  })

  test('恒等锚：无同名碰撞 → 零 error', () => {
    const r = mergePluginSources({
      session: [plugin('dev-one', 'dev-one@inline')],
      marketplace: [plugin('other', 'other@official-mkt')],
      builtin: [],
    })
    expect(r.errors.length).toBe(0)
    expect(r.plugins.map(p => p.name).sort()).toEqual(['dev-one', 'other'])
  })

  test('恒等锚：managed 冲突面既有提示保持（session 被 managed 锁 → 既有 error）', () => {
    const r = mergePluginSources({
      session: [plugin('foo', 'foo@inline')],
      marketplace: [],
      builtin: [],
      managedNames: new Set(['foo']),
    })
    expect(r.plugins.length).toBe(0)
    const managed = r.errors.filter(e => e.error.includes('managed settings'))
    expect(managed.length).toBe(1)
  })

  test('恒等锚：大小写敏感不误排除（异拼写面 void 证据）', () => {
    const r = mergePluginSources({
      session: [plugin('Foo', 'Foo@inline')],
      marketplace: [plugin('foo', 'foo@official-mkt')],
      builtin: [],
    })
    // 大小写不同 = 不同名：两个都保留，零排除零 error
    expect(r.plugins.map(p => p.name).sort()).toEqual(['Foo', 'foo'])
    expect(r.errors.length).toBe(0)
  })

  test('恒等锚：marketplace 间同名不去重（运行时双注册 = 上游跳过前提 void 证据）', () => {
    const r = mergePluginSources({
      session: [],
      marketplace: [
        plugin('foo', 'foo@mkt-a'),
        plugin('foo', 'foo@mkt-b'),
      ],
      builtin: [],
    })
    // 本仓 merge 面对 marketplace 间同名不去重——两个都进 plugins
    // （hooks 面随之双注册，不存在「晚者被排除」）
    expect(r.plugins.map(p => p.source).sort()).toEqual(['foo@mkt-a', 'foo@mkt-b'])
    expect(r.errors.length).toBe(0)
  })
})
