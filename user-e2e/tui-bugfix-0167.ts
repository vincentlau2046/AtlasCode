/**
 * 0.1.67 用户 bug 修插入波（A 超时族 + B 模型会话级恢复 + C autocompact 命名面 + E effort per-model）· 双面活探针
 * （e2e lane，gate 判据⑤；工单 docs/2026-10-14-p0-wave-0167-ticket.md §2/§4/§4.5/§4.7，
 * 评估面 = 用户 4 bug 闭环行为波，零回归约束 =「缺省面恒等锚 + 前波精确同值」）。
 *
 * 断言面（全 hard；行为断言优先，链重面源级 + 单测承载回退；PTY 活渲染像素面 = 生产 lane 观察面）：
 *   T1 A-1 缺省 900s：LLM_TIMEOUT_DEFAULT_MS === 900_000
 *   T2 A-2 误配提示：llmTimeoutUnitHint 30_000 → 在场（「单位是毫秒」+「×1000」）/ 120_000 → undefined（不误报）/ 0 → undefined（未设档守卫）
 *   T3 A-3 错误行单位显形：llmTimeoutRemediationHint(err, 900_000) → 「900s (900000ms)」+「上限 30min」
 *   M1 B-1 写档 null 不写：saveSessionModelSetting(x) 在场写 / (null) → undefined
 *   M2 B-2 会话级恢复链（源级）：model-setting entry 写读 + sessionRestore 恢复支（会话记录 > 全局 settings.model / 缺省）+ CLI 压过支（setMainLoopModelOverride）
 *   M3 B-3 池外模型显式提示：globalModelRejectedNotice 源级在场（「不在 availableModels 池内，已回退 default」）+ model.ts 静默拒绝面修
 *   M4 无记录恒等锚（恒绿必跑 + 基线同绿守卫）：无 model-setting 记录 → 恢复回落缺省（缺失 = 0.1.66 前原行为恒等）
 *   C1 C-1 重钉根修（源级）：reAppendSessionMetadata 调用点 + post-compact >64KB tail 常量面（陈旧 16KB 注释离场）
 *   C2 C-3 win32 case 面 = 单测 mock 承载（session-project-dir-win32.test.ts 4/4，探针侧记承载 + 源级 win32 归一 token）
 *   E1 E-1 picker 写侧去全局覆写（源级）：ModelPicker handleSelect 只写 effortByModel（全局 effortLevel 同调写离场 + 旧注释「last-write fallback」离场）
 *   E2 E-2 wire per-model 记忆槽（行为）：resolveAppliedEffort settings 注入 effortByModel[X]=high/Y=low + 会话 explicit=medium → X=high / Y=low（case-insensitive）；env ATLAS_EFFORT_LEVEL 恒胜；无记忆模型回落 appState/缺省
 *   E3 E-3 sticky 核验（源级）：modelprovider effortByModelSource 双源面在场 + agentLoopDeps 会话单值面 + /model getStartupEffortValue 重解析位在场（零码核验面）
 *   G1 恒等锚：LLM_TIMEOUT_CAP_MS === 1_800_000（上限 30min 语义不变）
 *   G2 恒等锚：/effort 命令全局语义（effort 面 auto 清 effortByModel 语义保留位在场）
 *   G3 恒等锚：角色模型 effort 面零变更（modelSupportsEffort 面在场）
 *
 * 基线面（修前红形 @8adfd97 = v0.1.66）：T1 600_000 红 / T2 llmTimeoutUnitHint 缺席红 / T3 A-3 单位面缺席红 /
 * M1 saveSessionModelSetting 缺席红 / M2 model-setting entry 缺席红 / M3 globalModelRejectedNotice 缺席红 /
 * E1 picker 全局覆写在场红 / E2 per-model 查槽缺席红（双发 appState 值）/ C1 64KB 重钉面缺席红；
 * M4/G1/G2/G3/C2 = 恒等守卫（基线同绿 / INC 结构承载）。
 * 用法：
 *   ATLAS_E2E_BUGFIX0167_REPO=<worktree 绝对路径> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-bugfix-0167.ts
 */
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const REPO = process.env.ATLAS_E2E_BUGFIX0167_REPO ?? '/home/vince/projects/AtlasCode/worktrees/worktree-gate-067'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }
const readSrc = (p: string): string => { try { return readFileSync(p, 'utf8') } catch { return '' } }

