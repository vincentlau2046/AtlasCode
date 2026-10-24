/**
 * /cd 命令本体（0.1.60 TUI-2，CC 2.1.169）。
 *
 * 无参 = 状态面（报当前 session cwd + 用法，不改状态）；带 path = 经
 * Shell.setCwd(path, pwd()) 解析（相对路径按当前 session cwd 解析 + realpath 物理
 * 路径）后 setCwdState —— **状态面移动，不做 process.chdir**，故 process.cwd()
 * 恒定、SkillTool 的 getCommands(process.cwd()) memo 键与系统提示缓存键前缀稳定
 * （不破 prompt 缓存）。非法/不存在路径 = Shell.setCwd 抛 "Path ... does not
 * exist"，捕获后回报。
 *
 * 0.1.81 V3-2 K2 #15：成功 cd 后 bump AppState.mcp.cwdReconnectKey ——
 * useManageMCPConnections 两 effect 把它列为 dep，重跑后旧目录 .mcp.json
 * server 断开（absentIsStale wide rule）、新目录 server 启动。key bump 只
 * 触发 MCP effect 重跑，不做 process.chdir，不破上方 prompt 缓存裁定。
 */
import type { LocalCommandCall } from '../../types/command.js'
import { pwd } from '../../utils/cwd.js'
import { setCwd } from '../../utils/Shell.js'

const USAGE = 'Usage: /cd [path] (no argument = show current session cwd)'

export const call: LocalCommandCall = async (_args, context) => {
  const arg = (_args ?? '').trim()

  if (arg === '') {
    return {
      type: 'text',
      value: `Session working directory: ${pwd()}\n${USAGE}`,
    }
  }

  try {
    // 状态面移动（setCwdState），不做 process.chdir → prompt 缓存键前缀稳定。
    setCwd(arg, pwd())
    // K2 #15：bump cwdReconnectKey 触发 MCP 连接面收敛到新目录（见头注）。
    context.setAppState(prev => ({
      ...prev,
      mcp: { ...prev.mcp, cwdReconnectKey: prev.mcp.cwdReconnectKey + 1 },
    }))
    return {
      type: 'text',
      value: `Session working directory changed to: ${pwd()}`,
    }
  } catch (e) {
    return {
      type: 'text',
      value: `cd failed: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}
