/**
 * 0.1.35 O-12 档 A（宽终端品牌卡条件居中）判别单测（spec §0.4，e2e gate ⑥ 判据的纯函数基座）。
 *
 * O-12 档 A（0.1.34 设计裁定归 0.1.35 母题轮，master 4bafee0）：
 *   宽终端（≥200 列抓屏实证）品牌块恒锚左 ~1/3 屏、右 ~2/3 留白，仪式感被稀释。
 *   档 A = 「品牌卡」条件居中：columns≥160（WIDE_CENTRAL_MIN_COLUMNS）时品牌块组合体
 *   左 margin=leftPad=(cols−cardWidth)/2 居中（LogoV2 侧以卡外 marginLeft 施加，
 *   分隔线/feed 随之右移）；<160 保持左锚定零回归（leftPad=0）。
 *   居中占用的水平空间计入 usedSpace → 右栏（feed）按剩余可用宽度收缩，整行不溢出屏宽。
 *
 * 分层纪律：纯函数断言（calculateLayoutDimensions/calculateOptimalLeftWidth/getLayoutMode，
 *   无网络 / 无真实终端 / 无 settings 读取）。e2e gate ⑥ 的 120/200 列双档 PTY 断言
 *   （品牌卡左 margin=(cols−cardWidth)/2 ±2，含边框+paddingX 的 2 cell 渲染偏移）
 *   以本文件的 leftPad 纯函数值为判据基线。
 */
import { describe, expect, test } from 'bun:test'
import {
  WIDE_CENTRAL_MIN_COLUMNS,
  calculateLayoutDimensions,
  calculateOptimalLeftWidth,
  getLayoutMode,
} from '../../src/tui/utils/logoV2Utils.js'

describe('O-12 档 A：WIDE_CENTRAL_MIN_COLUMNS 阈值（spec §0.4 档 A）', () => {
  test('阈值导出 = 160（e2e gate ⑥ 双档判据的 160 界）', () => {
    expect(WIDE_CENTRAL_MIN_COLUMNS).toBe(160)
  })
})

describe('O-12 档 A：calculateLayoutDimensions 宽终端条件居中（horizontal 模式）', () => {
  // cardWidth=50 = calculateOptimalLeftWidth 上限（MAX_LEFT_WIDTH），宽终端常态值
  test('<160（120 列）= 左锚定零回归：leftPad=0，rightWidth 沿用旧公式（零行为变化）', () => {
    const d = calculateLayoutDimensions(120, 'horizontal', 50)
    expect(d.leftWidth).toBe(50)
    expect(d.leftPad).toBe(0)
    // 旧公式：availableForRight = 120 - (BORDER_PADDING 4 + CONTENT_PADDING 2 + DIVIDER 1 + 50) = 63
    expect(d.rightWidth).toBe(63)
    // 旧公式：totalWidth = min(50+63+1+2, 120-4) = 116
    expect(d.totalWidth).toBe(116)
  })

  test('边界判别：159 列 leftPad=0（未达阈值）/ 160 列 leftPad=(160-50)/2=55（恰好居中开启）', () => {
    expect(calculateLayoutDimensions(159, 'horizontal', 50).leftPad).toBe(0)
    expect(calculateLayoutDimensions(160, 'horizontal', 50).leftPad).toBe(55)
  })

  test('160 列 = 阈值首值：leftPad=55，右栏收缩至剩余空间（48），整行恰合屏宽内（156=160-4）', () => {
    const d = calculateLayoutDimensions(160, 'horizontal', 50)
    expect(d.leftPad).toBe(55)
    expect(d.rightWidth).toBe(48)
    expect(d.totalWidth).toBe(156)
  })

  test('200 列 = 用户常态大窗：leftPad=(200-50)/2=75，右栏 68，totalWidth=196=200-4', () => {
    const d = calculateLayoutDimensions(200, 'horizontal', 50)
    expect(d.leftPad).toBe(75)
    expect(d.rightWidth).toBe(68)
    expect(d.totalWidth).toBe(196)
  })

  test('cardWidth 随内容变（非恒 50）：200 列 leftWidth=30 → leftPad=(200-30)/2=85，居中仍对称', () => {
    const d = calculateLayoutDimensions(200, 'horizontal', 30)
    expect(d.leftPad).toBe(85)
    // availableForRight = 200 - (4+2+1+85+30) = 78
    expect(d.rightWidth).toBe(78)
  })

  test('宽终端下右栏保底 30 恒满足（available 最小 48 ≥ 30，max(30,·) 不触发截断）', () => {
    // 最窄宽档 160 列 + 最宽卡 50 → available=48 为全域最小值
    expect(calculateLayoutDimensions(160, 'horizontal', 50).rightWidth).toBeGreaterThanOrEqual(30)
  })

  test('odd 列 floor 语义：161 列 leftPad=floor(111/2)=55（取整不溢出，渲染偏移 e2e ±2 容差内）', () => {
    expect(calculateLayoutDimensions(161, 'horizontal', 50).leftPad).toBe(55)
  })
})

describe('O-12 档 A：非宽终端/紧凑模式零回归', () => {
  test('80 列（horizontal 窄档）leftPad=0（80 列三通道 O-11 截断行为不受影响）', () => {
    expect(calculateLayoutDimensions(80, 'horizontal', 40).leftPad).toBe(0)
  })

  test('compact 模式（<70 列）恒 leftPad=0（LogoV2 早退分支走 CondensedLogo，不消费 leftPad）', () => {
    const d = calculateLayoutDimensions(60, 'compact', 50)
    expect(d.leftPad).toBe(0)
    // compact 旧公式：totalWidth = min(60-4, 50+20) = 56
    expect(d.leftWidth).toBe(56)
    expect(d.rightWidth).toBe(56)
    expect(d.totalWidth).toBe(56)
  })
})

describe('回归基线：calculateOptimalLeftWidth / getLayoutMode 既有行为不漂移', () => {
  test('calculateOptimalLeftWidth：内容宽+4 补白，上限 50（MAX_LEFT_WIDTH），下限 20（clawd art 位）', () => {
    // 内容宽 21 > 下限 20 → 21+4=25（+4 补白路径）
    expect(calculateOptimalLeftWidth('Welcome back vincent!', '/a/b', 'm')).toBe(25)
    // 内容宽 60 → 64 触上限 50
    expect(calculateOptimalLeftWidth('x'.repeat(60), '/a/b', 'm')).toBe(50)
    // 全空 → 下限 20 + 4 = 24
    expect(calculateOptimalLeftWidth('', '', '')).toBe(24)
  })

  test('getLayoutMode：70 列分档（≥70 horizontal / <70 compact）', () => {
    expect(getLayoutMode(70)).toBe('horizontal')
    expect(getLayoutMode(69)).toBe('compact')
  })
})
