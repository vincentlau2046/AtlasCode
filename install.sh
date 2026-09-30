#!/usr/bin/env bash
# AtlasCode 一键安装（R0 发布工具链 #177，roadmap §4 R0 并行带）
#
# 两种安装通道（命令名均为 `atlas`）：
#   ① npm 一行（推荐，仅需 node，无需 bun/git 源码构建）：
#        npm install -g @atlasharness/atlascode
#   ② git 源码（本脚本）：git clone → bun install → bun run build → link ~/.atlas/bin/atlas
#      （构建需 bun，运行时需 node；远端升级跑 `atlas update` = git pull --ff-only +
#       bun install + build，原地重建符号链接即刻生效）。
# 本地 dev loop：见 docs/dev-loop.md（clone 改码 → build → 即刻生效）。
#
# 用法：
#   ./install.sh [repo-url]
#   ATLAS_REPO=<url> ./install.sh
#
# 可覆盖 env：ATLAS_INSTALL_ROOT（默认 ~/.atlas/atlascode）/
#   ATLAS_BIN_DIR（默认 ~/.atlas/bin）/ ATLAS_BIN_NAME（默认 atlas）。
#
# ⚠️ P-1 占位：GitHub 发布仓 `vincentlau2046/AtlasCode` 尚未 push（P-1 未解除），
#    缺省 REPO 为预期地址——远端未建前安装请显式传参（本地仓路径或 ATLAS_REPO）。
set -euo pipefail

REPO="${1:-${ATLAS_REPO:-https://github.com/vincentlau2046/AtlasCode}}"
INSTALL_ROOT="${ATLAS_INSTALL_ROOT:-$HOME/.atlas/atlascode}"
BIN_DIR="${ATLAS_BIN_DIR:-$HOME/.atlas/bin}"
BIN_NAME="${ATLAS_BIN_NAME:-atlas}"

if ! command -v git >/dev/null 2>&1; then
  echo "install: 未找到 git。" >&2
  exit 1
fi
if ! command -v bun >/dev/null 2>&1; then
  echo "install: 未找到 bun（源码构建必需）。安装：curl -fsSL https://bun.sh/install | bash" >&2
  echo "install: （若仅需运行而无需源码构建，走 npm 通道：npm install -g @atlasharness/atlascode）" >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "install: 未找到 node（运行器，dist/cli.js 以 node 运行）。安装：https://nodejs.org（需 >= 20）" >&2
  exit 1
fi

if [ -d "$INSTALL_ROOT/.git" ]; then
  echo "install: $INSTALL_ROOT 已存在 → git pull --ff-only 更新"
  git -C "$INSTALL_ROOT" pull --ff-only
else
  echo "install: git clone $REPO → $INSTALL_ROOT"
  git clone --depth 1 "$REPO" "$INSTALL_ROOT"
fi

echo "install: bun install + build"
(cd "$INSTALL_ROOT" && bun install && bun run build)
chmod +x "$INSTALL_ROOT/dist/cli.js"

mkdir -p "$BIN_DIR"
ln -sf "$INSTALL_ROOT/dist/cli.js" "$BIN_DIR/$BIN_NAME"

echo "install: 完成 — $BIN_DIR/$BIN_NAME → $INSTALL_ROOT/dist/cli.js"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "install: 提示：$BIN_DIR 不在 PATH，请 export PATH=\"$BIN_DIR:\$PATH\"" ;;
esac
"$BIN_DIR/$BIN_NAME" --help >/dev/null 2>&1 && echo "install: 冒烟通过（$BIN_NAME --help OK）"
