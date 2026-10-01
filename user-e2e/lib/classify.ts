/**
 * user-e2e 失败分层（方案 §7）：
 * L1 TUI 渲染/消息队列 | L2 engine loop | L3 modelprovider | L4 IFF 网关
 * 双向对照定位：同 case PTY(headless) 双跑，结果差异即分层信号。
 */
import type { CaseRec } from './checkpoint'

export interface LayerResult {
  layer: 'L1' | 'L2' | 'L3' | 'L4' | 'UNRESOLVED'
  title: string
  rationale: string
  suspects: string[]
}

const SUSPECTS: Record<string, string[]> = {
  L1: [
    'src/tui/utils/processUserInput/（输入入队/处理）',
    'src/tui/utils/queueProcessor.ts（排队消息面）',
    'src/tui/loopEvents.ts（loop 事件 → 渲染）',
    'src/tui/components/PromptInput（输入框可达性）',
  ],
  L2: [
    'src/engine/query/（queryAgentLoop 多轮面）',
    'src/engine/loop（agent loop 状态/终止判定）',
  ],
  L3: [
    'src/modelprovider/（角色池装载/EndpointConfigSource/healthCheck）',
    'src/atlascode/compose.ts（组合根接线：缺接线 = empty pool 假阴性先例，cli.ts 头注 G-α）',
  ],
  L4: [
    'IFF 网关侧（chat 端点 200/0-token 形态；对照用户 IFF 监控 0/0 行时段）',
  ],
}

/** 由双 driver 结果 + 证据分类单 case 的主层 */
export function classify(rec: CaseRec): LayerResult {
  const d = rec.drivers ?? {}
  const pty = d.pty
  const hl = d.headless
  const notes = `${rec.note ?? ''} ${Object.values(d)
    .map(x => x.detail ?? '')
    .join(' ')}`

  // 门控 SKIP
  if (rec.verdict === 'SKIP') {
    return {
      layer: 'UNRESOLVED',
      title: '门控未放行（非产品故障）',
      rationale: notes,
      suspects: [],
    }
  }

  // 仅 TUI 面失败而 headless 同 case 通过 → L1
  if (pty && !pty.ok && hl && hl.ok) {
    return {
      layer: 'L1',
      title: 'TUI 面断、headless 同 case 通过 → 渲染/消息队列层',
      rationale: `TUI: ${pty.detail ?? ''} | headless: ${hl.detail ?? ''}`,
      suspects: SUSPECTS.L1,
    }
  }

  // 双挂
  const bothBad = (!pty || !pty.ok) && (!hl || !hl.ok)
  if (bothBad) {
    if (/empty pool|No models configured/i.test(notes)) {
      return {
        layer: 'L3',
        title: '角色池装载失败（empty pool 假阴性形态）',
        rationale: notes,
        suspects: SUSPECTS.L3,
      }
    }
    const hlZero = hl?.zeroContent === true
    if (hlZero) {
      return {
        layer: 'L4',
        title: '请求发出但 0 内容返回（IFF 网关空响应形态，0/0 对应面）',
        rationale: `headless 0 内容（${hl?.detail ?? ''}）；对照 IFF 监控同时段 0/0 行（注意 §2-F4：健康探针的 0/0 1ms 属正常，须比对 chat 回合时段）`,
        suspects: SUSPECTS.L4,
      }
    }
    if (/is_error|result 缺失|无 result/i.test(notes)) {
      return {
        layer: 'L2',
        title: 'engine loop 面（result 缺失/错误）',
        rationale: notes,
        suspects: SUSPECTS.L2,
      }
    }
    return {
      layer: 'L2',
      title: '双 driver 同挂，倾向 engine loop（待 §7 人工复核细化 L2/L3/L4）',
      rationale: notes,
      suspects: [...SUSPECTS.L2, ...SUSPECTS.L3, ...SUSPECTS.L4],
    }
  }

  // NAVFAIL（picker/dialog 渲染了但导航坏：选不中/Esc 关不掉/选择后崩）
  // 与 STUCK 区分：STUCK = 输入框死（连探针都不回显）；NAVFAIL = 面板出了但交互坏
  if (rec.verdict === 'NAVFAIL') {
    return {
      layer: 'L1',
      title: 'picker/dialog 渲染但交互导航坏（选择/Esc/焦点异常）',
      rationale: notes,
      suspects: [
        ...SUSPECTS.L1,
        'src/tui/components/CustomSelect/（键盘导航 ↑↓EnterEsc）',
        'src/tui/keybindings/（Select scope 绑定）',
      ],
    }
  }

  // STUCK（session 被打死/输入失联）
  if (rec.verdict === 'STUCK') {
    return {
      layer: 'L1',
      title: 'TUI session 失联/被打死（命令后输入面不可恢复）',
      rationale: notes,
      suspects: SUSPECTS.L1,
    }
  }

  // TIMEOUT
  if (rec.verdict === 'TIMEOUT') {
    return {
      layer: 'UNRESOLVED',
      title: '超时（模型慢/回合长；对照 soak 时延曲线判 loop 漂移）',
      rationale: notes,
      suspects: [...SUSPECTS.L2, ...SUSPECTS.L4],
    }
  }

  return {
    layer: 'UNRESOLVED',
    title: '未决（证据不足，见 evidence）',
    rationale: notes,
    suspects: [],
  }
}
