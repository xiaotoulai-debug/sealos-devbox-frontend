# EMAG 跨境电商管理系统 — 前端深度交接文档 (Frontend Handover Document)

> **文档版本**: v1.0  
> **生成日期**: 2026-04-16  
> **适用对象**: 接手本项目的 AI Agent（Hermes）及人类开发者  
> **严重警告**: 本系统为生产级多店跨境电商管理系统，任何不经过代码阅读直接大批量改动的行为，均可能造成财务数据损失。

---

## 目录

1. [技术栈与脚手架](#1-技术栈与脚手架)
2. [核心业务页面结构](#2-核心业务页面结构)
3. [数据请求与 API 封装规范](#3-数据请求与-api-封装规范)
4. [项目目录结构树](#4-项目目录结构树)
5. [组件设计模式与注意事项](#5-组件设计模式与注意事项)

---

## 1. 技术栈与脚手架

### 1.1 核心框架与打包工具

| 技术 | 版本 | 说明 |
|------|------|------|
| React | `^19.2.0` | 函数式组件 + Hooks，无 Class Component |
| TypeScript | `~5.9.3` | 全量类型覆盖，`strict` 模式 |
| Vite | `^7.3.1` | 打包工具，开发端口 `5173`，生产产物输出至 `dist/` |
| `@vitejs/plugin-react` | `^5.1.1` | Babel + Fast Refresh |

> ⚠️ **Node.js 版本警告**：当前 Devbox 环境 Node.js 为 20.18.0，低于 Vite 建议的 20.19+ / 22.12+。构建时有版本警告但不影响产物。正式升级 Node 版本前，不要轻易更新 Vite 的 major 版本。

### 1.2 状态管理

| 方案 | 说明 |
|------|------|
| **React 本地 `useState` + `useCallback` + `useRef`** | 全项目唯一状态管理方案，**无 Redux / Zustand / Context API**。每个页面组件自持状态，通过 `props` 回调通信。 |
| `useRef` 用于"前一次值"跟踪 | 典型用法：`prevRefreshCountRef`，用于检测 prop 变化后触发数据重载，避免 `useEffect` 初始挂载时误触发。 |

### 1.3 路由配置

- 路由库：`react-router-dom ^7.13.1`
- **整体架构为"伪单页"**：所有业务页面并不是独立的 URL 路由，而是挂载在 `/dashboard` 下，通过 **`Dashboard.tsx` 内部的 `activeKey` 状态**（`useState`）实现条件渲染切换。

```
/               → 重定向到 /login
/login          → Login.tsx（无守卫）
/dashboard      → Dashboard.tsx（PrivateRoute 守卫）
  内部按 activeKey 切换：
    'dashboard'          → 仪表盘（Dashboard 内嵌 JSX）
    'pool'               → PublicPool.tsx
    'private-pool'       → PrivatePool.tsx
    'inventory-sku'      → InventorySKU.tsx
    'warehouse-list'     → WarehouseList.tsx
    'platform-products'  → PlatformProducts.tsx
    'platform-orders'    → PlatformOrders.tsx
    'fbe-shipments'      → FbeShipments.tsx
    'sc-planning'        → ProcurementPlanning.tsx
    'sc-management'      → ProcurementManagement.tsx
    'users'              → UserManagement.tsx
    'roles'              → RoleManagement.tsx
    'shop-auth'          → ShopAuth.tsx
    'alibaba-settings'   → AlibabaSettings.tsx
/*              → 重定向到 /login（兜底）
```

**路由守卫**：`PrivateRoute` 组件，通过 `hasToken()`（读 `localStorage.token`）判断。401 响应由 Axios 拦截器统一处理，自动清除 Auth 并跳转 `/login`。

### 1.4 UI 组件库

| 库 | 版本 | 说明 |
|----|------|------|
| Ant Design | `^6.3.1` | 主 UI 库，**注意是 v6 版本**，API 与 v4/v5 有差异 |
| `@ant-design/icons` | `^6.1.0` | 全量 Icon 包 |
| Tailwind CSS | `^4.2.1` | 辅助样式，与 Ant Design 并用，集成方式为 `@tailwindcss/vite` |
| Recharts | `^3.7.0` | 仅用于仪表盘的折线图/面积图 |

**主题配置**：无单独的 Ant Design Token 主题文件，使用默认主题。根节点包裹 `<AntdApp>` 组件（`antd v5+` 推荐方式，使 `message`/`notification` 能脱离 `document.body` 正确渲染）。

### 1.5 其他关键依赖

| 包 | 版本 | 用途 |
|----|------|------|
| `axios` | `^1.13.6` | HTTP 客户端，全局封装在 `src/lib/request.ts` |
| `xlsx` | `^0.18.5` | Excel 解析/生成（批量导入尺寸、模板下载） |
| `file-saver` | `^2.0.5` | 触发浏览器文件下载 |

---

## 2. 核心业务页面结构

### 2.1 菜单架构总览

菜单配置唯一数据源：`src/lib/menuConfig.tsx`（`ALL_MENU_ITEMS`）。  
Dashboard 读取它渲染侧边栏；RoleManagement 读取它生成权限分配树。

```
仪表盘          (dashboard)        — 始终可见（无 Permission Code）
产品开发
  ├── 公海产品  (pool)             code: MENU_PUBLIC_PRODUCTS
  ├── 意向产品  (private-pool)     code: MENU_INTENT_PRODUCTS
  ├── 库存 SKU  (inventory-sku)    code: MENU_INVENTORY
  └── 仓库列表  (warehouse-list)   code: MENU_WAREHOUSE_LIST
平台数据
  ├── 平台产品  (platform-products) code: MENU_PLATFORM_PRODUCTS
  ├── 平台订单  (platform-orders)   code: MENU_PLATFORM_ORDERS
  └── FBE 发货  (fbe-shipments)     code: MENU_FBE_SHIPMENTS
供应采购
  ├── 采购计划  (sc-planning)       code: MENU_PURCHASE_PLAN
  └── 采购管理  (sc-management)     code: MENU_PURCHASE_MANAGE
用户管理
  ├── 分配账号  (users)             code: MENU_ASSIGN_ACCOUNT
  └── 角色管理  (roles)             code: MENU_ROLE_MANAGE
系统设置
  ├── 店铺授权  (shop-auth)         code: MENU_SHOP_AUTH
  └── 1688 配置 (alibaba-settings)  code: MENU_1688_CONFIG
```

**Permission 过滤规则**：
- `isAdminUser()` 为 true → 全菜单可见
- 否则：仅展示 `permissions[]` 数组中包含对应 `code` 的菜单项
- 父节点过滤后子节点全被移除 → 父节点自动隐藏

### 2.2 重点模块：eMAG FBE 发货 (`FbeShipments.tsx`)

#### 组件结构

```
FbeShipments（主页）
  ├── <Table> 发货单列表（分页、Tab 状态过滤、关键字搜索）
  ├── <DetailDrawer> 发货单明细抽屉
  │   ├── 状态信息展示（StatusTag、出库仓库、备注）
  │   ├── [PENDING 状态] ProductPicker 搜索下拉 + 新追加产品列表
  │   ├── <Table> 已有明细（id/sku/名称/发货数量/该仓剩余）
  │   └── Footer：「保存修改」按钮（有变更时才显示）
  ├── <ManualCreateFbeShipmentModal> 手动新建发货单弹窗
  ├── <CreateFbeShipmentModal> 从平台产品创建发货单（供 PlatformProducts 调用，export）
  └── <CostsModal> 费用登记弹窗（超管专属）
```

#### 状态机

```
PENDING（待处理）→ ALLOCATING（配货中）→ SHIPPED（已发货）→ ARRIVED（已入仓）
                                                        ↘ CANCELLED（已取消）
```

只有 `PENDING` 状态允许编辑数量和追加产品（`canEdit = detail?.status === 'PENDING'`）。

#### 关键 API 调用

| 操作 | Method | URL |
|------|--------|-----|
| 列表 | GET | `/fbe-shipments?page=&pageSize=&status=&keyword=` |
| 详情 | GET | `/fbe-shipments/{id}` |
| 手动创建 | POST | `/fbe-shipments` |
| **保存修改**（数量+追加） | **PUT** | **`/fbe-shipments/{id}`** |
| 状态流转 | PUT | `/fbe-shipments/{id}/status` |
| 费用登记 | PUT | `/fbe-shipments/{id}/costs` |
| 删除（超管） | DELETE | `/fbe-shipments/{id}` |

#### ⚠️ CRITICAL：保存 Payload 字段规范

```typescript
// PUT /fbe-shipments/{id}  Body:
{
  items: [
    // 修改数量的老行：主键字段必须是 "id"（不是 "itemId"！）
    { id: number, quantity: number },
    // 新追加的产品行：没有后端 itemId，用 storeProductId 标识
    { storeProductId: number, quantity: number },
  ]
}
```

> **历史血泪**：曾将老行主键误写为 `itemId`（而非 `id`），导致后端静默忽略所有变更，数量保存完全无效。此为本项目已知的最典型"静默失败"陷阱。

#### shipmentId 运行时防御

`detail` 来自 `GET /fbe-shipments/{id}` 的 `res.data`，若后端返回字段名不是 `id` 而是 `shipmentId`/`fbeShipmentId`，`detail.id` 将为 `undefined`。当前代码有兜底：

```typescript
const raw = detail as any;
const shipmentId = detail.id ?? raw.shipmentId ?? raw.fbeShipmentId;
if (!shipmentId) { message.error('无法获取发货单 ID'); return; }
```

### 2.3 重点模块：1688 采购管理

#### 涉及页面/组件

| 组件 | 文件 | 功能 |
|------|------|------|
| `ProcurementManagement` | `pages/ProcurementManagement.tsx` | 采购主单列表、「1688 下单」入口 |
| `OrderProductsTable` | 同上（内嵌子组件） | 展开行：采购单下的产品明细子表 |
| `Place1688OrderModal` | 同上（内嵌） | 双 Tab：自动下单 & 手动关联 1688 订单号 |
| `SpecSelectModal` | 同上（内嵌） | 规格补全子弹窗（按 offerId 拉取规格列表） |
| `AlibabaMappingModal` | `components/AlibabaMappingModal.tsx` | 通用 1688 链接解析 + 规格绑定弹窗 |
| `ProcurementPlanning` | `pages/ProcurementPlanning.tsx` | 采购计划，同样使用 AlibabaMappingModal |
| `AlibabaSettings` | `pages/AlibabaSettings.tsx` | 1688 账号 OAuth 授权配置 |

#### 映射状态三级判定（`getMappingStatus`）

```typescript
// 在 Place1688OrderModal 内部，决定每个产品行展示什么颜色的 Tag
function getMappingStatus(p: OrderProduct): 'none' | 'no_sku' | 'ok' {
  const hasProduct = !!(p.alibabaOfferId || p.externalProductId);  // 商品维度 ID
  const hasSku     = !!p.externalSkuId;                            // 规格 ID（specId）
  if (!hasProduct) return 'none';    // 红色：完全未绑定
  if (!hasSku)     return 'no_sku'; // 橙色：有商品无规格（无法下单）
  return 'ok';                       // 绿色：「已映射完备」
}
```

> ⚠️ **绿色「已映射完备」需要同时满足 offerId + specId（externalSkuId）两个字段非空**。  
> 仅有 `offerId` 会显示橙色「缺规格 (specId)」，不会误亮绿灯。  
> 但采购计划页的「已关联」仅依赖 `externalProductId`，不体现 spec，两套标准不同，注意区分。

#### 字段规范化（`normalizeOrderProduct`）

后端可能返回 camelCase 或 snake_case，通过统一的 normalize 函数对齐：

```typescript
externalSkuId: raw.externalSkuId ?? raw.external_sku_id ?? raw.specId ?? raw.spec_id ?? null
alibabaOfferId: raw.alibabaOfferId ?? raw.alibaba_offer_id ?? raw.offerId ?? raw.offer_id ?? null
```

#### 下单前置防呆（`handleAutoSubmit`）

```
① await reloadProducts()  ← 静默刷新，防止缓存状态的 specId 是旧值
② 重新校验 unmappedLatest  ← 用最新数据而非 state 判断是否可提交
③ 若仍有产品缺 specId → 显示 warning 阻止提交
④ POST /purchases/{id}/place-1688-order
```

---

## 3. 数据请求与 API 封装规范

### 3.1 封装文件

`src/lib/request.ts` — 全局唯一 Axios 实例，**所有 API 请求必须通过此实例发起**，严禁直接 `axios.get/post`。

### 3.2 baseURL 规则

```typescript
const baseURL = import.meta.env.VITE_API_URL
  ? `${VITE_API_URL.replace(/\/$/, '')}/api`  // 生产：https://domain.com/api
  : '/api';                                    // 开发：同源 /api，由 Vite proxy 转发
```

**环境变量文件**：
- `.env.development` / `.env.production`（已加入 `.gitignore`，不提交）
- `.env.example`（模板，可提交）

> **VITE_API_URL 填写规则**：填后端根域名，末尾不带 `/api`，`request.ts` 会自动拼接 `/api`。

### 3.3 请求拦截器

```typescript
// 自动注入 JWT Bearer Token
config.headers.Authorization = `Bearer ${localStorage.getItem('token')}`;
```

**仅注入 `Authorization` 头**，不注入额外自定义 Header，避免触发 CORS 非简单请求预检。

### 3.4 响应拦截器

| 场景 | 行为 |
|------|------|
| HTTP 401（非登录接口） | 清除 `token`/`user`/`permissions`，强跳 `/login` |
| HTTP 401（登录接口） | 不清 token，不跳转，由 Login 页展示后端 message |
| 网络层错误（CORS/断网/超时） | `message.error('网络连接异常...')` |
| 其他 HTTP 4xx/5xx | **不在拦截器处理**，由各业务组件的 `catch` 块自行处理 |

### 3.5 网络错误区分工具

```typescript
// 导出函数，供各组件 catch 块判断
export function isAxiosNetworkError(error: unknown): boolean {
  // error.response 存在 → 有 HTTP 响应 → 不是网络层错误
  // ERR_NETWORK / ECONNABORTED / "Network Error" → 网络层错误
}
```

**用法约定**：在 `catch` 块中先判断 `isAxiosNetworkError(err)`：
- 是网络错误 → 不再重复 `message.error`（全局拦截器已处理）
- 不是网络错误 → 显示业务错误提示

### 3.6 统一响应格式

后端约定：

```json
// 成功
{ "code": 200, "data": [...] | {}, "message": "success" }
// 失败
{ "code": 400 | 500, "data": null, "message": "真实后端错误信息" }
// 空列表（严禁返回 null）
{ "code": 200, "data": [], "message": "success" }
```

### 3.7 字段命名注意事项（已知陷阱汇总）

| 场景 | 陷阱 | 正确做法 |
|------|------|----------|
| FBE 发货单保存 | 老行主键用 `itemId` → 后端静默忽略 | 必须用 **`id`** |
| FBE 详情 ID | `detail.id` 可能为 undefined（后端返回 `shipmentId`） | 兼容写法：`detail.id ?? raw.shipmentId` |
| 1688 规格 ID | 后端字段可能是 `specId`、`spec_id`、`externalSkuId`、`external_sku_id` | 通过 `normalizeOrderProduct` 统一映射到 `externalSkuId` |
| 1688 商品 ID | 后端字段可能是 `alibabaOfferId`、`alibaba_offer_id`、`offerId`、`offer_id` | 通过 `normalizeOrderProduct` 统一映射到 `alibabaOfferId` |
| 后端返回列表结构 | 可能是直接数组、`{ list: [] }`、`{ items: [] }`、`{ data: [] }` | 使用 `reloadProducts` 中的四路兼容解析 |

---

## 4. 项目目录结构树

```
frontend/
├── public/
├── src/
│   ├── main.tsx                   # React 入口，挂载 <App />
│   ├── App.tsx                    # 路由根组件（BrowserRouter + 路由守卫）
│   ├── index.css                  # 全局基础样式（Tailwind base + 少量重置）
│   │
│   ├── assets/
│   │   └── react.svg
│   │
│   ├── lib/                       # ── 全局工具与配置 ──────────────────
│   │   ├── request.ts             # [核心] Axios 实例 + 拦截器 + isAxiosNetworkError
│   │   ├── auth.ts                # [核心] JWT Token / 用户信息读写 / 权限判断函数
│   │   ├── menuConfig.tsx         # [核心] 全量菜单配置 + 权限树构建函数（单一数据源）
│   │   └── currency.ts            # 货币格式化工具（EUR/RON/HUF）
│   │
│   ├── utils/                     # ── 通用业务工具 ─────────────────────
│   │   └── excelImport.ts         # Excel 解析/导出工具（XLSX + file-saver 封装）
│   │                              #   含：parseStrictNumber、mergeDefinedPayloadFields
│   │                              #   含：downloadXlsxTemplate、readExcelAsJsonRows
│   │
│   ├── components/                # ── 跨页面共用组件 ───────────────────
│   │   ├── AlibabaMappingModal.tsx  # 1688 链接解析 + 规格选择绑定弹窗（InventorySKU/ProcurementPlanning 公用）
│   │   ├── ProductImage.tsx         # 带 fallback 的产品图片组件（二次降级 + 占位图，严禁碎图）
│   │   ├── ProfitBreakdownPopover.tsx # 毛利推演明细 Popover（含 ProfitBreakdown 类型导出）
│   │   ├── CostCorrectionModal.tsx  # 成本修正弹窗（由 ProfitBreakdownPopover 内部调用）
│   │   ├── RepeatPurchaseModal.tsx  # 补货下单弹窗（库存 SKU + 采购计划公用）
│   │   ├── BatchImportDimensionsModal.tsx # 批量 Excel 导入尺寸/重量弹窗
│   │   └── SyncStatusBar.tsx        # 同步进度状态条（轮询 /sync-status 接口）
│   │
│   └── pages/                     # ── 业务页面（一对一对应菜单） ───────
│       ├── Login.tsx                # 登录页（POST /auth/login）
│       ├── Dashboard.tsx            # [核心外壳] Layout + 侧边栏 + activeKey 路由分发
│       ├── PublicPool.tsx           # 公海产品
│       ├── PrivatePool.tsx          # 意向产品
│       ├── InventorySKU.tsx         # 库存 SKU 管理（AlibabaMappingModal 使用方之一）
│       ├── WarehouseList.tsx        # 仓库列表 CRUD
│       ├── PlatformProducts.tsx     # 平台产品列表（eMAG 同步产品，含 EAN 搜索、SKU 字段渲染）
│       ├── PlatformOrders.tsx       # 平台订单
│       ├── FbeShipments.tsx         # [重点] FBE 发货管理（明细编辑、追加产品、状态流转）
│       ├── ProcurementPlanning.tsx  # 采购计划（AlibabaMappingModal 使用方之二）
│       ├── ProcurementManagement.tsx# [重点] 采购管理（1688 下单、规格映射、状态流转）
│       ├── SupplyChain.tsx          # 供应链（如有独立页面）
│       ├── UserManagement.tsx       # 子账号管理
│       ├── RoleManagement.tsx       # 角色权限管理（读取 menuConfig 生成权限树）
│       ├── ShopAuth.tsx             # 店铺 eMAG OAuth 授权
│       └── AlibabaSettings.tsx      # 1688 账号授权配置
│
├── .env.example                   # 环境变量模板（可提交）
├── .env.production                # 生产环境变量（⚠️ 已加入 .gitignore，勿提交）
├── .env.development               # 开发环境变量（⚠️ 已加入 .gitignore，勿提交）
├── .gitignore
├── vite.config.ts                 # Vite 配置（proxy: /api → localhost:3001 或 VITE_API_URL）
├── tsconfig.json
└── package.json
```

---

## 5. 组件设计模式与注意事项

### 5.1 Drawer / Modal 开关状态管理模式

全项目统一采用 **「目标对象 state + 布尔 open state」** 双状态模式：

```typescript
// 典型模式 A：以 target 对象是否为 null 来控制 open
const [costsTarget, setCostsTarget] = useState<FbeShipment | null>(null);
// ...
<CostsModal record={costsTarget} onCancel={() => setCostsTarget(null)} />
// Modal 内部：open={!!record}

// 典型模式 B：独立 boolean + 数据 state（适合大型复杂弹窗）
const [drawerOpen, setDrawerOpen] = useState(false);
const [detail, setDetail] = useState<FbeShipment | null>(null);
// ...
<DetailDrawer open={drawerOpen} detail={detail} onClose={() => setDrawerOpen(false)} />
```

**规则**：
- 关闭时用 `setCostsTarget(null)` 或 `setDrawerOpen(false)`，**必须同时清理 target state**，防止下次打开时闪现旧数据。
- `destroyOnClose` 属性在大型弹窗中使用，确保关闭时子组件状态完全重置。
- 初始数据加载在 `useEffect(() => { if (!open) return; ... }, [open, record])` 中触发。

### 5.2 数据刷新协调模式（父子组件刷新信号）

当子弹窗（Modal）内部操作需要通知父组件刷新，且同级兄弟弹窗也需刷新自己的数据时，使用 **计数器信号（`refreshCount`）** 模式：

```typescript
// 父组件
const [subRefreshKey, setSubRefreshKey] = useState(0);

// 子操作成功时
setSubRefreshKey((k) => k + 1);

// 传入需要感知刷新的子弹窗
<Place1688OrderModal refreshCount={subRefreshKey} ... />

// 子弹窗内部
const prevRefreshCountRef = useRef<number>(refreshCount);
useEffect(() => {
  if (refreshCount !== prevRefreshCountRef.current) {
    prevRefreshCountRef.current = refreshCount;
    reloadProducts(); // 静默刷新数据
  }
}, [refreshCount, reloadProducts]);
```

> ⚠️ **不要用 `refreshCount` 直接 `!== 0` 判断是否刷新**，要对比 `prev` vs `current`，否则弹窗初次挂载时会误触发一次多余请求。

### 5.3 列表数据安全渲染

所有 `.map()` 调用前必须进行防御性校验：

```typescript
// ❌ 错误（后端偶发返回 null/undefined 时白屏）
data.map(item => ...)

// ✅ 正确
Array.isArray(data) ? data.map(item => ...) : []
```

Table 空状态使用 `<Empty description="..." />` 而非 `null`，永远不允许出现浏览器默认空页面。

### 5.4 图片渲染规范

```tsx
// ✅ 正确：统一用 Ant Design <Image>，设置 fallback，绝不出现碎图
<Image
  src={imageUrl || undefined}
  referrerPolicy="no-referrer"  // eMAG CDN 图片必须加此属性
  width={44}
  height={44}
  fallback={IMG_FALLBACK}  // base64 SVG 占位图
  preview={false}
/>
```

**eMAG 图片链接必须设置 `referrerPolicy="no-referrer"`**，否则因 Referer 被 CDN 拒绝而显示 403 碎图。

### 5.5 后端 Payload 字段严格对齐规范（高危警告）

> **⚠️ WARNING FOR FUTURE AI AGENTS**：本项目已发生多次因字段名错误导致的"静默失败"事故。后端在收到未知字段时不会报错，只会默默忽略，前端表现为操作成功但数据没变化。

**强制要求**：
1. 在向后端 POST/PUT/PATCH 之前，**必须先通过 `console.debug` 打印 Payload**，或通过 Network 面板确认字段名。
2. 字段名以后端 DTO（TypeScript Interface 或 Prisma Schema）为准，前端对应的变量名可以不同，但 **Payload Key 必须与后端期望的字段名完全一致**。
3. 特别注意 `id` vs `itemId` 这类近似字段——后端只认 `id`，前端本地变量名叫什么都无所谓，但 Payload 里必须是 `id`。
4. 涉及更新操作的接口，**不依赖前端 state 的快照数据**，提交前必须 `await reloadXxx()` 获取最新状态再构造 Payload。

### 5.6 货币与价格渲染规范

```typescript
// ✅ 正确：100% 依赖后端返回的 currency 字段，不硬编码货币符号
import { formatPrice } from '../lib/currency';
formatPrice(salePrice, product.currency)  // → "19.99 RON" / "9.99 €"

// ❌ 错误：前端不得自行判断地区来硬编码货币
if (region === 'RO') return `${price} RON`; // FORBIDDEN
```

### 5.7 开发/生产端口与代理

| 环境 | 前端端口 | 后端端口 | API 路由 |
|------|---------|---------|---------|
| 开发 | `5173` | `3001` | Vite proxy `/api` → `localhost:3001` |
| 生产 | Sealos 自动分配 | Sealos 部署 | 直连 `VITE_API_URL/api`（CORS 必须配置） |

### 5.8 超级管理员专属功能

以下功能通过 `isSuperAdminUser()` 严格判定，普通管理员 `isAdminUser()` 也不能访问：

- FBE 发货单「删除」按钮
- 其他高危删除/回滚操作

```typescript
// isSuperAdminUser 仅认 role.isAdmin === true 或 role.name === '超级管理员'
// 不受「permissions === null 兼容老会话」逻辑影响
import { isSuperAdminUser } from '../lib/auth';
const isSuperAdmin = isSuperAdminUser();
```

---

## 附录：已知 Bug 历史与修复记录

| Bug | 症状 | 根因 | 修复 |
|-----|------|------|------|
| FBE 保存数量无效 | 操作提示成功但数量不变 | Payload 字段 `itemId` 应为 `id` | 改为 `{ id: it.id, quantity: ... }` |
| FBE 保存 HTTP 400 | 后端报"发货单 ID 无效" | URL 为 `/fbe-shipments/undefined` | 加 `shipmentId` 兜底提取 |
| 1688 下单缺 specId | 后端报错缺规格 | 弹窗 state 为换链前的缓存旧值 | 提交前 `await reloadProducts()` 静默刷新 |
| 采购弹窗数据不刷新 | 换链后弹窗内仍显示旧 offerId | `Place1688OrderModal` 无外部刷新机制 | 引入 `refreshCount` prop + `prevRefreshCountRef` |
| CORS 导致白屏 | 所有 API 报错，页面显示「暂无数据」 | 全局无网络错误区分机制 | 实现 `isAxiosNetworkError` + 全局拦截器 |

---

*本文档由前端 AI 协作平台自动生成，基于 2026-04-16 代码快照，如有新模块上线请及时更新。*
