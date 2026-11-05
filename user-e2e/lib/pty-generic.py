#!/usr/bin/env python3
"""
user-e2e 通用 PTY 驱动（对比用）：可启动任意命令（Atlas TUI / claude CLI / 其它），
在指定 workspace 内跑，master 输出全量落 logfile（含 ANSI），node 侧 stdin pipe 注入。

与 pty-driver.py 的区别：不硬编码 Atlas CLI 命令，命令由 env `PTY_CMD`（shell 字符串）
+ env `PTY_ENV`（JSON 对象，追加/覆盖子进程 env）驱动，便于对同一 harness 跑多个 TUI。

用法：pty-generic.py <logfile> <workspace>
  env: PTY_CMD="bun run /repo/src/atlascode/cli.ts code --dangerously-skip-permissions"
       PTY_CMD="claude --dangerously-skip-permissions"
       PTY_ENV='{"ATLAS_CONFIG_DIR":"/x/.atlas"}'  (可选，JSON)
HOME 由 node 侧注入（沙箱隔离）。
"""
import fcntl
import json
import os
import pty
import select
import shlex
import signal
import struct
import sys
import termios

COLS = int(os.environ.get("ATLAS_E2E_COLS", "200"))
ROWS = int(os.environ.get("ATLAS_E2E_ROWS", "50"))


def _kill_group() -> None:
    pid = int(os.environ.get("_PTY_CHILD_PID", "0") or 0)
    if not pid:
        return
    try:
        os.killpg(os.getpgid(pid), signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError):
        pass


def main() -> int:
    log_path, workspace = sys.argv[1], sys.argv[2]
    cmd = os.environ.get("PTY_CMD", "").strip()
    if not cmd:
        os.write(2, b"pty-generic: PTY_CMD env not set\n")
        return 2
    extra_env = {}
    env_json = os.environ.get("PTY_ENV", "").strip()
    if env_json:
        try:
            extra_env = json.loads(env_json)
        except Exception:
            extra_env = {}
    unset_keys = []
    unset_json = os.environ.get("PTY_UNSET", "").strip()
    if unset_json:
        try:
            unset_keys = json.loads(unset_json)
        except Exception:
            unset_keys = []

    logf = open(log_path, "ab", buffering=0)
    pid, master = pty.fork()
    if pid == 0:
        # 子进程：pty slave 为控制终端，workspace 为 cwd
        try:
            fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", ROWS, COLS, 0, 0))
            os.chdir(workspace)
            os.environ["COLUMNS"] = str(COLS)
            os.environ["LINES"] = str(ROWS)
            for k, v in extra_env.items():
                os.environ[k] = str(v)
            for k in unset_keys:
                os.environ.pop(k, None)
            argv = shlex.split(cmd)
            os.execvpe(argv[0], argv, os.environ)
        except Exception as e:  # noqa: BLE001
            os.write(2, f"pty-generic child exec failed: {e}\n".encode())
            os._exit(127)
    # 记录 child pid 供 finally 清理
    try:
        os.environ["_PTY_CHILD_PID"] = str(pid)
    except Exception:
        pass
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
                    break
                os.write(master, data)
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
