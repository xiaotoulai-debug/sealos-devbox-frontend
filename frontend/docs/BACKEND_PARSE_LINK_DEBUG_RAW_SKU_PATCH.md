# 1688 解析接口 - debug_raw_sku 排雷补丁

> 后端终端卡死无法查看日志时，将万邦返回的第一个 SKU 的完整原始对象通过 API 响应返回给前端审查。

## 修改位置

找到 `/api/alibaba/parse-link`（或 `/api/procurement/1688-skus`）解析接口的**成功返回**逻辑。

## 修改示例

在最终 `res.json()` 时，强行插入 `debug_raw_sku` 字段：

```typescript
// 假设 rawSkuList 是万邦 API 返回的原始 SKU 数组，cleanedSkus 是清洗后给前端用的数据
return res.json({
  code: 200,
  data: cleanedSkus,           // 原本返回给前端渲染表格的数据
  message: '解析成功',
  debug_raw_sku: rawSkuList?.[0] ?? null,  // 核心：万邦吐出来的第一个原汁原味的 SKU 对象
});
```

## 变量说明

- `rawSkuList`：调用万邦 API 后得到的**原始** SKU 数组（未经清洗）。
- `rawSkuList[0]`：第一个 SKU 的完整原始对象，用于排查字段结构、类型等问题。
- `cleanedSkus`：你清洗/转换后返回给前端的 `data` 数组。

## 修改后

1. 保存文件
2. 重启后端服务（若终端卡死，请新开终端执行启动命令）
3. 前端解析成功后，会在规格列表下方展示「🔍 万邦原始 SKU（排雷用）」供审查
