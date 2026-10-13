/**
 * 0.1.63 P8 — ProposeGoal 工具描述提示词（CC 2.1.227 全文移植 + 国产适配）。
 *
 * 国产适配裁剪面（工单 §0 细目 + eval 卡 §5）：
 *   - 上游 1P 引用裁除（无 claude.ai / Remote Control 等）
 *   - BR-8 标准：无字面 + 号
 *   - 模型族引用不出现
 *
 * 落码通道 = 0.1.55 提示词批先例（提示词文件 + 断言单测锁文本）。
 * 断言面 = engine-propose-goal.test.ts 工具描述断言（ask_user 双支 / 评估器
 * 仅对话验证 / ≤500 / one goal at a time / BR-8 无加号）。
 */
export const PROPOSE_GOAL_PROMPT = `Propose a goal condition that can be verified across multiple turns of conversation. The goal will be armed and the agent will continue working until an evaluator determines the condition has been met based solely on conversation evidence.

Parameters:
- condition (string, required): A single testable end-state condition, maximum 500 characters. The condition should describe a verifiable outcome, not a process.
- ask_user (boolean, default true): Whether to ask the user to approve the goal.

ask_user semantics:
- ask_user=true (default): Present the goal to the user for single-key approval. If the user approves, the goal is armed. If the user declines, no goal is armed and no notification is sent.
- ask_user=false: Arm the goal directly without asking. Use this ONLY when the user's own words explicitly stated the desired outcome and they want the agent to pursue it as a goal. Setting ask_user=false when the user did not explicitly request this outcome is a misuse of the tool.

Evaluator behavior: A separate evaluator checks whether the goal condition has been met based only on the conversation. It does not run commands, does not read files, and does not make assumptions beyond what is shown in the conversation.

One goal at a time: If a goal is already armed, proposing a new goal replaces the previous one (after approval if ask_user=true).

Use this tool when the user describes an outcome they want achieved that can be verified from the conversation, and that may require multiple turns of work.`
