/**
 * Spinner 动画时钟常量（W-AB4b 0.1.113 候 切片 2 = 面 2 动画降频，
 * f4 lock-face 批复 2026-11-14 @7d9cbea3，N=100ms 用户 UX 裁定）。
 *
 * 节律 wire 定谳（呈批书 §0）：SpinnerAnimationRow useAnimationFrame(50) →
 * setState(time) → 全树 React 重渲染 → 16ms 节流收敛 = 63-64ms 恒节律
 * （15.6fps，与数据变更无关）；0-patch 空帧 26-47% 即此 tick 驱动。
 *
 * 降频 50→100ms（15.6→10fps）收益：committed 帧数线性直减 ≈ -40%；真变更
 * 帧不再被恒节律空转帧淹没；pty spinner 行 erase+rewrite 噪声同步拉长。
 * 数据即提交维持既有 16ms leading-edge 结构（零新机制）——延迟叙事口径
 * 「维持 ≤16ms leading-edge」，禁虚增。
 *
 * 共享源连带：该 time 为 SpinnerAnimationRow 动画与 thinking shimmer 共享
 * 源（SpinnerAnimationRow.tsx「Same sine-wave opacity, but derived from our
 * shared `time`」注），降频同源影响两观感面（呈批如实列，e2e pty 目验腿）。
 * 消费面 = SpinnerAnimationRow.tsx 单点；TextInput 光标闪烁 / VoiceIndicator
 * / ShimmeredInput / useBlink / Spinner.tsx 动词轮（120ms）不在本裁定范围，
 * 维持原值。
 */
export const SPINNER_ANIMATION_INTERVAL_MS = 100
