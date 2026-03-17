#!/bin/bash
# 1. 明确进入前端目录
cd frontend

# 2. 按照 Sealos 官方指南，使用刚才本地安装的 serve 启动静态页面
# 注意：新版 serve 官方参数是 -l 3000（listen），比 -p 更稳定
npx serve -s dist -l 3000