#!/usr/bin/env python3
"""
user-e2e PTY 驱动（python stdlib pty）——替代 util-linux `script`：
script 在 stdin 非 TTY 时不写 typescript 文件（实测 0 字节），
本驱动自管 pty（pty.fork）：master 输出 → logfile（全量原样，含 ANSI），
node 侧 stdin pipe → pty（输入面）。子进程在独立 session（setsid），
退出/被杀时 os.killpg 全组回收（TUI 进程树无孤儿）。

用法：pty-driver.py <logfile> <workspace> <repoRoot>
env 由 node 侧注入（HOME=沙箱、IS_DEMO=1 等）。
"""
import fcntl
import os
import pty
import select
import signal
import struct
import sys
import termios

COLS, ROWS = 200, 50


CHILD = 0


def _kill_group() -> None:
    global CHILD
    if not CHILD:
        return
    try:
        os.killpg(os.getpgid(CHILD), signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError):
        pass


def main() -> int:
    global CHILD
    log_path, workspace, repo_root = sys.argv[1], sys.argv[2], sys.argv[3]
    logf = open(log_path, "ab", buffering=0)
    pid, master = pty.fork()
    CHILD = pid
    signal.signal(signal.SIGTERM, lambda *_: (_kill_group(), os._exit(0)))
    if pid == 0:
        # 子进程：pty slave 为控制终端，workspace 为 TUI 项目目录
        try:
            fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", ROWS, COLS, 0, 0))
            os.chdir(workspace)
            os.environ["COLUMNS"] = str(COLS)
            os.environ["LINES"] = str(ROWS)
            # TUI 从 repo 根解析模块（tsconfig paths / node_modules 按文件位置解析），
            # 进程 cwd = workspace（项目级隔离）
            # 附加 CLI 参数面（env 驱动，默认空）：定向复现用
            # （如 --dangerously-skip-permissions 自动放行权限 dialog，
            # 避免 loop 停在权限等待被误判为「挂起/无响应」）
            extra = os.environ.get("ATLAS_E2E_TUI_ARGS", "").split()
            os.execvp(
                "bun",
                ["bun", "run", os.path.join(repo_root, "src/atlascode/cli.ts")]
                + extra,
            )
        except Exception as e:  # noqa: BLE001
            os.write(2, f"pty-driver child exec failed: {e}\n".encode())
            os._exit(127)
    # 父进程泵：master → logfile；node stdin → master
    stdin_fd = sys.stdin.fileno()
    try:
        while True:
            try:
                r, _, _ = select.select([master, stdin_fd], [], [], 0.2)
            except (OSError, ValueError):
                break
            if master in r:
                try:
                    data = os.read(master, 65536)
                except OSError:
                    break
                if not data:
                    break
                logf.write(data)
            if stdin_fd in r:
                try:
                    data = os.read(stdin_fd, 65536)
                except OSError:
                    data = b""
                if not data:
                    # node 关 stdin = 会话结束
                    break
                os.write(master, data)
            # 子进程已退出则收尸
            done, status = os.waitpid(pid, os.WNOHANG)
            if done:
                break
    finally:
        _kill_group()
        try:
            logf.close()
        except OSError:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
