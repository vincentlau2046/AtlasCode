#!/usr/bin/env bash
# Atlas 站点一键更新脚本
# 用法: ./deploy.sh            （默认 root@47.104.200.186）
#       ./deploy.sh user@host
set -euo pipefail

SERVER="${1:-root@47.104.200.186}"
SRC="$(cd "$(dirname "$0")" && pwd)"

echo "→ 上传站点文件到 ${SERVER}:/var/www/atlas ..."
rsync -avz --delete --chmod=Dgo+rX,Fgo+r \
  --exclude 'deploy.sh' \
  --exclude 'nginx/' \
  --exclude 'DEPLOY-GUIDE.md' \
  "$SRC/" "$SERVER:/var/www/atlas/"

echo "→ 修权限 + 重载 Nginx ..."
ssh "$SERVER" 'chmod a+rx /var/www 2>/dev/null; nginx -t && systemctl reload nginx'

echo "✅ 部署完成 → http://47.104.200.186 （备案通过后：https://atlaswork.cn）"
