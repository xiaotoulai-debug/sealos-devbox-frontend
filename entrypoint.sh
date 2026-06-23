#!/bin/bash
# DEVBOX 静态测试入口：默认使用 development 模式构建（连接 iedyctheixcf 后端）
# 生产发布：bash entrypoint.sh production（使用 .env.production → iipvqahffegy）
set -e

MODE="${1:-devbox}"

if [ "$MODE" = "production" ]; then
  echo "[entrypoint] 生产模式：npm run build:production（.env.production）"
  npm run build:production
else
  echo "[entrypoint] DEVBOX 测试模式：npm run build:devbox（.env.development）"
  npm run build:devbox
fi

# Sealos 官方指南：serve 静态 dist
npx serve -s dist -l 3000
