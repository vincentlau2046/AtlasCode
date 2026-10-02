/**
 * S2（感知面反馈波）：thinking 折叠支一句话预览提取（纯函数，React-free，
 * 判别单测可零渲染直测）。
 *
 * 背景：AssistantThinkingMessage 折叠支（默认屏，非 verbose / 非转录模式）
 * 此前只输出静态 "∴ Thinking <CtrlOToExpand>" 标记，thinking 内容 0 字——
 * 用户回看屏幕看不到模型在想什么。修 = 折叠支在 label 后渲染首个非空行
 * （trim 后 80 字截断 + 省略号），dim italic，保留 CtrlOToExpand 展开提示。
 *
 * 提取语义：
 *   - 取第一个非空行（各行 trim 后 find(Boolean)——thinking 常以空行/缩进开头）；
 *   - 超 maxLen 截断并补 '…'；
 *   - 全空白 thinking（组件层 !thinking 已挡真空，此处兜底纯空白）→ ''
 *     （调用方据此回落原 label 渲染，不输出空预览行）。
 */
export function thinkingFirstLinePreview(thinking: string, maxLen = 80): string {
  const line = thinking
    .split('\n')
    .map(s => s.trim())
    .find(Boolean)
  if (!line) return ''
  return line.length > maxLen ? line.slice(0, maxLen) + '…' : line
}
