import { homedir } from 'os'
import { resolve } from 'path'
import { getErrnoCode } from '../errors.js'
import { getFsImplementation } from '../fsOperations.js'
import type { MarketplaceSource } from './schemas.js'

/**
 * Git hosts recognized from bare (no .git-suffix) HTTPS URLs. These hosts
 * serve git repos at https://<host>/<org>/<repo> — routing them to the git
 * source (clone) instead of the url source (fetch-as-JSON) is what fixes
 * the "bare gitcode URL fetched the HTML page, schema failed" bug.
 *
 * Conservative by design: only well-known git hosts are whitelisted, so a
 * two-segment JSON endpoint on an unknown host still routes to the url
 * source. Self-hosted GitLab instances (*.gitlab.io) match by suffix.
 */
const KNOWN_GIT_HOSTS = [
  'gitcode.com',
  'gitee.com',
  'gitlab.com',
  'bitbucket.org',
  'codeup.aliyun.com',
]

function matchKnownGitHost(hostname: string): string | null {
  const host = hostname.toLowerCase()
  for (const known of KNOWN_GIT_HOSTS) {
    if (host === known || host.endsWith(`.${known}`)) {
      return host
    }
  }
  // Self-hosted GitLab: *.gitlab.io
  if (host.endsWith('.gitlab.io')) {
    return host
  }
  return null
}

/**
 * Parses a marketplace input string and returns the appropriate marketplace source type.
 * Handles various input formats:
 * - Git SSH URLs (user@host:path or user@host:path.git)
 *   - Standard: git@github.com:owner/repo.git
 *   - GitHub Enterprise SSH certificates: org-123456@github.com:owner/repo.git
 *   - Custom usernames: deploy@gitlab.com:group/project.git
 *   - Self-hosted: user@192.168.10.123:path/to/repo
 * - HTTP/HTTPS URLs (bare URLs on known git hosts route to the git source)
 * - Git host shorthand (host:owner/repo, e.g. gitcode.com:Ascend/agent-skills)
 * - GitHub shorthand (owner/repo — or ATLAS_DEFAULT_GIT_HOST's repos when set)
 * - Local file paths (.json files)
 * - Local directory paths
 *
 * @param input The marketplace source input string
 * @returns MarketplaceSource object, error object, or null if format is unrecognized
 */
