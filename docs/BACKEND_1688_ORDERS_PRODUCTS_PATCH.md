# 后端修复：采购单产品明细 API 与 1688 同步

> 数据一致性：数据库字段名为 `externalOrderId`，所有接口（products 列表、sync、logistics）必须统一使用此名。

---

## 1. 字段命名规范（必须统一）

| 用途 | 字段名 | 说明 |
|------|--------|------|
| 1688 订单号 | `externalOrderId` | 与 DB 一致，5100... 开头 |
| 平台状态 | `alibabaOrderStatus` | 如 wait_buyer_pay, seller_send, finish |
| 平台金额 | `alibabaTotalAmount` | 从 1688 baseInfo 抓取 |
| 运费 | `shippingFee` | 从 1688 baseInfo 抓取 |

---

## 2. products 列表 API

- **路径**: `GET /api/orders/:orderId/products`
- **返回字段**: 必须包含 `externalOrderId`、`alibabaOrderStatus`、`alibabaTotalAmount`、`shippingFee`、`logisticsCompany`、`logisticsNo`

---

## 3. 1688 同步金额抓取路径修正（核心）

定位 `alibaba.trade.get.buyerView` 的同步代码，**1688 返回对象层级很深**，必须使用以下路径：

```ts
// ❌ 错误：res.totalAmount 是空的
const totalAmount = res.totalAmount;

// ✅ 正确：必须走 baseInfo 层级
const totalAmount = res.result?.baseInfo?.totalAmount;
const shippingFee   = res.result?.baseInfo?.shippingFee;
```

**Prisma update 时**：不要直接赋值 `res.totalAmount`，必须从 `res.result.baseInfo` 取值后写入 `alibabaTotalAmount`、`shippingFee`。

**同步失败时**：在 `message` 中返回 1688 的原始报错原因，便于排查。

---

## 4. sync 与 logistics 接口

- **同步** `POST /api/procurement/sync-1688-order`：接收 `{ externalOrderId: string }`
- **物流** `GET /api/procurement/1688-logistics`：query 参数 `externalOrderId`

---

## 5. 验证

F12 检查 `GET /api/orders/:orderId/products` 响应，应包含：

```json
{
  "id": 1,
  "externalOrderId": "5100123456789",
  "alibabaOrderStatus": "seller_send",
  "alibabaTotalAmount": 99.50,
  "shippingFee": 5.00
}
```

修改后**强制重启**后端服务。
