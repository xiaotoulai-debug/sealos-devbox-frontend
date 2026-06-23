# 1688 下单接口 - debug_payload 排雷补丁

> 后端终端卡死无法查看 console 时，将发往 1688 的完整 Payload 通过 API 响应返回给前端审查。

## 修改位置

找到 `alibaba.trade.create.crossOrder`（或 `/alibaba/create-order` 路由）的 `try...catch` 错误处理代码。

## 修改示例

```typescript
// 在 catch 块中，将准备发给 1688 的完整参数对象暴露到响应中
catch (error) {
  return res.status(500).json({
    code: 500,
    message: `[1688 下单失败] ${error?.message || '未知错误'}`,
    // 核心排雷点：把拼装好的、发给 1688 的参数原封不动吐出来
    debug_payload: yourFinalPayloadObject,  // 替换为实际变量名
  });
}
```

## 变量说明

- `yourFinalPayloadObject`：调用 1688 API 前拼装好的完整请求体，即 `alibaba.trade.create.crossOrder` 的入参。
- 若在 `try` 内、调用 1688 前已构建好 payload，请将该变量传入 `catch` 或在 `catch` 可访问作用域内使用。

## 修改后

1. 保存文件
2. 重启后端服务（若终端卡死，请新开终端执行启动命令）
3. 前端下单失败时，会在错误弹窗中展示 `debug_payload` 供审查
