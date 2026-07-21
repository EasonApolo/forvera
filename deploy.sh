#!/usr/bin/env bash
set -euo pipefail

# 部署脚本：通过 SSH 登录远端，更新代码后执行 start.sh。
# 默认连接：ssh -i ~/.ssh/tencent_cloud.pem root@43.154.64.94

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
KEY_PATH="${KEY_PATH:-$HOME/.ssh/tencent_cloud.pem}"
SSH_USER="${SSH_USER:-root}"
SSH_HOST="${SSH_HOST:-43.154.64.94}"
SSH_TARGET="${SSH_USER}@${SSH_HOST}"
REMOTE_DIR="${REMOTE_DIR:-/root/forvera}"
REMOTE_BRANCH="${REMOTE_BRANCH:-master}"

if [[ ! -f "$KEY_PATH" ]]; then
  echo "Error: SSH key not found: $KEY_PATH"
  exit 1
fi

echo "[1/2] Updating remote code on $SSH_TARGET:$REMOTE_DIR ..."
REMOTE_DIR_Q=$(printf '%q' "$REMOTE_DIR")
REMOTE_BRANCH_Q=$(printf '%q' "$REMOTE_BRANCH")

ssh -i "$KEY_PATH" -o IdentitiesOnly=yes "$SSH_TARGET" "REMOTE_DIR=$REMOTE_DIR_Q REMOTE_BRANCH=$REMOTE_BRANCH_Q bash -s" <<'EOF'
set -euo pipefail

cd "$REMOTE_DIR"

current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "$REMOTE_BRANCH")"
if [[ "$current_branch" == "HEAD" || -z "$current_branch" ]]; then
  current_branch="$REMOTE_BRANCH"
fi

git fetch origin
git reset --hard "origin/$current_branch"
git clean -fd

echo "updated to $(git rev-parse --short HEAD) on branch $current_branch"
EOF

echo "[2/2] Starting remote service ..."
ssh -i "$KEY_PATH" -o IdentitiesOnly=yes "$SSH_TARGET" "bash -lc 'cd /root/forvera && bash ./start.sh'"

echo "Deployment complete"