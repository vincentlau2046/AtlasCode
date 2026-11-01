/**
 * engine/tools — 安全 tool-results 输出根（0.1.84 K5-6 安全复审硬化）。
 *
 * 背景（安全复审 MEDIUM「Insecure temporary-directory handling」）：
 * getAtlasTempDir() 的根（/tmp 或 ATLAS_TMPDIR）是共享可写区，靠
 * first-wins 预占 `.atlas-<uid>` 名。若该名被他人预先以 symlink 或他人
 * 属主目录占据，旧的 recursive mkdir 会静默穿透写入（symlink 重定向）
 * 或写进他人可读目录 —— PDF 渲染页等敏感产物因此泄露。
 *
 * 硬化语义（fail-closed；v1 + 复审第二轮 v2）：
 *  - 根缺失 → 以 0700 单层原子创建（mkdir 非递归，mode 经 umask 掩码
 *    但 0700 语义下他人不可进入；竞争窗口内他人抢先创建则 EEXIST 走
 *    验证支拒绝，不静默复用）。
 *  - 根已存在 → lstat 验证：真目录（拒绝 symlink；POSIX lstat("link/")
 *    会解析 symlink，故先剥尾分隔符）+ POSIX 属主 = 当前 UID（他人
 *    属主一律拒绝，即使 mode 看似无害）+ 显式 chmod 收紧 0700
 *    （v2：旧版 recursive mkdir + umask 022 遗留 0755 的升级机普遍
 *    存在，mkdir mode 选项不修复既有目录）。
 *  - tool-results 子目录 → 同验证同收紧（v2：recursive mkdir 对既有
 *    symlink-to-dir 静默 no-op 是穿透洞，改单层 mkdir EEXIST → lstat
 *    验证 + chmod 0700）。
 *  - 调用方输出叶（如 pdf 的 pdf-XXXX）用 mkdtemp（恒 0700，不受
 *    umask 影响）；persistBinaryContent 文件 0600（webFetchUtils）。
 *  - 验证失败 → 明确抛错（上游转结构化失败），绝不静默穿透。
 *  - 信任边界登记：同一 UID 的恶意进程不在防护面（同 UID = 同信任域，
 *    文件级 symlink 跟随不设防——目标文件名 persistId 为调用方生成
 *    非外部输入，且位于 0700 本 UID 目录内）；防的是共享区其他 UID
 *    的预占/窥读。
 *
 * 消费方：files/pdf.ts（extractPDFPages 输出叶）、web/webFetchUtils.ts
 * （persistBinaryContent，同根因第二站点，0.1.84 一并修）。
 * TUI 面（tui/utils/toolResultStorage.ts）锚定 session 目录非共享 /tmp，
 * 不经此 helper（TUI 面基线绿已登记）。
 */
import { chmod, lstat, mkdir } from 'fs/promises'
import { join } from 'path'
import { getAtlasTempDir } from '../../permissions'

const TOOL_RESULTS_SUBDIR = 'tool-results'

/**
 * Strip trailing path separators so `lstat` sees the link itself, not its
 * target — POSIX `lstat("link/")` resolves the symlink, which would defeat
 * the symlink rejection below.
 */
function stripTrailingSep(p: string): string {
  const stripped = p.replace(/[\\/]+$/, '')
  return stripped === '' ? p : stripped
}

/**
 * lstat 验证一个已存在的目录：真目录（拒绝 symlink——stripTrailingSep
 * 保证 lstat 不被尾分隔符解析）+ POSIX 属主 = 当前 UID（Windows 无
 * POSIX uid，getuid 不存在时跳过属主支，per-user %TEMP%）。
 */
async function validateOwnedRealDir(p: string, what: string): Promise<void> {
  const st = await lstat(p)
  if (!st.isDirectory()) {
    throw new Error(`Unsafe ${what} (not a real directory): ${p}`)
  }
  if (typeof process.getuid === 'function' && st.uid !== process.getuid()) {
    throw new Error(
      `Unsafe ${what} (owned by uid ${st.uid}, expected ${process.getuid()}): ${p}`,
    )
  }
}

/**
 * Return the tool-results directory under the verified atlas temp root,
 * creating it (0700) if needed. Throws on an unsafe pre-occupied root
 * (symlink / non-directory / foreign owner) instead of writing through it;
 * existing owned directories are tightened to 0700 (mkdir mode never
 * repairs an existing directory).
 */
export async function getSecureToolResultsDir(): Promise<string> {
  const root = stripTrailingSep(getAtlasTempDir())
  try {
    // 单层原子 mkdir：只在根确实缺失时创建（0700）；若已存在则 EEXIST
    // 走下方验证支 —— 绝不 recursive 静默复用他人预占的路径。
    await mkdir(root, { mode: 0o700 })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
    await validateOwnedRealDir(root, 'atlas temp root')
    // v2 收紧：旧版遗留 0755 等宽松 mode 显式 chmod 0700（fail-closed：
    // chmod 失败抛错，不带着宽松权限继续写）
    await chmod(root, 0o700)
  }
  const toolResults = join(root, TOOL_RESULTS_SUBDIR)
  try {
    // v2：单层 mkdir（非 recursive）——recursive 对既有 symlink-to-dir
    // 静默 no-op 会穿透；单层 EEXIST 走验证支拒绝
    await mkdir(toolResults, { mode: 0o700 })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
    await validateOwnedRealDir(toolResults, 'tool-results directory')
    await chmod(toolResults, 0o700)
  }
  return toolResults
}