export async function parseMarketplaceInput(
  input: string,
): Promise<MarketplaceSource | { error: string } | null> {
  const trimmed = input.trim()
  const fs = getFsImplementation()

  // Handle git SSH URLs with any valid username (not just 'git')
  // Supports: user@host:path, user@host:path.git, and with #ref suffix
  // Username can contain: alphanumeric, dots, underscores, hyphens
  const sshMatch = trimmed.match(
    /^([a-zA-Z0-9._-]+@[^:]+:.+?(?:\.git)?)(#(.+))?$/,
  )
  if (sshMatch?.[1]) {
    const url = sshMatch[1]
    const ref = sshMatch[3]
    return ref ? { source: 'git', url, ref } : { source: 'git', url }
  }

  // Handle URLs
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    // Extract fragment (ref) from URL if present
    const fragmentMatch = trimmed.match(/^([^#]+)(#(.+))?$/)
    const urlWithoutFragment = fragmentMatch?.[1] || trimmed
    const ref = fragmentMatch?.[3]

    // When user explicitly provides an HTTPS/HTTP URL that looks like a git
    // repo, use the git source type so we clone rather than fetch-as-JSON.
    // The .git suffix is a GitHub/GitLab/Bitbucket convention. Azure DevOps
    // uses /_git/ in the path with NO suffix (appending .git breaks ADO:
    // TF401019 "repo does not exist"). Without this check, an ADO URL falls
    // through to source:'url' below, which tries to fetch it as a raw
    // marketplace.json — the HTML response parses as "expected object,
    // received string". (gh-31256 / CC-299)
    if (
      urlWithoutFragment.endsWith('.git') ||
      urlWithoutFragment.includes('/_git/')
    ) {
      return ref
        ? { source: 'git', url: urlWithoutFragment, ref }
        : { source: 'git', url: urlWithoutFragment }
    }
    // Parse URL to check hostname
    let url: URL
    try {
      url = new URL(urlWithoutFragment)
    } catch (_err) {
      // Not a valid URL for parsing, treat as generic URL
      // new URL() throws TypeError for invalid URLs
      return { source: 'url', url: urlWithoutFragment }
    }

    if (url.hostname === 'github.com' || url.hostname === 'www.github.com') {
      const match = url.pathname.match(/^\/([^/]+\/[^/]+?)(\/|\.git|$)/)
      if (match?.[1]) {
        // User explicitly provided HTTPS URL - keep it as HTTPS via 'git' type
        // Add .git suffix if not present for proper git clone
        const gitUrl = urlWithoutFragment.endsWith('.git')
          ? urlWithoutFragment
          : `${urlWithoutFragment}.git`
        return ref
          ? { source: 'git', url: gitUrl, ref }
          : { source: 'git', url: gitUrl }
      }
    }

    // Bare URL (no .git suffix) on a known git host: route to the git source
    // so we clone instead of fetching the repo's HTML/JSON page as
    // marketplace.json (the fetch would fail the marketplace schema).
    // Azure-DevOps-style /_git/ URLs already matched above (no suffix).
    const knownHost = matchKnownGitHost(url.hostname)
    if (knownHost && !urlWithoutFragment.includes('/_git/')) {
      const gitUrl = urlWithoutFragment.endsWith('.git')
        ? urlWithoutFragment
        : `${urlWithoutFragment}.git`
      return ref
        ? { source: 'git', url: gitUrl, ref }
        : { source: 'git', url: gitUrl }
    }

    return { source: 'url', url: urlWithoutFragment }
  }

  // Handle local paths
  // On Windows, also recognize backslash-relative (.\, ..\) and drive letter paths (C:\)
  // These are Windows-only because backslashes are valid filename chars on Unix
  const isWindows = process.platform === 'win32'
  const isWindowsPath =
    isWindows &&
    (trimmed.startsWith('.\\') ||
      trimmed.startsWith('..\\') ||
      /^[a-zA-Z]:[/\\]/.test(trimmed))
  if (
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('~') ||
    isWindowsPath
  ) {
    const resolvedPath = resolve(
      trimmed.startsWith('~') ? trimmed.replace(/^~/, homedir()) : trimmed,
    )

    // Stat the path to determine if it's a file or directory. Swallow all stat
    // errors (ENOENT, EACCES, EPERM, etc.) and return an error result instead
    // of throwing — matches the old existsSync behavior which never threw.
    let stats
    try {
      stats = await fs.stat(resolvedPath)
    } catch (e: unknown) {
      const code = getErrnoCode(e)
      return {
        error:
          code === 'ENOENT'
            ? `Path does not exist: ${resolvedPath}`
            : `Cannot access path: ${resolvedPath} (${code ?? e})`,
      }
    }

    if (stats.isFile()) {
      if (resolvedPath.endsWith('.json')) {
        return { source: 'file', path: resolvedPath }
      } else {
        return {
          error: `File path must point to a .json file (marketplace.json), but got: ${resolvedPath}`,
        }
      }
    } else if (stats.isDirectory()) {
      return { source: 'directory', path: resolvedPath }
    } else {
      return {
        error: `Path is neither a file nor a directory: ${resolvedPath}`,
      }
    }
  }

  // Handle git host shorthand: host:owner/repo (e.g. gitcode.com:Ascend/agent-skills,
  // gitcode.com:Ascend/agent-skills#main). Must be checked before the bare
  // owner/repo branch below, which assumes github.com. The host part is the
  // prefix before the first ':'; the repo part must contain a '/' so plain
  // "host:x" strings don't get misparsed.
  const hostShorthandMatch = trimmed.match(
    /^([a-z0-9.-]+):([^:/#@]+(?:\/[^:/#@]+)*)(?:[#@](.+))?$/i,
  )
  if (hostShorthandMatch && hostShorthandMatch[2].includes('/')) {
    const host = hostShorthandMatch[1]
    const repo = hostShorthandMatch[2]
    const ref = hostShorthandMatch[3]
    return ref
      ? { source: 'git', repo, host, ref }
      : { source: 'git', repo, host }
  }

  // Handle GitHub shorthand (owner/repo, owner/repo#ref, or owner/repo@ref)
  // Accept both # and @ as ref separators — the display formatter uses @, so users
  // naturally type @ when copying from error messages or managed settings.
  if (trimmed.includes('/') && !trimmed.startsWith('@')) {
    if (trimmed.includes(':')) {
      return null
    }
    // Extract ref if present (either #ref or @ref)
    const fragmentMatch = trimmed.match(/^([^#@]+)(?:[#@](.+))?$/)
    const repo = fragmentMatch?.[1] || trimmed
    const ref = fragmentMatch?.[2]
    // Bare owner/repo targets ATLAS_DEFAULT_GIT_HOST when that env var is
    // set (e.g. a gitcode-first deployment), github.com otherwise.
    const defaultHost = process.env.ATLAS_DEFAULT_GIT_HOST
    if (defaultHost) {
      return ref
        ? { source: 'git', repo, host: defaultHost, ref }
        : { source: 'git', repo, host: defaultHost }
    }
    // Assume it's a GitHub repo
    return ref ? { source: 'github', repo, ref } : { source: 'github', repo }
  }

  // NPM packages not yet implemented
  // Returning null for unrecognized input

  return null
}
