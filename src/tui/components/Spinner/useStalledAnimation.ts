import { useRef } from 'react'
import { computeStallState } from './spinnerGates.js'

// Hook to handle the transition to red when tokens stop flowing.
// Driven by the parent's animation clock time instead of independent intervals,
// so it slows down when the terminal is blurred.
export function useStalledAnimation(
  time: number,
  currentResponseLength: number,
  hasActiveTools = false,
  reducedMotion = false,
): {
  isStalled: boolean
  stalledIntensity: number
} {
  const lastTokenTime = useRef(time)
  const lastResponseLength = useRef(currentResponseLength)
  const mountTime = useRef(time)
  const stalledIntensityRef = useRef(0)
  const lastSmoothTime = useRef(time)

  // Reset timer when new tokens arrive (check actual length change)
  if (currentResponseLength > lastResponseLength.current) {
    lastTokenTime.current = time
    lastResponseLength.current = currentResponseLength
    stalledIntensityRef.current = 0
    lastSmoothTime.current = time
  }

  // Derive time since last token from animation clock
  let timeSinceLastToken: number
  if (hasActiveTools) {
    timeSinceLastToken = 0
    lastTokenTime.current = time
  } else if (currentResponseLength > 0) {
    timeSinceLastToken = time - lastTokenTime.current
  } else {
    timeSinceLastToken = time - mountTime.current
  }

  // 0.1.64 G2：stall 检测委托纯函数 computeStallState（spinnerGates.ts）。
  // 增 currentResponseLength > 0 守卫——TTFT 期间（首 token 前）不报 stall，
  // 仅「已开始流式后中断 > 3s」触发（原语义保留）。
  const { isStalled, stalledIntensity: intensity } = computeStallState({
    timeSinceLastToken,
    currentResponseLength,
    hasActiveTools,
  })

  // Smooth intensity transition driven by animation frame ticks
  if (!reducedMotion && (intensity > 0 || stalledIntensityRef.current > 0)) {
    const dt = time - lastSmoothTime.current
    if (dt >= 50) {
      const steps = Math.floor(dt / 50)
      let current = stalledIntensityRef.current
      for (let i = 0; i < steps; i++) {
        const diff = intensity - current
        if (Math.abs(diff) < 0.01) {
          current = intensity
          break
        }
        current += diff * 0.1
      }
      stalledIntensityRef.current = current
      lastSmoothTime.current = time
    }
  } else {
    stalledIntensityRef.current = intensity
    lastSmoothTime.current = time
  }

  // When reducedMotion is enabled, use instant intensity change
  const effectiveIntensity = reducedMotion
    ? intensity
    : stalledIntensityRef.current

  return { isStalled, stalledIntensity: effectiveIntensity }
}