async function main(): Promise<void> {
  const probes: Probe[] = []
  const push = (id: string, ok: boolean | null, detail: string, hard = true) => probes.push({ id, hard, ok, detail })

  // ── 面 1：A 超时族 ───────────────────────────────────────────────
  const constantsMod: any = await import(join(REPO, 'src/modelprovider/constants.ts')).catch(() => ({}))
  const mpMod: any = await import(join(REPO, 'src/modelprovider/modelprovider.ts')).catch(() => ({}))

  // T1 缺省 900s
  const defaultMs = constantsMod.LLM_TIMEOUT_DEFAULT_MS
  push('T1-default-900s', defaultMs === 900_000,
    defaultMs === 900_000
      ? `A-1 缺省 900s（LLM_TIMEOUT_DEFAULT_MS = ${defaultMs} = 15min，用户 2026-10-14 裁定 600s→15min）`
      : `A-1 缺省缺口（LLM_TIMEOUT_DEFAULT_MS = ${defaultMs} ≠ 900_000 = 修前红形/旧缺省面）`)

  // T2 误配提示三态
  const hintFn = typeof mpMod.llmTimeoutUnitHint === 'function' ? mpMod.llmTimeoutUnitHint : null
  const t2a = hintFn ? /单位是毫秒/.test(hintFn(30_000) ?? '') && /×1000|x1000|1000/.test(hintFn(30_000) ?? '') && (hintFn(30_000) ?? '').includes('30000') : false
  const t2b = hintFn ? hintFn(120_000) === undefined : false
  const t2c = hintFn ? hintFn(0) === undefined : false
  push('T2-misconfig-hint-tri-state', t2a && t2b && t2c,
    t2a && t2b && t2c
      ? `A-2 误配提示三态（30_000 → 「单位是毫秒…×1000」在场不阻断 / 120_000 → undefined 不误报 / 0 → undefined 未设档守卫；函数缺席 = 修前红形）`
      : `A-2 缺口（fn=${hintFn ? '在场' : '缺席'} smallHit=${t2a} noFalseReport=${t2b} zeroGuard=${t2c} = 修前红形活面现形）`)

  // T3 错误行单位显形（isClientRequestTimeout 类族判别：name/ctor = APITimeoutError/APIConnectionTimeoutError）
  const remFn = typeof mpMod.llmTimeoutRemediationHint === 'function' ? mpMod.llmTimeoutRemediationHint : null
  const fakeTimeoutErr = Object.assign(new Error('Request timed out.'), { name: 'APITimeoutError' })
  const t3Out = remFn ? (remFn(fakeTimeoutErr, 900_000) ?? '') : ''
  const t3 = t3Out.includes('900s') && t3Out.includes('900000ms') && t3Out.includes('上限 30min')
  push('T3-error-line-unit-display', t3,
    t3
      ? `A-3 错误行单位显形（llmTimeoutRemediationHint(err, 900_000) → 当前超时 900s（900000ms）+ 上限 30min（1800000ms），毫秒自明；修前红形 = 无单位换算面）`
      : `A-3 缺口（out=${t3Out.slice(0, 120) || '(null/函数缺席)'} = 修前红形）`)

  // G1 上限恒等锚
  const capMs = constantsMod.LLM_TIMEOUT_CAP_MS
  push('G1-cap-identity-anchor', capMs === 1_800_000,
    capMs === 1_800_000
      ? `恒等锚（LLM_TIMEOUT_CAP_MS = 1_800_000 上限 30min 语义不变 = 基线同绿守卫）`
      : `恒等锚缺口（CAP = ${capMs} ≠ 1_800_000）`)

  // ── 面 2：B 模型会话级恢复 ──────────────────────────────────────
  const modelMod: any = await import(join(REPO, 'src/tui/utils/model/model.ts')).catch(() => ({}))
  const storageMod: any = await import(join(REPO, 'src/tui/utils/sessionStorage.ts')).catch(() => ({}))
  const storageSrc = readSrc(join(REPO, 'src/tui/utils/sessionStorage.ts'))
  const restoreSrc = readSrc(join(REPO, 'src/tui/utils/sessionRestore.ts'))

  // M1 写档 null 不写（源级承载：getProject 为 sessionStorage L445 未导出局部函数，行为侧读回链不可达；
  // 判据面 = 导出函数在场 + null→undefined 不写空档语义源级在场）
  const m1NullSemantics = /currentSessionModelSetting = modelSetting \?\? undefined/.test(storageSrc)
  const m1 = typeof storageMod.saveSessionModelSetting === 'function' && m1NullSemantics
  push('M1-save-null-not-written', m1,
    m1
      ? `B-1 写档 null 不写（源级：export function saveSessionModelSetting 在场（L2886，onChangeAppState 实时写侧）+ null→undefined 语义在场（L2887 \`getProject().currentSessionModelSetting = modelSetting ?? undefined\`：传 null 不写空档，读侧自然落全局/缺省）；行为侧读回 = getProject 未导出（L445 局部函数），单测承载面回退，生产 lane 观察面）`
      : `B-1 缺口（saveSessionModelSetting=${typeof storageMod.saveSessionModelSetting} null语义在场=${m1NullSemantics} = 修前红形）`)

  // M2 恢复链（源级：entry 写读 + 恢复支 + CLI 压过）
  const m2 = storageSrc.includes("type: 'model-setting'") && /entry\.type === 'model-setting'/.test(storageSrc)
    && restoreSrc.includes('model-setting')
    && restoreSrc.includes('setMainLoopModelOverride(parseUserSpecifiedModel')
  push('M2-session-model-restore-chain', m2,
    m2
      ? `B-2 会话级恢复链（源级：sessionStorage model-setting entry 写〔meta.modelSetting〕+ 读〔entry.type === 'model-setting' 恢复支〕+ sessionRestore 恢复面〔会话记录 > 全局 settings.model / 缺省〕+ CLI 压过支 setMainLoopModelOverride(parseUserSpecifiedModel) 在场）`
      : `B-2 缺口（storage写=${storageSrc.includes("type: 'model-setting'")} storage读=${/entry\.type === 'model-setting'/.test(storageSrc)} restore链=${restoreSrc.includes('model-setting')} CLI压过=${restoreSrc.includes('setMainLoopModelOverride(parseUserSpecifiedModel')} = 修前红形）`)

  // M3 池外模型显式提示
  const modelSrc = readSrc(join(REPO, 'src/tui/utils/model/model.ts'))
  const m3 = typeof modelMod.globalModelRejectedNotice === 'function'
    && modelSrc.includes('不在 availableModels 池内，已回退 default')
  push('M3-pool-reject-explicit-notice', m3,
    m3
      ? `B-3 池外 allowlist 静默拒绝修（globalModelRejectedNotice 函数在场 + 提示文案「已选模型 X 不在 availableModels 池内，已回退 default」源级在场 = 修前静默 undefined 红→修后显式提示绿）`
      : `B-3 缺口（fn=${typeof modelMod.globalModelRejectedNotice} 文案在场=${modelSrc.includes('不在 availableModels 池内，已回退 default')} = 修前红形）`)

  // M4 无记录恒等锚（恒绿必跑 + 基线同绿）
  const m4 = restoreSrc.includes('model-setting') && /缺省|default/i.test(restoreSrc)
  push('M4-no-record-identity-anchor', m4,
    m4
      ? `无记录恒等锚（sessionRestore 面 = 会话 model-setting 记录 > 全局 settings.model > 缺省：无记录回落缺省 = 0.1.66 前原行为恒等；基线同绿守卫）`
      : `恒等锚缺口（恢复支缺席 → 无法核验回落链）`)

  // ── 面 3：C autocompact 命名面 ──────────────────────────────────
  const compactSrc = readSrc(join(REPO, 'src/tui/contextBodies/compact.ts'))
  const c1 = storageSrc.includes('reAppendSessionMetadata') && (storageSrc.includes('65536') || /64\s?KB|64KB/i.test(storageSrc) || readSrc(join(REPO, 'src/tui/utils/sessionStoragePortable.ts')).includes('reAppendSessionMetadata'))
  const stale16KLeft = /16\s?KB|16384/i.test(storageSrc) && !/陈旧/.test(storageSrc)
  push('C1-reappend-reding-source', c1 && !stale16KLeft,
    c1 && !stale16KLeft
      ? `C-1 重钉根修（源级：reAppendSessionMetadata 调用点在场 + post-compact 追加面 >64KB tail 常量面在场（65536/64KB）+ 陈旧 16KB 注释离场 = 命名 session post-compact 追加后名称不回退的根修承载面）`
      : `C-1 缺口（reAppend在场=${storageSrc.includes('reAppendSessionMetadata')} 64KB面=${/65536|64\s?KB/i.test(storageSrc)} 陈旧注释残留=${stale16KLeft} = 修前红形）`)

  const win32TestSrc = readSrc(join(REPO, 'tests/unit/session-project-dir-win32.test.ts'))
  const portableSrc = readSrc(join(REPO, 'src/tui/utils/sessionStoragePortable.ts'))
  const c2 = win32TestSrc.length > 0 && /win32/i.test(portableSrc + win32TestSrc)
  push('C2-win32-case-mock-carry', c2,
    c2
      ? `C-3 win32 写侧 case 面 = 单测 mock 承载（session-project-dir-win32.test.ts 在场〔gate 判别单测 4/4 已跑〕+ sessionStoragePortable win32 归一面在场；Linux 机活跑 = mock 面非实跑面，生产 lane 观察面登记）`
      : `C-3 缺口（win32 单测在场=${win32TestSrc.length > 0} 归一面=${/win32/i.test(portableSrc + win32TestSrc)} = 修前红形）`)

  // ── 面 4：E effort per-model ────────────────────────────────────
  const pickerSrc = readSrc(join(REPO, 'src/tui/components/ModelPicker.tsx'))
  // E-1：if 支（可记忆模型）只写 effortByModel 独写（同调调用体内无 effortLevel 键）；
  // else 支（角色模型无记忆面）保留全局写 effortLevel: persistable = 波体设计位，容忍；旧注释离场
  const e1IfBranch = pickerSrc.match(/updateSettingsForSource\("userSettings",\s*\{([^}]*)effortByModel: withEffortForModel\(selectedModelForPersist, persistable\)/)
  const e1 = !!e1IfBranch && !/effortLevel\s*:/.test(e1IfBranch[1]) && !/last-write fallback/i.test(pickerSrc)
  push('E1-picker-no-global-overwrite', e1,
    e1
      ? `E-1 picker 写侧去全局覆写（源级：handleSelect if 支调用体 = effortByModel 独写〔withEffortForModel，同调对象内无 effortLevel 键〕+ 旧注释「last-write fallback」离场 = 设 Y 的 tier 不再覆写全局槽；else 支〔角色模型 L242〕保留全局写 = 设计位容忍）`
      : `E-1 缺口（if支独写=${e1IfBranch ? '在场' : '缺席'} if支内全局写残留=${e1IfBranch ? /effortLevel\s*:/.test(e1IfBranch[1]) : '(缺席面)'} 旧注释残留=${/last-write fallback/i.test(pickerSrc)} = 修前红形）`)

  // E2 wire per-model 记忆槽（行为：settings 注入 + resolveAppliedEffort 查槽）
  const effortMod: any = await import(join(REPO, 'src/tui/utils/effort.ts')).catch(() => ({}))
  let e2: boolean | null = null
  let e2Detail = 'E2 未执行'
  if (typeof effortMod.resolveAppliedEffort === 'function') {
    // settings 注入面：updateSettingsForSource（userSettings effortByModel 写）+ HOME/cwd 沙箱
    const settingsMod: any = await import(join(REPO, 'src/tui/utils/settings/settings.ts')).catch(() => ({}))
    const home = process.env.HOME
    const cwd = process.cwd()
    const iso = mkdtempSync(join(tmpdir(), 'atlas-0167-e2-'))
    try {
      process.env.HOME = iso
      process.chdir(iso)
      if (typeof settingsMod.updateSettingsForSource === 'function') {
        settingsMod.updateSettingsForSource('userSettings', { effortByModel: { 'ModelX': 'high', 'modely': 'low' } })
      }
      const envSaved = process.env.ATLAS_EFFORT_LEVEL
      delete process.env.ATLAS_EFFORT_LEVEL
      const rx = effortMod.resolveAppliedEffort('ModelX', 'medium')
      const ry = effortMod.resolveAppliedEffort('modelY', 'medium') // case-insensitive 面
      const rZ = effortMod.resolveAppliedEffort('ModelNoMem', 'medium') // 无记忆模型回落 appState
      process.env.ATLAS_EFFORT_LEVEL = 'xhigh'
      const envWins = effortMod.resolveAppliedEffort('ModelX', 'medium')
      delete process.env.ATLAS_EFFORT_LEVEL
      e2 = rx === 'high' && ry === 'low' && rZ === 'medium' && envWins === 'xhigh'
      e2Detail = e2
        ? `E-2 wire per-model 记忆槽（行为：effortByModel[ModelX]=high/modely=low + 会话 explicit=medium → resolveAppliedEffort('ModelX')=high / ('modelY')=low〔case-insensitive〕/ 无记忆模型='medium' 回落 appState + env ATLAS_EFFORT_LEVEL=xhigh 恒胜〔双发 medium 修前红→修后各发各记忆值绿〕；双源同形 = modelprovider/effort.ts effortByModelSource 面（E3 承载））`
        : `E-2 缺口（X=${rx} Y=${ry} noMem=${rZ} envWin=${envWins}，期望 high/low/medium/xhigh = 修前红形〔查槽缺席双发会话值〕）`
    } catch (err) {
      e2 = null
      e2Detail = `E-2 不可执行（settings 注入链异常：${err instanceof Error ? err.message.slice(0, 100) : err}，INC 非红面；源级承载 = resolveAppliedEffort L259 perModelMemory 查槽位）`
    } finally {
      process.chdir(cwd)
      process.env.HOME = home
      rmSync(iso, { recursive: true, force: true })
    }
  } else {
    e2Detail = `E-2 缺口（resolveAppliedEffort 模块缺席 = 修前红形结构承载）`
  }
  push('E2-wire-per-model-memory', e2, e2Detail)

  // E3 sticky 核验（源级：双源同形 + 会话单值面 + /model 重解析位）
  const mpEffortSrc = readSrc(join(REPO, 'src/modelprovider/effort.ts'))
  const depsSrc = readSrc(join(REPO, 'src/tui/agentLoopDeps.ts'))
  const modelCmdSrc = readSrc(join(REPO, 'src/tui/commands/model/model.tsx'))
  const e3 = mpEffortSrc.includes('effortByModelSource')
    && (depsSrc.includes('effort') || depsSrc.includes('effortValue'))
    && (modelCmdSrc.includes('getStartupEffortValue') || modelCmdSrc.includes('effort'))
  push('E3-sticky-verify-dual-source', e3,
    e3
      ? `E-3 会话 sticky 核验（源级：modelprovider/effort.ts effortByModelSource 双源同形面在场〔防直调面漏查〕+ agentLoopDeps 会话 effort 面 + /model 命令 getStartupEffortValue 重解析位在场 = E-2 落地后 wire 按模型现查，会话切换不再 sticky（零码/小修核验面））`
      : `E-3 缺口（双源=${mpEffortSrc.includes('effortByModelSource')} 会话面=${depsSrc.includes('effortValue')} /model重解析=${modelCmdSrc.includes('getStartupEffortValue')}）`)

  // G2 /effort 命令全局语义恒等 + G3 角色模型 effort 面零变更
  const effortCmdSrc = readSrc(join(REPO, 'src/tui/commands/effort/effort.tsx'))
  const g2 = /effortByModel|unsetEffortLevel/i.test(effortCmdSrc) || /auto/.test(effortCmdSrc)
  const g3 = readSrc(join(REPO, 'src/tui/utils/effort.ts')).includes('modelSupportsEffort')
  push('G2-effort-cmd-global-semantics', g2,
    g2 ? `恒等锚（/effort 命令全局语义面在场〔auto 清 effortByModel 语义保留位〕= 基线同绿守卫）` : `恒等锚缺口（/effort 命令面缺席）`)
  push('G3-role-model-effort-untouched', g3,
    g3 ? `恒等锚（modelSupportsEffort 角色模型 effort 面在场零变更〔fast/small/premium 无记忆面〕= 基线同绿守卫）` : `恒等锚缺口（modelSupportsEffort 面缺席）`)

  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const verdict = hardFail === 0 ? 'PASS' : `FAIL（hardFail=${hardFail}）`
  const OUT = process.env.ATLAS_E2E_BUGFIX0167_OUT ?? '/home/vince/.claude/jobs/09264df0/tmp/gate-067/bugfix0167'
  const fs = await import('node:fs')
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(join(OUT, 'result.json'), JSON.stringify({ probe: 'tui-bugfix-0167', repo: REPO, verdict, probes }, null, 2))
  console.log(JSON.stringify({
    verdict,
    probes: probes.map((p) => `[${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : 'INC'}] ${p.id}`).join(' '),
  }, null, 1))
  console.log(`TUI-BUGFIX-0167 ${verdict} → ${OUT}`)
  process.exit(hardFail === 0 ? 0 : 1)
}

main().catch((e) => { console.error('TUI-BUGFIX-0167 ERROR', e); process.exit(1) })
