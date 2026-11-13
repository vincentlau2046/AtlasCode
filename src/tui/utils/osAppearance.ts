/**
 * OS appearance detection (lock-face 0.1.102 P0 切片 1, 第四源).
 *
 * Reads the OS-level light/dark preference — NOT the terminal's actual
 * background color. Semantically weaker than OSC 11 (a dark terminal on a
 * light-mode OS misreads), which is why it sits below OSC 11 and COLORFGBG
 * in the priority chain: it is only consulted when both terminal-native
 * sources are unavailable (e.g. macOS Terminal.app sets neither).
 *
 * One-shot reads only — the watcher fires this once at startup and once as
 * the OSC-failure fallback (lock-face 触发点枚举恰二). Never polled.
 *
 * Failure semantics (lock-face 钉2): every failure mode — unsupported
 * platform, spawn error, timeout — resolves `undefined` (silent degrade to
 * the next source). This function never throws and never blocks startup.
 */

import type { SystemTheme } from './systemTheme.js'

/** Subprocess budget for `defaults read` / `reg query`. Kill + degrade on expiry. */
export const OS_APPEARANCE_READ_TIMEOUT_MS = 500

export const MACOS_DARK_STYLE_VALUE = 'Dark'
export const WIN_APPS_USE_LIGHT_THEME_REGKEY =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize'
export const WIN_APPS_USE_LIGHT_THEME_VALUE = 'AppsUseLightTheme'

type SpawnLike = typeof import('node:child_process').spawn

export type OsAppearanceDeps = {
  platform?: NodeJS.Platform
  spawn?: SpawnLike
}

/**
 * Read the OS appearance preference. Resolves `undefined` when no source
 * exists on this platform (Linux: no standardized API — deliberately no
 * xdg-desktop-portal dependency) or when the read fails/times out.
 *
 * macOS semantics nail (lock-face ②): `defaults read -g
 * AppleInterfaceStyle` exits 1 when the key is absent, and absence means
 * Light — a non-zero exit is the expected "light" answer, not an error.
 */
export async function readOsAppearance(deps: OsAppearanceDeps = {}): Promise<SystemTheme | undefined> {
  const platform = deps.platform ?? process.platform
  const spawn = deps.spawn ?? (require('node:child_process') as typeof import('node:child_process')).spawn
  try {
    if (platform === 'darwin') {
      // `defaults read -g AppleInterfaceStyle`: prints "Dark" (exit 0) on
      // dark mode; exits 1 (key absent) on light mode. Any other exit code
      // (e.g. defaults binary missing) = failed read, not a color verdict.
      const outcome = await run(spawn, 'defaults', ['read', '-g', 'AppleInterfaceStyle'])
      if (outcome === undefined) return undefined
      if (outcome.code === 0) {
        return outcome.stdout.trim() === MACOS_DARK_STYLE_VALUE ? 'dark' : 'light'
      }
      return outcome.code === 1 ? 'light' : undefined
    }
    if (platform === 'win32') {
      const outcome = await run(spawn, 'reg', [
        'query', WIN_APPS_USE_LIGHT_THEME_REGKEY,
        '/v', WIN_APPS_USE_LIGHT_THEME_VALUE,
      ])
      if (outcome === undefined || outcome.code !== 0) return undefined
      // REG_DWORD: 0x1 = light theme, 0x0 = dark theme.
      return /0x1\b/.test(outcome.stdout) ? 'light' : 'dark'
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * Run a short-lived subprocess and collect stdout + exit code. Resolves
 * `undefined` on any failure (non-spawnable, killed by timeout) — callers
 * degrade silently.
 */
function run(spawn: SpawnLike, cmd: string, args: string[]): Promise<{ stdout: string; code: number | null } | undefined> {
  return new Promise(resolve => {
    let settled = false
    const done = (v: { stdout: string; code: number | null } | undefined) => {
      if (!settled) { settled = true; resolve(v) }
    }
    try {
      const child = spawn(cmd, args, { timeout: OS_APPEARANCE_READ_TIMEOUT_MS })
      let stdout = ''
      child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
      child.on('error', () => done(undefined))
      // Bun quirk: a killed child fires 'exit' but never 'close' (stdio
      // end events don't arrive) — settle on whichever fires first.
      child.on('exit', code => done({ stdout, code }))
      child.on('close', code => done({ stdout, code }))
      // Self-managed kill budget: the spawn `timeout` option is not honored
      // on every runtime — the timer guarantees the budget regardless.
      const timer = setTimeout(() => {
        try { child.kill('SIGKILL') } catch {}
      }, OS_APPEARANCE_READ_TIMEOUT_MS)
      timer.unref?.()
    } catch {
      done(undefined)
    }
  })
}
