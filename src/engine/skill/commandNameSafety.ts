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

// C0 控制（含 DEL 起）、C1 控制 + NBSP、软连字符、Unicode 空白分隔
// （U+2000-200A）+ 零宽族（U+200B-200F）、行/段分隔符、方向覆写
// （U+202A-202E）、窄 NBSP、中数学空格、词连接符 + 隔离区
// （U+2060-2069）、BOM。
const UNSAFE_NAME_CHARS_RE =
  /[\u0000-\u001F\u007F-\u00A0\u00AD\u2000-\u200F\u2028\u2029\u202A-\u202E\u202F\u205F\u2060-\u2069\uFEFF]/

/**
 * 命令/技能名是否含不安全字符（消费面 = 装载器名字→注册链的过滤门）。
 * 空名同样视为不安全。
 */
export function isUnsafeCommandName(name: string): boolean {
  if (name === '') return true
  if (name.includes('<') || name.includes('>')) return true
  return UNSAFE_NAME_CHARS_RE.test(name)
}
