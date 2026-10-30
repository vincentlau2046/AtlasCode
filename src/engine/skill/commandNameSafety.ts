/**
 * engine/skill — 命令/技能名消毒谓词（0.1.82 K3-C，上游 296）。
 *
 * skill/command 文件·目录名含隐藏·方向·空白字符或 `<>` 时该技能
 * **不再提供**（静默过滤裁定，工单 §101：不破交互流）：
 *   - 方向覆写（U+202A-202E / U+2066-2069 LRI…PDI）：视觉欺骗面
 *     （'bad<U+202E>' 在终端/列表里可伪装成别的名字）；
 *   - `<>`：名字会渲染进 skill 列表与提示词，尖括 = 提示/标签注入面；
 *   - 隐藏空白（零宽 U+200B-200F、NBSP、窄 NBSP、BOM、软连字符）：
 *     不可见字符可制造同名碰撞/绕过目检；
 *   - C0/C1 控制字符与行/段分隔符同理。
 *
 * ASCII 空格放行（既有带空格技能名零破坏；红例三族 = 方向/尖括/隐藏
 * 空白）。双体同步：TUI 域 src/tui/utils/commandNameSafety.ts（判别 =
 * wave0182-l20-name-sanitization.test.ts 两体同断言）。
 */

// C0 控制（含 DEL 起）、C1 控制 + NBSP、软连字符、默认可忽略族
// （CGJ U+034F / ALM U+061C / 叙利亚缩写标记 U+070F / 蒙古元音分隔符
// U+180E / 变体选择符 U+FE00-FE0F + 星面补充 U+E0100-E01EF）、Unicode
// 空白分隔（U+1680 / U+2000-200A / U+3000）+ 零宽族（U+200B-200F）、
// 行/段分隔符、方向覆写（U+202A-202E）、窄 NBSP、中数学空格、词连接符
// + 隔离区（U+2060-2069）、BOM。u 旗标 = 星面区间按码点匹配
// （2026-10-30 review 补强：默认可忽略 + 双向控制补面）。
import { logForDebugging } from '../../shared'

const UNSAFE_NAME_CHARS_RE =
  /[\u0000-\u001F\u007F-\u00A0\u00AD\u034F\u061C\u070F\u1680\u180E\u2000-\u200F\u2028\u2029\u202A-\u202E\u202F\u205F\u2060-\u2069\u3000\uFE00-\uFE0F\uFEFF\u{E0100}-\u{E01EF}]/u

/**
 * 命令/技能名是否含不安全字符（消费面 = 装载器名字→注册链的过滤门）。
 * 空名同样视为不安全。
 */
export function isUnsafeCommandName(name: string): boolean {
  if (name === '') return true
  if (name.includes('<') || name.includes('>')) return true
  return UNSAFE_NAME_CHARS_RE.test(name)
}

/**
 * frontmatter `name`（display-name 覆盖）消毒（2026-10-30 review 补强）：
 * 装载器门只校验目录/文件派生的规范名，frontmatter `name` 覆盖若不消毒，
 * 坏名经 userFacingName() 直达技能列表与提示词（SkillTool 未知技能名单
 * 消费同一面），绕过名字消毒。不安全覆盖弃用回落规范名（§101 静默过滤
 * 同款裁定）+ 调试日志。
 */
export function sanitizeDisplayName(
  displayName: string | undefined,
  canonicalName: string,
): string | undefined {
  if (displayName === undefined || !isUnsafeCommandName(displayName)) {
    return displayName
  }
  logForDebugging(
    `Discarding unsafe frontmatter display name ${JSON.stringify(displayName)} for ${canonicalName}; falling back to canonical name`,
  )
  return undefined
}
