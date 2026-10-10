/**
 * PT-20/21/24/10（0.1.48 A-⑤ 分类器硬化，零码在场断言 ×4）：
 * auto-mode 分类器提示词面规则全在场的「在场断言」（工单 §2 判据）。
 *
 * 裁定（工单 §5 决策④/⑤）：规则面全部已在场（迁仓快照 > 2.1.88 基线），
 * 本波 = 在场断言（首轮即绿），零落码。消费点 = yoloClassifier.ts（TUI 车道
 * yolo-classifier-prompts/）+ headless/base 车道（src/permissions/autoMode/prompts/）。
 * 两车道文件当前字节恒等 → 断言两侧锁「两侧都在场」（任一车道被误裁/漂移即红）。
 *
 * 分层纪律：纯静态提示词 grep（无网络/无 LLM/无渲染）→ unit 层。读盘 = 仓内
 * 静态 .txt（import.meta.url 相对路径，engine-headless-options.test 同型）。
 *
 * PT-10 另注：TUI-lane `SandboxNetworkAccess` 发射缺口 = 未来项（工单 §5 ⑤），
 * 不 gate 本项（规则面在场即可）；SDK lane 活 = structuredIO.ts。
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

/** 仓根相对路径（tests/unit/ → ../../src/...）。 */
function readRepo(rel: string): string {
  return readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8')
}

const PERM_BASE = 'src/permissions/autoMode/prompts/permissions_external.txt'
const AUTO_BASE =
  'src/permissions/autoMode/prompts/auto_mode_system_prompt.txt'
const PERM_TUI =
  'src/tui/utils/permissions/yolo-classifier-prompts/permissions_external.txt'
const AUTO_TUI =
  'src/tui/utils/permissions/yolo-classifier-prompts/auto_mode_system_prompt.txt'

/** 断言 text 含全部必需子串（缺失 = 规则面被裁/漂移，红）。 */
function expectAllPresent(label: string, text: string, subs: string[]) {
  for (const s of subs) {
    expect(
      text.includes(s),
      `${label} 缺特征串「${s}」（规则面缺失/漂移）`,
    ).toBe(true)
  }
}

describe('PT-20 Memory Poisoning（permissions_external.txt，CC 2.1.91 功能超集）', () => {
  test('三要件在场：memory dir 投毒定义 + 三例 + Memory Directory allow exception', () => {
    for (const f of [PERM_BASE, PERM_TUI]) {
      expectAllPresent(f, readRepo(f), [
        // ① 定义（:109 Instruction Poisoning，memory dir 投毒）
        'Instruction Poisoning',
        "the agent's memory directory",
        // ② 三例（permission-grant / BLOCK-bypass / fabricated-authorization）
        'permission grant or BLOCK-rule bypass',
        'fabricated user authorization',
        // ③ Memory Directory allow exception（:148）
        'Memory Directory',
        'Routine writes to and deletes',
      ])
    }
  })
})

describe('PT-24 不可逆破坏/公共面/本地服务/凭证泄漏/git hooks（CC 2.1.89）', () => {
  test('五规则特征串在场', () => {
    for (const f of [PERM_BASE, PERM_TUI]) {
      expectAllPresent(f, readRepo(f), [
        // 不可逆破坏（:81 Irreversible Local Destruction，Write/Edit onto untracked）
        'Irreversible Local Destruction',
        'Write/Edit onto an existing untracked',
        // 公共面（:102 Create Public Surface）
        'Create Public Surface',
        // 本地服务暴露（:87 Expose Local Services，Mounting host paths into containers）
        'Expose Local Services',
        'Mounting host paths into containers',
        // 凭证泄漏 + 越位发布（:31+ :96 Out-of-Place Publication）
        'Out-of-Place Publication',
        // git hooks 持久化（:106 Unauthorized Persistence）
        'Unauthorized Persistence',
        'git hooks',
      ])
    }
  })
})

describe('PT-10 Sandbox Network Callback（CC 2.1.110）+ TUI-lane 缺口登记', () => {
  test('五特征 + 白名单支在场（TUI-lane SandboxNetworkAccess 发射缺口 = 未来项，不 gate）', () => {
    for (const f of [PERM_BASE, PERM_TUI]) {
      expectAllPresent(f, readRepo(f), [
        'Sandbox Network Callback',
        // 五特征
        '*.oastify.com', // OAST
        'webhook.site', // request bin
        '*.ngrok.io', // tunnel
        'raw public IPs', // raw public IP
        'DNS-exfil', // DNS exfil
        // 白名单支
        'trusted domain',
      ])
    }
  })
})

describe('PT-21 User Intent 双向授权/约束（auto_mode_system_prompt.txt，CC 2.1.90）', () => {
  test('三要件在场：双向 authorize/bound + 高低证据条 + 边界仅用户消息解除', () => {
    for (const f of [AUTO_BASE, AUTO_TUI]) {
      expectAllPresent(f, readRepo(f), [
        // 规则头（:37）
        'User Intent Rule',
        // 高低证据条（:39，双向 authorize/bound）
        'high evidence bar to authorize danger',
        'low bar to honor a boundary',
        // 双向 authorize / bound（:41/:42）
        '**Authorize**',
        '**Bound**',
        // 边界仅由后续用户消息解除（原则 #5，:73）
        'Boundaries stay in force until clearly lifted',
      ])
    }
  })
})
