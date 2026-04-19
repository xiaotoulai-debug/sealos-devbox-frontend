# Vue.js Web Application Example

This is a modern Vue.js 3 frontend application example that demonstrates a basic web application setup with Vite.

## Project Description

This project creates a responsive single-page application using Vue.js 3 and Vite. The application demonstrates Vue's component structure, reactivity system, and styling capabilities. The development server listens on port 3000 and provides hot module replacement for a smooth development experience.

## Environment

This project runs on a Debian 12 system with Node.js and Vue.js 3.4.29, which is pre-configured in the Devbox environment. You don't need to worry about setting up Node.js, npm, or Vue dependencies yourself. The development environment includes all necessary tools for building and running Vue applications, including Vite for fast development and optimized builds. If you need to make adjustments to match your specific requirements, you can modify the configuration files accordingly.

## Project Execution

**Development mode:** For normal development environment, simply enter Devbox and run `bash entrypoint.sh` in the terminal. This will start the Vite development server with hot-reload enabled.

**Production mode:** After release, the project will be automatically packaged into a Docker image and deployed according to the `entrypoint.sh` script with production parameters (run `bash entrypoint.sh production`). This will build optimized static files and serve them using Vite's preview server.


DevBox: Code. Build. Deploy. We've Got the Rest.

With DevBox, you can focus entirely on writing great code while we handle the infrastructure, scaling, and deployment. Seamless development from start to production.

## 常见故障排查 (Troubleshooting)

### eMAG 订单同步停滞 / 平台订单长时间不更新

1. **检查 Squid（或公司出口）代理**
   - 登录代理所在主机，查看访问日志与缓存日志（路径因部署而异，常见如 `/var/log/squid/access.log`）。
   - 关注对 eMAG API 域名的 `CONNECT` 失败、`503`、`TCP_MISS` 暴增或单 IP 限流；必要时联系网络侧扩容或切换线路。

2. **确认后端与数据库**
   - 确认同步任务进程/队列无积压，数据库连接正常，近期无长时间锁表。

3. **运行订单追赶脚本（兜底）**
   - 代理与后端容错恢复后，若库中仍缺历史订单，在后端项目目录执行追赶脚本（实现与参数以后端仓库为准）。
   - 本仓库归档说明见：`scripts/sync-catchup.ts`（含使用场景与建议参数）；**可执行脚本请在后端 `scripts/` 维护并接入真实 `OrderSyncService`。**

4. **前端自检**
   - 浏览器 Network 中确认 `GET /api/orders` 返回 `code: 200` 且 `data` 为列表或含 `list` / `items`；`VITE_API_URL` 须指向当前环境 API。 