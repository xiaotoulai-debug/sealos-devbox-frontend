import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Table, Tag, Button, Tooltip, message, Empty, Image, Typography, Drawer, Timeline, Space, Spin,
  Modal, Select, Form, Tabs, Input, Alert, Popconfirm, InputNumber,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table/interface';
import {
  SettingOutlined, ReloadOutlined, ShoppingOutlined,
  SearchOutlined, LinkOutlined, SyncOutlined, CarOutlined,
  ShoppingCartOutlined, EnvironmentOutlined, CompressOutlined, ExpandOutlined,
  CheckCircleOutlined, InboxOutlined, RollbackOutlined, ShopOutlined,
} from '@ant-design/icons';
import request from '../lib/request';

const { Text } = Typography;

/** 绝对安全的金额格式化：兼容 string (Prisma Decimal) / number / null / undefined */
function fmtMoney(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === '') return '-';
  const num = Number(val);
  return isNaN(num) ? '-' : `¥${num.toFixed(2)}`;
}

/** 将后端返回值强转为 number，兼容 Prisma Decimal 字符串 */
function toNum(val: string | number | null | undefined): number {
  if (val === null || val === undefined || val === '') return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

/**
 * 采购单展开明细接口（与后端采购域一致）。
 * 旧路径（已废弃，会 404）：`GET /api/orders/:orderId/products`
 * 新路径：`GET /api/purchases/:purchaseOrderId/products`
 */
function purchaseOrderProductsUrl(purchaseOrderId: number): string {
  return `/purchases/${purchaseOrderId}/products`;
}

// ─── 类型定义 ────────────────────────────────────────────────

interface AliAddress {
  addressId:    string;
  fullName:     string;
  mobile:       string;
  provinceText: string;
  cityText:     string;
  areaText:     string;
  townText:     string;
  address:      string;
  isDefault:    boolean;
}

interface PurchaseOrder {
  id:            number;
  orderNo:       string;
  operator:      string;
  totalAmount:   number | null;   // 采购单未结算时后端可能返回 null
  itemCount:     number;
  status:        string;
  createdAt:     string;
  /** 后端可返回，标识该单下是否有已关联 1688 的产品（有 externalOrderId） */
  has1688Items?: boolean | null;
  /**
   * 后端可返回，标识该单下**所有**产品是否都已映射 1688（有 offerId / externalProductId）。
   * false  → 有产品未映射，自动下单不可用。
   * true   → 全部已映射，可自动下单。
   * null/undefined → 未知，采取宽容策略（允许尝试）。
   */
  allProductsMapped?: boolean | null;
  /** 建单时选择的仓库 ID（如有），用于入库弹窗智能回显 */
  warehouseId?: number | null;
  /** 后端关联返回的仓库对象（用于主表直接展示仓库名） */
  warehouse?: { id: number; name: string } | null;
  /** 供应商名称（1688 供应商，后端聚合返回） */
  supplierName?: string | null;
  /** 1688 外部订单号（订单级聚合，与子单 externalOrderId 同源） */
  alibabaOrderId?: string | null;
  /** 物流公司（手动回填） */
  logisticsCompany?: string | null;
  /** 物流单号（手动回填） */
  trackingNumber?: string | null;
}

interface LogisticsItem {
  time?: string;
  desc?: string;
  status?: string;
}

interface OrderProduct {
  id:                   number;
  pnk:                  string;
  sku:                  string | null;
  chineseName:          string | null;
  imageUrl:             string | null;
  purchaseUrl:          string | null;
  purchasePrice:        number | null;
  purchaseQuantity:     number | null;
  price:                number | null;
  externalOrderId?:     string | null;  // 1688 订单号（与后端 DB 字段一致）
  alibabaOrderStatus?:  string | null;
  alibabaTotalAmount?:  number | null;
  shippingFee?:         number | null;
  logisticsCompany?:    string | null;
  logisticsNo?:         string | null;
  /** 1688 商品 offerId（已映射标志，非空即视为已映射） */
  alibabaOfferId?:      string | null;
  /** 1688 外部产品 ID（与 offerId 二选一均可证明商品映射） */
  externalProductId?:   string | null;
  /** 1688 规格 ID / specId（32位 MD5），下单必须，缺失则无法发起自动下单 */
  externalSkuId?:       string | null;
}

/**
 * 采购数量归一化：别名兼容、0 值保留（全程 ??，避免 || 吞掉 0）、字符串转数字。
 * 兼容扁平字段 purchaseQuantity / purchase_quantity / quantity，以及嵌套 purchase.quantity、item.quantity。
 */
function normalizePurchaseQuantityField(raw: Record<string, unknown>): number | null {
  const nestedQuantity = (obj: unknown): unknown => {
    if (obj && typeof obj === 'object' && obj !== null && 'quantity' in obj) {
      return (obj as Record<string, unknown>).quantity;
    }
    return undefined;
  };

  const flat =
    raw.purchaseQuantity ??
    raw.purchase_quantity ??
    raw.quantity ??
    nestedQuantity(raw.purchase) ??
    nestedQuantity(raw.item);

  if (flat === undefined || flat === null) return null;
  if (typeof flat === 'string' && flat.trim() === '') return null;

  const n = typeof flat === 'number' ? flat : Number(String(flat).trim());
  if (Number.isNaN(n)) return null;
  return n;
}

// 归一化：兼容后端返回 camelCase 或 snake_case
function normalizeOrderProduct(raw: Record<string, unknown>): OrderProduct {
  return {
    id: raw.id as number,
    pnk: (raw.pnk ?? '') as string,
    sku: (raw.sku ?? null) as string | null,
    chineseName: (raw.chineseName ?? raw.chinese_name ?? null) as string | null,
    imageUrl: (raw.imageUrl ?? raw.image_url ?? null) as string | null,
    purchaseUrl: (raw.purchaseUrl ?? raw.purchase_url ?? null) as string | null,
    purchasePrice: (raw.purchasePrice ?? raw.purchase_price ?? null) as number | null,
    purchaseQuantity: normalizePurchaseQuantityField(raw),
    price: (raw.price ?? null) as number | null,
    externalOrderId: (raw.externalOrderId ?? raw.external_order_id ?? raw.alibabaOrderId ?? raw.alibaba_order_id ?? null) as string | null | undefined,
    alibabaOrderStatus: (raw.alibabaOrderStatus ?? raw.alibaba_order_status ?? null) as string | null | undefined,
    alibabaTotalAmount: (raw.alibabaTotalAmount ?? raw.alibaba_total_amount ?? null) as number | null | undefined,
    shippingFee: (raw.shippingFee ?? raw.shipping_fee ?? null) as number | null | undefined,
    logisticsCompany: (raw.logisticsCompany ?? raw.logistics_company ?? null) as string | null | undefined,
    logisticsNo: (raw.logisticsNo ?? raw.logistics_no ?? null) as string | null | undefined,
    alibabaOfferId: (raw.alibabaOfferId ?? raw.alibaba_offer_id ?? raw.offerId ?? raw.offer_id ?? null) as string | null | undefined,
    externalProductId: (raw.externalProductId ?? raw.external_product_id ?? null) as string | null | undefined,
    externalSkuId: (raw.externalSkuId ?? raw.external_sku_id ?? raw.specId ?? raw.spec_id ?? null) as string | null | undefined,
  };
}

// ─── PurchaseOrder 归一化 ─────────────────────────────────────
// fetchOrders 拿到原始 JSON 后立即过此函数，统一字段命名，兼容后端 camelCase/snake_case 混用
function normalizePurchaseOrder(raw: Record<string, unknown>): PurchaseOrder {
  // ── DEBUG：在控制台打印原始数据，确认后端实际字段名 ──────────────
  // 生产稳定后可删除此行
  if (raw.id) {
    const logFields = Object.keys(raw).filter((k) =>
      k.toLowerCase().includes('logistic') ||
      k.toLowerCase().includes('tracking') ||
      k.toLowerCase().includes('bill') ||
      k.toLowerCase().includes('waybill') ||
      k.toLowerCase().includes('company') ||
      k.toLowerCase().includes('shipment'),
    );
    if (logFields.length) {
      console.log(`[PurchaseOrder #${raw.id}] 物流相关字段:`, Object.fromEntries(logFields.map((k) => [k, raw[k]])));
    } else {
      console.log(`[PurchaseOrder #${raw.id}] ⚠ 未发现任何物流字段。原始 keys:`, Object.keys(raw));
    }
  }

  // ── 尝试从嵌套 logistics 对象中读取（兼容后端嵌套结构）──────────
  const nested = (raw.logistics ?? raw.logisticsInfo ?? raw.logistic ?? null) as Record<string, unknown> | null;

  // 物流公司：依次尝试 6 种命名变体 + 嵌套对象
  const logisticsCompany = (
    raw.logisticsCompany ??
    raw.logistics_company ??
    raw.courierCompany ??
    raw.courier_company ??
    nested?.company ??
    nested?.logisticsCompany ??
    null
  ) as string | null | undefined;

  // 运单号：依次尝试 8 种命名变体 + 嵌套对象
  const trackingNumber = (
    raw.trackingNumber    ??
    raw.tracking_number   ??
    raw.logisticsBillNo   ??
    raw.logistics_bill_no ??
    raw.billNo            ??
    raw.bill_no           ??
    raw.waybillNo         ??
    raw.waybill_no        ??
    nested?.trackingNumber ??
    nested?.billNo        ??
    nested?.trackingNo    ??
    null
  ) as string | null | undefined;

  return {
    id:               raw.id                as number,
    orderNo:          (raw.orderNo          ?? raw.order_no          ?? '') as string,
    operator:         (raw.operator         ?? '') as string,
    totalAmount:      (raw.totalAmount      ?? raw.total_amount      ?? null) as number | null,
    itemCount:        (raw.itemCount        ?? raw.item_count        ?? 0)    as number,
    status:           ((raw.status ?? raw.orderStatus ?? raw.order_status ?? '') as string).toUpperCase(),
    createdAt:        (raw.createdAt        ?? raw.created_at        ?? '') as string,
    has1688Items:     (raw.has1688Items     ?? raw.has_1688_items     ?? null) as boolean | null | undefined,
    allProductsMapped:(raw.allProductsMapped?? raw.all_products_mapped?? null) as boolean | null | undefined,
    warehouseId:      (raw.warehouseId      ?? raw.warehouse_id      ?? null) as number | null | undefined,
    warehouse:        (raw.warehouse        ?? null) as { id: number; name: string } | null | undefined,
    supplierName:     (raw.supplierName     ?? raw.supplier_name     ?? null) as string | null | undefined,
    alibabaOrderId:   (raw.alibabaOrderId   ?? raw.alibaba_order_id  ?? null) as string | null | undefined,
    logisticsCompany,
    trackingNumber,
  };
}

// ─── 状态标签映射 ────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING:    { label: '待下单',  color: 'default'    },
  PLACED:     { label: '已下单',  color: 'blue'       },
  PURCHASING: { label: '采购中',  color: 'processing' },
  IN_TRANSIT: { label: '运输中',  color: 'orange'     },
  PARTIAL:    { label: '部分入库', color: 'gold'      },  // gold = 明显橙黄，Tag preset color
  RECEIVED:   { label: '已入库',  color: 'green'      },
  COMPLETED:  { label: '已完成',  color: 'green'      },
};

// 操作列：各阶段判断辅助集合
const PENDING_STATUSES    = new Set(['PENDING']);
const PURCHASING_STATUSES = new Set(['PLACED', 'PURCHASING', 'IN_TRANSIT']);
const PARTIAL_STATUSES    = new Set(['PARTIAL']);                          // 部分入库，未完成
const DONE_STATUSES       = new Set(['RECEIVED', 'COMPLETED']);

const ALIBABA_STATUS_MAP: Record<string, { label: string; color: string }> = {
  wait_buyer_pay:   { label: '待付款', color: 'orange' },
  wait_seller_send: { label: '待发货', color: 'blue' },
  seller_send:      { label: '已发货', color: 'cyan' },
  seller_part_send: { label: '部分发货', color: 'blue' },
  finish:           { label: '交易完成', color: 'green' },
  cancel:           { label: '交易关闭', color: 'default' },
  closed:           { label: '交易关闭', color: 'default' },
};

// ─── 主组件 ──────────────────────────────────────────────────

export default function ProcurementManagement() {
  const [orders,       setOrders]       = useState<PurchaseOrder[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [page,         setPage]         = useState(1);
  const [pageSize,     setPageSize]     = useState(20);
  const [total,        setTotal]        = useState(0);
  const [batchSyncingId, setBatchSyncingId] = useState<number | null>(null);
  const [logisticsOpen, setLogisticsOpen] = useState(false);
  const [logisticsExternalOrderId, setLogisticsExternalOrderId] = useState<string | null>(null);
  const [subRefreshKey, setSubRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState('ALL');
  const [keyword, setKeyword] = useState('');
  const [expandedRowKeys, setExpandedRowKeys] = useState<(string | number)[]>([]);

  // 1688 下单弹窗：目标采购单
  const [place1688Target, setPlace1688Target] = useState<PurchaseOrder | null>(null);
  // 确认入库弹窗：目标采购单
  const [stockInTarget,   setStockInTarget]   = useState<PurchaseOrder | null>(null);
  // 全局仓库列表（供主表内联选择 & StockInModal 共用）
  const [warehouseOptions, setWarehouseOptions] = useState<WarehouseOption[]>([]);
  // 物流回填弹窗：目标采购单
  const [logisticsEditTarget, setLogisticsEditTarget] = useState<PurchaseOrder | null>(null);
  // 物流轨迹弹窗：目标采购单
  const [logisticsTraceTarget, setLogisticsTraceTarget] = useState<PurchaseOrder | null>(null);;

  // 底层 fetch：所有过滤参数均显式传入，避免闭包捕获旧值
  const fetchOrders = useCallback(async (p: number, ps: number, tab: string, kw: string) => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page: p, pageSize: ps };
      if (tab !== 'ALL') params.tabStatus = tab;
      if (kw)            params.keyword    = kw;
      const { data: res } = await request.get<{
        code: number;
        data: { list: PurchaseOrder[]; total: number };
        message: string;
      }>('/purchases', { params }); // 采购单接口：/purchases（不是平台订单 /orders）
      if (res.code === 200 && res.data) {
        setOrders(
          Array.isArray(res.data.list)
            ? res.data.list.map((r) => normalizePurchaseOrder(r as Record<string, unknown>))
            : [],
        );
        setTotal(res.data.total ?? 0);
      } else { message.error(res.message || '获取失败'); }
    } catch { message.error('请求失败，请检查网络或后端服务'); }
    finally { setLoading(false); }
  }, []);

  // 初始加载（仅首次挂载）
  useEffect(() => {
    fetchOrders(1, 20, 'ALL', '');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 全局仓库列表（一次性拉取，供内联选择 & StockInModal 共用）
  useEffect(() => {
    request.get<{ code: number; data: WarehouseOption[] | { list: WarehouseOption[] } }>(
      '/warehouses',
    ).then(({ data: res }) => {
      if (res.code === 200) {
        const list = Array.isArray(res.data)
          ? res.data
          : Array.isArray((res.data as { list: WarehouseOption[] }).list)
            ? (res.data as { list: WarehouseOption[] }).list
            : [];
        setWarehouseOptions(list);
      }
    }).catch(() => { /* 静默，StockInModal 内会单独重试 */ });
  }, []);

  // Tab 切换：直接传入新 key，绕过 state 闭包延迟，确保请求立即携带最新 tabStatus
  const handleTabChange = useCallback((key: string) => {
    setActiveTab(key);
    setPage(1);
    setExpandedRowKeys([]);
    fetchOrders(1, pageSize, key, keyword); // ← key 直接传入，不依赖 activeTab state
  }, [fetchOrders, pageSize, keyword]);

  // 搜索：直接传入新关键词
  const handleSearch = useCallback((val: string) => {
    const kw = val.trim();
    setKeyword(kw);
    setPage(1);
    setExpandedRowKeys([]);
    fetchOrders(1, pageSize, activeTab, kw); // ← kw 直接传入
  }, [fetchOrders, pageSize, activeTab]);

  // 翻页：直接传入新页码，同时同步 state
  const handlePageChange = useCallback((pag: TablePaginationConfig) => {
    const np = pag.current  ?? 1;
    const ns = pag.pageSize ?? pageSize;
    setPage(np);
    setPageSize(ns);
    fetchOrders(np, ns, activeTab, keyword); // ← 直接传入，不等 state 更新
  }, [fetchOrders, pageSize, activeTab, keyword]);

  const handleBatchSync = useCallback(async (orderId: number) => {
    setBatchSyncingId(orderId);
    try {
      // ① 订单状态同步（主流程，失败直接抛出，阻断后续）
      const { data: orderRes } = await request.post<{ code: number; message?: string }>(
        `/purchases/${orderId}/sync-1688`,
      );
      if (orderRes?.code !== 200) {
        message.error(orderRes?.message ?? '1688 状态同步失败，请重试');
        return;
      }

      // ② 物流信息同步（容错：未发货时接口可能报错，不阻断主流程）
      try {
        await request.post(`/purchases/${orderId}/sync-logistics`);
      } catch {
        // 物流暂无属于正常情况，静默忽略，不影响后续刷新与提示
      }

      message.success('1688 状态及物流信息已同步');
      fetchOrders(page, pageSize, activeTab, keyword);
      setSubRefreshKey((k) => k + 1);
    } catch {
      message.error('同步失败，请检查网络');
    } finally {
      setBatchSyncingId(null);
    }
  }, [page, pageSize, fetchOrders, activeTab, keyword]);

  const handleOpenLogistics = useCallback((externalOrderId: string) => {
    setLogisticsExternalOrderId(externalOrderId);
    setLogisticsOpen(true);
  }, []);

  const handleCloseLogistics = useCallback(() => {
    setLogisticsOpen(false);
    setLogisticsExternalOrderId(null);
  }, []);

  const refresh = useCallback(() => {
    fetchOrders(page, pageSize, activeTab, keyword);
  }, [fetchOrders, page, pageSize, activeTab, keyword]);

  // 线下采购：标记为采购中
  const handleMarkPurchasing = useCallback(async (orderId: number) => {
    try {
      const { data: res } = await request.post<{ code: number; message: string }>(
        `/purchases/${orderId}/mark-purchasing`,
      );
      if (res.code === 200) { message.success(res.message || '已标记为线下采购中'); refresh(); }
      else { message.error(res.message || '操作失败，请重试'); }
    } catch { message.error('网络异常，请重试'); }
  }, [refresh]);

  // 撤销采购单：回退至 PENDING，已入库单据自动扣减库存
  const handleRollback = useCallback(async (orderId: number) => {
    try {
      const { data: res } = await request.post<{ code: number; message: string }>(
        `/purchases/${orderId}/rollback`,
      );
      if (res.code === 200) {
        message.success(res.message || '撤销成功，已回退至未下单');
        refresh();
      } else {
        message.error(res.message || '撤销失败，请重试');
      }
    } catch { message.error('网络异常，撤销失败，请重试'); }
  }, [refresh]);

  // 强行结单：PARTIAL → COMPLETED，跳过剩余未入库数量
  const handleForceComplete = useCallback(async (orderId: number) => {
    try {
      const { data: res } = await request.post<{ code: number; message: string }>(
        `/purchases/${orderId}/force-complete`,
        {},
      );
      if (res.code === 200) {
        message.success(res.message || '已强行结单，状态变更为"已完成"');
        refresh();
      } else {
        message.error(res.message || '强行结单失败，请重试');
      }
    } catch { message.error('网络异常，强行结单失败，请重试'); }
  }, [refresh]);

  // 删除采购单：仅 PENDING 状态可用，关联产品回流产品库
  const handleDeleteOrder = useCallback(async (orderId: number) => {
    try {
      const { data: res } = await request.delete<{ code: number; message: string }>(
        `/purchases/${orderId}`,
      );
      if (res.code === 200) {
        message.success(res.message || '采购单已删除');
        refresh();
      } else {
        message.error(res.message || '删除失败，请重试');
      }
    } catch { message.error('网络异常，请重试'); }
  }, [refresh]);

  // 内联仓库选择：PATCH 更新采购单目标仓库后刷新列表
  const handlePatchWarehouse = useCallback(async (orderId: number, warehouseId: number) => {
    try {
      const { data: res } = await request.patch<{ code: number; message: string }>(
        `/purchases/${orderId}/warehouse`,
        { warehouseId },
      );
      if (res.code === 200) { message.success(res.message || '入库仓库已更新'); refresh(); }
      else { message.error(res.message || '更新失败，请重试'); }
    } catch { message.error('网络异常，请重试'); }
  }, [refresh]);

  // 物流回填：PATCH 保存物流公司 + 单号，并刷新列表
  const handleSaveLogistics = useCallback(async (
    orderId: number,
    logisticsCompany: string,
    trackingNumber: string,
  ) => {
    try {
      const { data: res } = await request.patch<{ code: number; message: string }>(
        `/purchases/${orderId}/logistics`,
        { logisticsCompany: logisticsCompany.trim(), trackingNumber: trackingNumber.trim() },
      );
      if (res.code === 200) {
        message.success(res.message || '物流信息已保存');
        setLogisticsEditTarget(null);
        refresh();
      } else {
        message.error(res.message || '保存失败，请重试');
      }
    } catch { message.error('网络异常，请重试'); }
  }, [refresh]);

  // 展开 / 收起全部
  const handleToggleExpandAll = useCallback(() => {
    setExpandedRowKeys((prev) =>
      prev.length > 0 ? [] : orders.map((o) => o.id),
    );
  }, [orders]);

  // ── 主表列定义 ──

  const columns = useMemo<ColumnsType<PurchaseOrder>>(() => [
    {
      title: '采购单编号', dataIndex: 'orderNo', width: 175,
      render: (v: string) => (
        <Text strong style={{ fontFamily: "'Inter', monospace", fontSize: 13, letterSpacing: 0.3 }}>{v}</Text>
      ),
    },
    {
      // 供应商 + 1688订单号：填补原有空白区域
      title: '供应商 / 1688订单', key: 'supplierOrder', width: 240,
      render: (_: unknown, record: PurchaseOrder) => (
        <div style={{ lineHeight: '1.6', fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#374151', fontWeight: 500 }}>
            <ShopOutlined style={{ color: '#6b7280', fontSize: 12 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 195 }}>
              {record.supplierName ?? '—'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, color: '#6b7280' }}>
            <ShoppingCartOutlined style={{ fontSize: 11 }} />
            {record.alibabaOrderId
              ? <Text copyable={{ text: record.alibabaOrderId }} style={{ fontFamily: "'Inter', monospace", fontSize: 11, color: '#64748b' }}>{record.alibabaOrderId}</Text>
              : <span style={{ color: '#d9d9d9', fontStyle: 'italic' }}>未绑定1688</span>
            }
          </div>
        </div>
      ),
    },
    {
      // 物流信息：显示公司 + 单号；有单号时可查看轨迹，并提供回填入口
      title: '物流信息', key: 'logistics', width: 210,
      render: (_: unknown, record: PurchaseOrder) => {
        const hasLogistics = !!(record.logisticsCompany || record.trackingNumber);
        return (
          <div style={{ fontSize: 12 }}>
            {hasLogistics ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#374151', fontWeight: 500 }}>
                  <CarOutlined style={{ color: '#6b7280', fontSize: 12 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 155 }}>
                    {record.logisticsCompany ?? '—'}
                  </span>
                </div>
                {record.trackingNumber && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Text copyable={{ text: record.trackingNumber }} style={{ fontFamily: "'Inter', monospace", fontSize: 11, color: '#64748b' }}>
                      {record.trackingNumber}
                    </Text>
                  </div>
                )}
              </>
            ) : (
              <span style={{ color: '#d9d9d9', fontSize: 11 }}>暂无物流单号</span>
            )}
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Button
                type="link"
                size="small"
                icon={<SettingOutlined />}
                style={{ padding: 0, fontSize: 11, color: '#9ca3af' }}
                onClick={(e) => { e.stopPropagation(); setLogisticsEditTarget(record); }}
              >
                {hasLogistics ? '修改' : '填写'}
              </Button>
              {record.trackingNumber && (
                <Button
                  type="link"
                  size="small"
                  icon={<EnvironmentOutlined />}
                  style={{ padding: 0, fontSize: 11, color: '#1890ff' }}
                  onClick={(e) => { e.stopPropagation(); setLogisticsTraceTarget(record); }}
                >
                  查看轨迹
                </Button>
              )}
            </div>
          </div>
        );
      },
    },
    {
      title: '操作员', dataIndex: 'operator', width: 100, align: 'center' as const,
      render: (v: string) => <Tag bordered={false} color="blue" style={{ fontWeight: 500 }}>{v}</Tag>,
    },
    {
      title: '创建时间', dataIndex: 'createdAt', width: 160, align: 'center' as const,
      render: (v: string | null) => {
        if (!v) return <Text type="secondary">-</Text>;
        const d = new Date(v);
        return <Text type="secondary" style={{ fontSize: 13 }}>{d.toLocaleString('zh-CN')}</Text>;
      },
    },
    {
      title: '总采购金额', dataIndex: 'totalAmount', width: 120, align: 'right' as const,
      render: (v: string | number | null) => {
        const s = fmtMoney(v);
        return (
          <span style={{ fontWeight: 700, fontSize: 14, color: s === '-' ? undefined : '#d4380d', fontFeatureSettings: '"tnum"' }}>
            {s}
          </span>
        );
      },
    },
    {
      title: '入库仓', key: 'warehouse', width: 160, align: 'center' as const,
      render: (_: unknown, record: PurchaseOrder) => {
        // 已绑定仓库 → Tag 展示
        const whName = record.warehouse?.name;
        if (whName) {
          return (
            <Tag
              color="blue"
              bordered={false}
              style={{ fontWeight: 500, borderRadius: 6, fontSize: 12 }}
            >
              {whName}
            </Tag>
          );
        }
        // 老数据无仓库 → 内联 Select 补全
        return (
          <Select
            size="small"
            placeholder="选择入库仓"
            style={{ width: 140 }}
            options={warehouseOptions.map((w) => ({ label: w.name, value: w.id }))}
            onChange={(val: number) => handlePatchWarehouse(record.id, val)}
            onClick={(e) => e.stopPropagation()} // 防止触发行展开
          />
        );
      },
    },
    {
      title: '状态', dataIndex: 'status', width: 110, align: 'center' as const,
      render: (v: string) => {
        // DEBUG：F12 Console 可看到实际 status 值，确认后端返回是否与期望一致
        if (v === 'PARTIAL' || !STATUS_MAP[v]) {
          console.log('[STATUS render] raw status value =', JSON.stringify(v));
        }
        const cfg = STATUS_MAP[v] ?? { label: v || '未知', color: 'default' };
        return <Tag color={cfg.color} bordered={false} style={{ fontWeight: 600, borderRadius: 6 }}>{cfg.label}</Tag>;
      },
    },
    {
      title: '操作', key: 'actions', width: 280, fixed: 'right', align: 'center' as const,
      render: (_: unknown, record: PurchaseOrder) => {
        const isSyncing  = batchSyncingId === record.id;
        const isPending  = PENDING_STATUSES.has(record.status);
        const isOrdering = PURCHASING_STATUSES.has(record.status);
        const isPartial  = PARTIAL_STATUSES.has(record.status);
        const isDone     = DONE_STATUSES.has(record.status);

        return (
          <Space size={4} wrap>
            {/* ── 待下单阶段 ─────────────────── */}
            {isPending && (
              <>
                {record.has1688Items !== false && (
                  <Button
                    type="primary"
                    size="small"
                    icon={<ShoppingCartOutlined />}
                    onClick={() => {
                      if (!record.warehouseId && !record.warehouse?.id) {
                        message.error('请先在当前行选择入库目标仓库！');
                        return;
                      }
                      setPlace1688Target(record);
                    }}
                    style={{ background: '#fa8c16', borderColor: '#fa8c16' }}
                  >
                    1688 下单
                  </Button>
                )}
                <Button
                  size="small"
                  icon={<ShoppingOutlined />}
                  onClick={() => {
                    if (!record.warehouseId && !record.warehouse?.id) {
                      message.error('请先在当前行选择入库目标仓库！');
                      return;
                    }
                    handleMarkPurchasing(record.id);
                  }}
                >
                  线下采购
                </Button>
              </>
            )}

            {/* ── 采购中 / 运输中阶段 → 首次入库 ─── */}
            {isOrdering && (
              <Button
                type="primary"
                size="small"
                icon={<InboxOutlined />}
                onClick={() => setStockInTarget(record)}
              >
                确认入库
              </Button>
            )}

            {/* ── 未完成（PARTIAL）→ 继续入库 + 标记完成 ── */}
            {isPartial && (
              <>
                <Button
                  type="primary"
                  size="small"
                  icon={<InboxOutlined />}
                  onClick={() => setStockInTarget(record)}
                  style={{ background: '#0ea5e9', borderColor: '#0ea5e9' }}
                >
                  继续入库
                </Button>
                <Popconfirm
                  title="强行结单"
                  description={
                    <span style={{ maxWidth: 240, display: 'inline-block', lineHeight: 1.6 }}>
                      将忽略剩余未入库数量，直接把此采购单标记为"已完成"。此操作不可撤销，请确认！
                    </span>
                  }
                  okText="确认结单"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleForceComplete(record.id)}
                >
                  <Button
                    size="small"
                    icon={<CheckCircleOutlined />}
                    danger
                  >
                    标记完成
                  </Button>
                </Popconfirm>
              </>
            )}

            {/* ── 已完成阶段（只读） ───────── */}
            {isDone && (
              <span style={{ color: '#52c41a', fontSize: 12, fontWeight: 600 }}>
                <CheckCircleOutlined style={{ marginRight: 4 }} />已完成
              </span>
            )}

            {/* ── 撤销（采购中 / 已完成均可撤回） ─ */}
            {(isOrdering || isDone) && (
              <Popconfirm
                title="确认撤销此采购单？"
                description={
                  <span style={{ maxWidth: 260, display: 'inline-block', lineHeight: 1.6 }}>
                    操作将把此采购单打回"未下单"状态。
                    <br />
                    如果是<strong>已入库</strong>的单据，系统将自动扣除对应的仓库库存！
                  </span>
                }
                okText="确认撤销"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleRollback(record.id)}
              >
                <Button
                  type="link"
                  danger
                  size="small"
                  icon={<RollbackOutlined />}
                >
                  撤销
                </Button>
              </Popconfirm>
            )}

            {/* ── 一键同步（未完成时均可用） ───── */}
            {!isDone && (
              <Button
                type="link"
                size="small"
                icon={<SyncOutlined spin={isSyncing} />}
                loading={isSyncing}
                disabled={isSyncing}
                onClick={() => handleBatchSync(record.id)}
              >
                同步
              </Button>
            )}

            {/* ── 删除 / 作废（仅待下单可用） ─── */}
            {isPending && (
              <Popconfirm
                title="确定要删除此采购单吗？"
                description={
                  <span style={{ maxWidth: 260, display: 'inline-block', lineHeight: 1.6 }}>
                    关联的商品将被释放回产品库，此操作<strong>不可撤销</strong>。
                  </span>
                }
                okText="确认删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDeleteOrder(record.id)}
              >
                <Button
                  type="link"
                  danger
                  size="small"
                >
                  删除
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ], [handleBatchSync, batchSyncingId, setPlace1688Target, handleMarkPurchasing, setStockInTarget, handleRollback, handleDeleteOrder, warehouseOptions, handlePatchWarehouse, setLogisticsEditTarget, setLogisticsTraceTarget]);

  // ── 嵌套子表 ──

  const expandedRowRender = useCallback((record: PurchaseOrder) => (
    <OrderProductsTable
      orderId={record.id}
      refreshKey={subRefreshKey}
      onOpenLogistics={handleOpenLogistics}
      onSyncSuccess={() => setSubRefreshKey((k) => k + 1)}
    />
  ), [subRefreshKey, handleOpenLogistics]);

  return (
    <div className="min-h-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 m-0 flex items-center gap-2">
            <SettingOutlined style={{ color: '#1890ff', fontSize: 20 }} />
            采购管理
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            共 <span className="font-semibold text-gray-700 text-base">{total}</span> 张采购单
          </p>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => { setPage(1); fetchOrders(1, pageSize, activeTab, keyword); }}>刷新</Button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100" style={{ overflow: 'hidden' }}>
        {/* ── Tab 分类 ── */}
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          size="middle"
          style={{ padding: '0 20px', borderBottom: '1px solid #f0f0f0', marginBottom: 0 }}
          items={[
            { key: 'ALL',        label: '全部'   },
            { key: 'PENDING',    label: '未下单' },
            { key: 'PURCHASING', label: '采购中' },
            { key: 'PARTIAL',    label: <span style={{ color: '#d97706', fontWeight: 500 }}>未完成</span> },
            { key: 'COMPLETED',  label: '已完成' },
          ]}
        />

        {/* ── 工具栏：搜索 + 展开/收起 ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid #f5f5f5' }}>
          <Button
            size="small"
            icon={expandedRowKeys.length > 0 ? <CompressOutlined /> : <ExpandOutlined />}
            onClick={handleToggleExpandAll}
          >
            {expandedRowKeys.length > 0 ? '收起全部明细' : '展开全部明细'}
          </Button>
          <Input.Search
            placeholder="搜索主单号 / 1688订单号 / SKU / 物流单号"
            allowClear
            size="small"
            style={{ width: 280 }}
            value={keyword}
            onSearch={(val) => handleSearch(val)}
            onChange={(e) => {
              const val = e.target.value;
              setKeyword(val);
              // 清空时立即重置搜索（覆盖 allowClear 点 X 不触发 onSearch 的 bug）
              if (!val) handleSearch('');
            }}
          />
        </div>

        <Table
          rowKey="id"
          dataSource={orders}
          columns={columns}
          loading={loading}
          size="large"
          scroll={{ x: 'max-content', y: 'calc(100vh - 370px)' }}
          onChange={handlePageChange}
          expandable={{
            expandedRowRender,
            expandedRowKeys,
            onExpandedRowsChange: (keys) => setExpandedRowKeys(keys as (string | number)[]),
            onExpand: (expanded) => {
              // 每次有行展开时自增 refreshKey，强制子组件重新请求接口
              if (expanded) setSubRefreshKey((k) => k + 1);
            },
          }}
          pagination={{
            current: page, pageSize, total,
            showSizeChanger: true, pageSizeOptions: ['20', '50', '100'],
            showQuickJumper: true,
            showTotal: (t, r) => `第 ${r[0]}–${r[1]} 条 / 共 ${t} 条`,
          }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无采购单" style={{ padding: '64px 0' }} /> }}
          rowClassName="align-middle"
        />
      </div>

      <LogisticsDrawer
        open={logisticsOpen}
        externalOrderId={logisticsExternalOrderId}
        onClose={handleCloseLogistics}
      />

      <Place1688OrderModal
        record={place1688Target}
        onCancel={() => setPlace1688Target(null)}
        onSuccess={() => {
          setPlace1688Target(null);
          refresh();
        }}
      />

      <StockInModal
        record={stockInTarget}
        onCancel={() => setStockInTarget(null)}
        onSuccess={() => {
          setStockInTarget(null);
          refresh();
          setSubRefreshKey((k) => k + 1);
        }}
      />

      <LogisticsEditModal
        record={logisticsEditTarget}
        onCancel={() => setLogisticsEditTarget(null)}
        onSave={handleSaveLogistics}
      />

      <LogisticsTraceModal
        record={logisticsTraceTarget}
        onCancel={() => setLogisticsTraceTarget(null)}
      />
    </div>
  );
}

// ─── 规格补全子弹窗 ─────────────────────────────────────────────

interface AlibabaSpec {
  specId:     string;
  attributes: string;   // 后端字段名，如 "红色 / XL"
  label?:     string;   // 兼容旧字段名（二选一）
}

interface SpecSelectModalProps {
  product:   OrderProduct | null;
  onCancel:  () => void;
  onSuccess: (productId: number, specId: string) => void;
}

function SpecSelectModal({ product, onCancel, onSuccess }: SpecSelectModalProps) {
  const [specs,        setSpecs]        = useState<AlibabaSpec[]>([]);
  const [specsLoading, setSpecsLoading] = useState(false);
  const [selectedSpec, setSelectedSpec] = useState<string | undefined>(undefined);
  const [saving,       setSaving]       = useState(false);

  // 每次打开时按 offerId 拉取规格列表
  useEffect(() => {
    const offerId = product?.alibabaOfferId ?? product?.externalProductId;
    if (!product || !offerId) {
      setSpecs([]);
      setSelectedSpec(undefined);
      return;
    }
    setSelectedSpec(undefined);
    setSpecsLoading(true);
    (async () => {
      try {
        const { data: res } = await request.get<{
          code: number;
          data?: AlibabaSpec[] | { list?: AlibabaSpec[]; items?: AlibabaSpec[] };
          message?: string;
        }>('/alibaba/product-specs', { params: { offerId } });

        console.log('Specs received:', res.data);

        // 兼容三种后端返回结构：直接数组 / { list } / { items }
        let list: AlibabaSpec[] = [];
        if (Array.isArray(res.data)) {
          list = res.data;
        } else if (res.data && Array.isArray((res.data as { list?: AlibabaSpec[] }).list)) {
          list = (res.data as { list: AlibabaSpec[] }).list;
        } else if (res.data && Array.isArray((res.data as { items?: AlibabaSpec[] }).items)) {
          list = (res.data as { items: AlibabaSpec[] }).items;
        }

        if (res.code === 200) {
          setSpecs(list);
          // 若只有一个规格，自动预选
          if (list.length === 1) setSelectedSpec(list[0].specId);
        } else {
          message.warning(res.message || '获取规格失败');
          setSpecs([]);
        }
      } catch {
        message.error('获取规格失败，请检查网络');
        setSpecs([]);
      } finally {
        setSpecsLoading(false);
      }
    })();
  }, [product]);

  const handleConfirm = async () => {
    if (!product || !selectedSpec) return;
    setSaving(true);
    try {
      console.log('[quick-map] PATCH', `/products/${product.id}/quick-map`, { externalSkuId: selectedSpec });
      const { data: res } = await request.patch<{ code: number; message?: string }>(
        `/products/${product.id}/quick-map`,
        { externalSkuId: selectedSpec },
      );
      if (res.code === 200) {
        onSuccess(product.id, selectedSpec);
      } else {
        message.error(res.message || '绑定规格失败，请重试');
      }
    } catch {
      message.error('网络异常，请重试');
    } finally {
      setSaving(false);
    }
  };

  const offerId = product?.alibabaOfferId ?? product?.externalProductId;

  return (
    <Modal
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SettingOutlined style={{ color: '#fa8c16' }} />
          补全 1688 规格
        </span>
      }
      open={!!product}
      onCancel={onCancel}
      onOk={handleConfirm}
      okText="确定绑定"
      cancelText="取消"
      confirmLoading={saving}
      okButtonProps={{ disabled: !selectedSpec || saving }}
      width={500}
      destroyOnClose
      // 让子弹窗叠在父 Modal 之上
      zIndex={1050}
    >
      {/* 产品信息卡片 */}
      {product && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#fafafa', borderRadius: 8, marginBottom: 16, border: '1px solid #f0f0f0' }}>
          <Image
            src={product.imageUrl ?? undefined}
            width={44}
            height={44}
            style={{ objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
            preview={false}
            fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44'%3E%3Crect width='44' height='44' fill='%23f0f0f0'/%3E%3C/svg%3E"
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: '#1e293b' }}>
              {product.sku ?? product.pnk}
            </div>
            {product.chineseName && (
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>
                {product.chineseName}
              </div>
            )}
            {offerId && (
              <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace', marginTop: 2 }}>
                offerId：{offerId}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 规格选择器 */}
      <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 500, color: '#374151' }}>
        选择对应 1688 规格（specId）
      </div>
      {specsLoading ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Spin size="small" />
          <span style={{ marginLeft: 8, fontSize: 12, color: '#9ca3af' }}>正在读取规格列表…</span>
        </div>
      ) : specs.length > 0 ? (
        <Select
          style={{ width: '100%' }}
          placeholder="请选择规格"
          value={selectedSpec}
          onChange={setSelectedSpec}
          options={specs.map((s) => ({
            value: s.specId,
            label: s.attributes || s.label || s.specId,   // attributes 优先，兼容旧字段
          }))}
          optionFilterProp="label"
          showSearch
          dropdownStyle={{ maxHeight: 280 }}
        />
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={offerId ? '该商品暂无可选规格，或规格接口未返回数据' : '缺少商品 offerId，无法查询规格'}
          style={{ padding: '16px 0' }}
        />
      )}

      {selectedSpec && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
          specId：{selectedSpec}
        </div>
      )}
    </Modal>
  );
}

// ─── 物流轨迹 Modal ────────────────────────────────────────────

interface TraceNode {
  // 时间：兼容多种字段名
  time?:        string | null;
  timestamp?:   string | null;
  datetime?:    string | null;
  acceptTime?:  string | null;
  accept_time?: string | null;
  // 描述：兼容多种字段名
  desc?:        string | null;
  description?: string | null;
  content?:     string | null;
  remark?:      string | null;
  acceptStation?: string | null;
  accept_station?: string | null;
  // 地点
  location?:    string | null;
  city?:        string | null;
  area?:        string | null;
}

// 从后端响应中提取 TraceNode[]，兼容直接数组 / 各种嵌套结构
function extractTraceNodes(data: unknown): TraceNode[] {
  if (Array.isArray(data)) return data as TraceNode[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const candidate =
      obj.nodes   ?? obj.list  ?? obj.items ??
      obj.traces  ?? obj.data  ?? obj.result ??
      obj.details ?? obj.track ?? obj.records;
    if (Array.isArray(candidate)) return candidate as TraceNode[];
  }
  return [];
}

// 从 TraceNode 中统一读取时间、描述、地点
function pickTraceTime(n: TraceNode): string {
  return (n.time ?? n.timestamp ?? n.datetime ?? n.acceptTime ?? n.accept_time ?? '') as string;
}
function pickTraceDesc(n: TraceNode): string {
  return (n.desc ?? n.description ?? n.content ?? n.remark ?? n.acceptStation ?? n.accept_station ?? '—') as string;
}
function pickTraceLocation(n: TraceNode): string {
  return (n.location ?? n.city ?? n.area ?? '') as string;
}

interface LogisticsTraceModalProps {
  record: PurchaseOrder | null;
  onCancel: () => void;
}

function LogisticsTraceModal({ record, onCancel }: LogisticsTraceModalProps) {
  const [nodes, setNodes]     = useState<TraceNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg]   = useState<string | null>(null);

  useEffect(() => {
    if (!record) {
      setNodes([]);
      setErrMsg(null);
      return;
    }
    let cancelled = false;
    setNodes([]);
    setErrMsg(null);
    setLoading(true);
    (async () => {
      try {
        const { data: res } = await request.get<{ code: number; data?: unknown; message?: string }>(
          `/purchases/${record.id}/logistics-trace`,
        );
        if (cancelled) return;
        if (!res || res.code !== 200) {
          const hint = res?.message ?? `接口返回 code=${res?.code ?? 'N/A'}`;
          setErrMsg(hint);
          message.warning(`物流轨迹获取失败：${hint}`);
          return;
        }
        const list = extractTraceNodes(res.data);
        console.log(`[LogisticsTrace #${record.id}] nodes=`, list.length, list[0]);
        setNodes(list);
        if (list.length === 0) {
          setErrMsg('接口正常返回，但暂无轨迹节点（货物可能尚未揽收）');
        }
      } catch (err) {
        if (cancelled) return;
        const status = (err as { response?: { status?: number; data?: { message?: string } } })?.response;
        const hint   = status?.data?.message ?? `HTTP ${status?.status ?? '网络错误'}`;
        console.error(`[LogisticsTrace #${record.id}] 请求异常:`, err);
        setErrMsg(hint);
        message.error(`物流轨迹请求异常：${hint}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [record]);

  return (
    <Modal
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <EnvironmentOutlined style={{ color: '#1890ff' }} />
          物流轨迹
          {record?.trackingNumber && (
            <Text
              copyable={{ text: record.trackingNumber }}
              style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748b', fontWeight: 400, marginLeft: 4 }}
            >
              {record.trackingNumber}
            </Text>
          )}
        </span>
      }
      open={!!record}
      onCancel={onCancel}
      footer={null}
      width={480}
      destroyOnClose
    >
      {/* 物流公司 */}
      {record?.logisticsCompany && (
        <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f0f7ff', borderRadius: 8, fontSize: 12, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 6 }}>
          <CarOutlined />
          <span style={{ fontWeight: 600 }}>{record.logisticsCompany}</span>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Spin size="large" tip="正在查询物流轨迹..." />
        </div>
      ) : nodes.length > 0 ? (
        <Timeline
          style={{ marginTop: 8, padding: '4px 0' }}
          items={nodes.map((node, i) => ({
            key: i,
            color: i === 0 ? 'green' : 'gray',
            children: (
              <div style={{ paddingBottom: 4 }}>
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>
                  {pickTraceTime(node)}
                  {pickTraceLocation(node) && (
                    <span style={{ marginLeft: 8, color: '#6b7280' }}>
                      <EnvironmentOutlined style={{ marginRight: 2, fontSize: 10 }} />
                      {pickTraceLocation(node)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: i === 0 ? '#15803d' : '#374151', fontWeight: i === 0 ? 600 : 400 }}>
                  {pickTraceDesc(node)}
                </div>
              </div>
            ),
          }))}
        />
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            errMsg
              ? <span style={{ color: '#f59e0b', fontSize: 12 }}>{errMsg}</span>
              : '暂无轨迹信息'
          }
          style={{ padding: '32px 0' }}
        />
      )}
    </Modal>
  );
}

// ─── 物流回填轻量 Modal ────────────────────────────────────────

interface LogisticsEditModalProps {
  record: PurchaseOrder | null;
  onCancel: () => void;
  onSave: (orderId: number, logisticsCompany: string, trackingNumber: string) => Promise<void>;
}

function LogisticsEditModal({ record, onCancel, onSave }: LogisticsEditModalProps) {
  const [form] = Form.useForm<{ logisticsCompany: string; trackingNumber: string }>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (record) {
      form.setFieldsValue({
        logisticsCompany: record.logisticsCompany ?? '',
        trackingNumber:   record.trackingNumber   ?? '',
      });
    } else {
      form.resetFields();
    }
  }, [record, form]);

  const handleOk = async () => {
    let values: { logisticsCompany: string; trackingNumber: string };
    try { values = await form.validateFields(); } catch { return; }
    setSaving(true);
    try {
      await onSave(record!.id, values.logisticsCompany, values.trackingNumber);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CarOutlined style={{ color: '#1890ff' }} />
          填写物流信息
        </span>
      }
      open={!!record}
      onCancel={onCancel}
      onOk={handleOk}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      width={460}
      destroyOnClose
    >
      {record && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#64748b' }}>
          采购单：<strong style={{ color: '#1e293b', fontFamily: 'monospace' }}>{record.orderNo}</strong>
        </div>
      )}
      <Form form={form} layout="vertical" size="middle">
        <Form.Item
          label="物流公司"
          name="logisticsCompany"
          rules={[{ required: true, message: '请输入物流公司名称' }]}
        >
          <Input placeholder="例：顺丰速运、中通快递..." allowClear />
        </Form.Item>
        <Form.Item
          label="物流单号"
          name="trackingNumber"
          rules={[{ required: true, message: '请输入物流单号' }]}
        >
          <Input placeholder="输入快递单号" allowClear style={{ fontFamily: 'monospace' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ─── 物流抽屉 ──────────────────────────────────────────────────

interface LogisticsDrawerProps {
  open: boolean;
  externalOrderId: string | null;
  onClose: () => void;
}

interface LogisticsData {
  company?: string | null;
  trackingNo?: string | null;
  list?: LogisticsItem[];
}

function LogisticsDrawer({ open, externalOrderId, onClose }: LogisticsDrawerProps) {
  const [data, setData] = useState<LogisticsData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !externalOrderId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data: res } = await request.get<{ code: number; data?: LogisticsData; message?: string }>(
          '/procurement/1688-logistics',
          { params: { externalOrderId } },
        );
        if (!cancelled && res.code === 200 && res.data) {
          setData(res.data);
        } else if (!cancelled) {
          setData(null);
        }
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, externalOrderId]);

  const list = Array.isArray(data?.list) ? data.list : [];
  const company = data?.company ?? '';
  const trackingNo = data?.trackingNo ?? '';

  return (
    <Drawer
      title="物流详情"
      placement="right"
      width={420}
      open={open}
      onClose={onClose}
      destroyOnClose
      styles={{ body: { paddingTop: 8 } }}
    >
      {loading ? (
        <div className="flex justify-center py-12"><Spin size="large" /></div>
      ) : (
        <>
          {(company || trackingNo) && (
            <div className="mb-6 p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div className="text-sm text-gray-500 mb-1">物流公司</div>
              <div className="font-semibold text-gray-800 text-base">{company || '—'}</div>
              <div className="text-sm text-gray-500 mt-2 mb-1">运单号</div>
              <Text copyable className="font-mono text-sm">{trackingNo || '—'}</Text>
            </div>
          )}
          {list.length > 0 ? (
            <Timeline
              items={list.map((item, i) => ({
                key: i,
                color: i === 0 ? 'green' : 'gray',
                children: (
                  <div>
                    <div className="text-gray-500 text-xs">{item.time ?? ''}</div>
                    <div className="font-medium text-gray-800 mt-0.5">{item.desc ?? '—'}</div>
                  </div>
                ),
              }))}
            />
          ) : (
            !loading && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无物流信息" style={{ padding: '32px 0' }} />
          )}
        </>
      )}
    </Drawer>
  );
}

// ─── 嵌套子表：订单内产品列表 ────────────────────────────────

interface OrderProductsTableProps {
  orderId: number;
  refreshKey?: number;
  onOpenLogistics: (externalOrderId: string) => void;
  onSyncSuccess?: () => void;
}

function OrderProductsTable({ orderId, refreshKey = 0, onOpenLogistics, onSyncSuccess }: OrderProductsTableProps) {
  const [products, setProducts] = useState<OrderProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingAlibabaId, setSyncingAlibabaId] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    if (!Number.isFinite(orderId) || orderId <= 0) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setProducts([]);   // 每次请求前强制清空，确保不显示旧数据
    setLoading(true);
    try {
      const { data: res } = await request.get<{ code: number; data?: unknown }>(purchaseOrderProductsUrl(orderId));

      if (!res || res.code !== 200) {
        console.warn(`[OrderProductsTable #${orderId}] 接口返回异常:`, res);
        message.warning(`采购明细加载失败（code=${res?.code ?? 'N/A'}）`);
        setProducts([]);
        return;
      }

      // 兼容后端多种返回结构：直接数组 / { list } / { items } / { data } / { products }
      const payload = res.data;
      let rawList: unknown[];
      if (Array.isArray(payload)) {
        rawList = payload;
      } else if (payload && typeof payload === 'object') {
        const obj = payload as Record<string, unknown>;
        rawList = (
          Array.isArray(obj.list)     ? obj.list     :
          Array.isArray(obj.items)    ? obj.items    :
          Array.isArray(obj.data)     ? obj.data     :
          Array.isArray(obj.products) ? obj.products :
          []
        );
      } else {
        rawList = [];
      }

      console.log(`[OrderProductsTable #${orderId}] rawList.length=`, rawList.length, rawList[0]);
      setProducts(rawList.map((r) => normalizeOrderProduct(typeof r === 'object' && r != null ? (r as Record<string, unknown>) : {})));
    } catch (err) {
      console.error(`[OrderProductsTable #${orderId}] 请求异常:`, err);
      message.error('采购明细加载出错，请重试');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts, refreshKey]);

  const handleSyncRow = useCallback(async (externalOrderId: string) => {
    setSyncingAlibabaId(externalOrderId);
    try {
      const { data: res } = await request.post<{ code: number; message?: string }>(
        '/procurement/sync-1688-order',
        { externalOrderId },
      );
      if (res?.code === 200) {
        message.success('同步成功');
        fetchProducts();
        onSyncSuccess?.();
      } else {
        message.error(res?.message ?? '同步失败');
      }
    } catch {
      message.error('同步失败，请检查网络');
    } finally {
      setSyncingAlibabaId(null);
    }
  }, [fetchProducts, onSyncSuccess]);

  // 子表表头弱化：透明底 + 浅色字 + 不加粗，融入 #f5f7fa 背景
  const SUB_HEADER: React.CSSProperties = {
    background:  'transparent',
    color:       '#999',
    fontWeight:  400,
    fontSize:    12,
    borderBottom: '1px solid #ececec',
  };

  const subColumns = useMemo<ColumnsType<OrderProduct>>(() => [
    {
      // 图片：固定小宽，紧凑展示
      title: <span style={SUB_HEADER}>图片</span>, dataIndex: 'imageUrl', width: 56,
      onHeaderCell: () => ({ style: SUB_HEADER }),
      render: (url: string | null) =>
        url
          ? <Image src={url} width={36} height={36} style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid #f0f0f0' }} preview={{ mask: <SearchOutlined style={{ fontSize: 9 }} /> }} />
          : <div style={{ width: 36, height: 36, borderRadius: 4, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ShoppingOutlined style={{ color: '#ccc', fontSize: 14 }} /></div>,
    },
    {
      // SKU：固定宽度
      title: 'SKU', dataIndex: 'sku', width: 130,
      onHeaderCell: () => ({ style: SUB_HEADER }),
      render: (v: string | null) => v
        ? <span style={{ fontFamily: "'Inter', monospace", fontSize: 12, letterSpacing: 0.3, color: '#374151' }}>{v}</span>
        : <span style={{ color: '#d9d9d9' }}>—</span>,
    },
    {
      // 中文名：定宽紧凑，超长单行省略（列 ellipsis 悬停出 Tooltip），不拉宽右侧财务列
      title: '中文名', dataIndex: 'chineseName', width: 260, ellipsis: true,
      onHeaderCell: () => ({ style: SUB_HEADER }),
      render: (v: string | null) => v
        ? <span style={{ fontSize: 12, color: '#374151' }}>{v}</span>
        : <span style={{ color: '#d9d9d9' }}>—</span>,
    },
    {
      title: '采购链接', dataIndex: 'purchaseUrl', width: 80, align: 'center' as const,
      onHeaderCell: () => ({ style: SUB_HEADER }),
      render: (v: string | null) => v
        ? <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => window.open(v, '_blank', 'noreferrer,noopener')} style={{ padding: 0, fontSize: 12 }}>货源</Button>
        : <span style={{ color: '#d9d9d9' }}>—</span>,
    },
    {
      title: '采购价', dataIndex: 'purchasePrice', width: 100, align: 'right' as const,
      onHeaderCell: () => ({ style: SUB_HEADER }),
      render: (v: string | number | null) => {
        const s = fmtMoney(v);
        return s === '-'
          ? <span style={{ color: '#d9d9d9' }}>—</span>
          : <span style={{ fontWeight: 500, color: '#b45309', fontFeatureSettings: '"tnum"', fontSize: 12 }}>{s}</span>;
      },
    },
    {
      title: '数量', dataIndex: 'purchaseQuantity', width: 70, align: 'center' as const,
      onHeaderCell: () => ({ style: SUB_HEADER }),
      render: (v: number | null) => v != null
        ? <span style={{ fontFeatureSettings: '"tnum"', fontSize: 12, color: '#374151' }}>{v}</span>
        : <span style={{ color: '#d9d9d9' }}>—</span>,
    },
    {
      title: '合计', key: 'subtotal', width: 110, align: 'right' as const,
      onHeaderCell: () => ({ style: SUB_HEADER }),
      render: (_: unknown, record: OrderProduct) => {
        const sub = toNum(record.purchasePrice) * toNum(record.purchaseQuantity);
        return sub > 0
          ? <span style={{ fontWeight: 600, color: '#1e293b', fontFeatureSettings: '"tnum"', fontSize: 12 }}>{fmtMoney(sub)}</span>
          : <span style={{ color: '#d9d9d9' }}>—</span>;
      },
    },
    {
      title: '平台状态', dataIndex: 'alibabaOrderStatus', width: 100, align: 'center' as const,
      onHeaderCell: () => ({ style: SUB_HEADER }),
      render: (v: string | null) => {
        if (!v) return <span style={{ color: '#d9d9d9' }}>—</span>;
        const cfg = ALIBABA_STATUS_MAP[v] ?? { label: v, color: 'default' };
        return <Tag color={cfg.color} bordered={false} style={{ fontWeight: 400, borderRadius: 4, fontSize: 11 }}>{cfg.label}</Tag>;
      },
    },
    {
      title: '平台金额', key: 'alibabaAmount', width: 120, align: 'right' as const,
      onHeaderCell: () => ({ style: SUB_HEADER }),
      render: (_: unknown, record: OrderProduct) => {
        const amt = toNum(record.alibabaTotalAmount);
        const fee = toNum(record.shippingFee);
        if (!amt) return <span style={{ color: '#d9d9d9' }}>—</span>;
        return (
          <span>
            <span style={{ fontWeight: 500, color: '#1890ff', fontFeatureSettings: '"tnum"', fontSize: 12 }}>{fmtMoney(amt)}</span>
            {fee > 0 && <div style={{ color: '#aaa', fontSize: 11, marginTop: 1 }}>运费 {fmtMoney(fee)}</div>}
          </span>
        );
      },
    },
    {
      title: '操作', key: 'subActions', width: 100, align: 'center' as const,
      onHeaderCell: () => ({ style: SUB_HEADER }),
      render: (_: unknown, record: OrderProduct) => {
        const eid = record.externalOrderId;
        if (!eid) return <span style={{ color: '#d9d9d9' }}>—</span>;
        const isSyncing = syncingAlibabaId === eid;
        const isShipped = record.alibabaOrderStatus === 'seller_send' || record.alibabaOrderStatus === 'finish';
        return (
          <Space size={2}>
            <Button
              type="link"
              size="small"
              icon={<SyncOutlined spin={isSyncing} />}
              loading={isSyncing}
              disabled={isSyncing}
              style={{ fontSize: 12, padding: '0 4px', color: '#64748b' }}
              onClick={() => handleSyncRow(eid)}
            >
              同步
            </Button>
            {isShipped && (
              <Button
                type="link"
                size="small"
                icon={<CarOutlined />}
                style={{ fontSize: 12, padding: '0 4px', color: '#64748b' }}
                onClick={() => onOpenLogistics(eid)}
              >
                物流
              </Button>
            )}
          </Space>
        );
      },
    },
  ], [handleSyncRow, onOpenLogistics, syncingAlibabaId]);

  return (
    <div style={{
      margin: '0',
      padding: '8px 16px 12px 50px', /* paddingLeft:50px 对齐主表内容列（跳过 expand icon 列 ~48px） */
      background: '#f5f7fa',
      borderTop: '1px solid #e8ecf0',
      borderRadius: '0 0 8px 8px',
    }}>
    <Table
      rowKey="id"
      dataSource={products}
      columns={subColumns}
      loading={loading}
      pagination={false}
      size="small"
      bordered={false}
      scroll={{ x: 'max-content' }}
      style={{ background: 'transparent' }}
      className="sub-order-table"
    />
    </div>
  );
}

// ─── 向 1688 下单弹窗（双 Tab） ────────────────────────────────

interface Place1688OrderModalProps {
  record:    PurchaseOrder | null;
  onCancel:  () => void;
  onSuccess: () => void;
}

/**
 * 映射状态三级判断：
 *   'none'    → 没有商品 ID（完全未绑定）
 *   'no_sku'  → 有商品 ID 但缺 specId（无法下单）
 *   'ok'      → 商品 ID + specId 均具备（可下单）
 */
function getMappingStatus(p: OrderProduct): 'none' | 'no_sku' | 'ok' {
  const hasProduct = !!(p.alibabaOfferId || p.externalProductId);
  const hasSku     = !!p.externalSkuId;
  if (!hasProduct) return 'none';
  if (!hasSku)     return 'no_sku';
  return 'ok';
}

/** 判断单个产品是否已完成 1688 完整映射（商品 ID + specId 均非空） */
function isProductMapped(p: OrderProduct): boolean {
  return getMappingStatus(p) === 'ok';
}

function Place1688OrderModal({ record, onCancel, onSuccess }: Place1688OrderModalProps) {
  const [activeTabKey, setActiveTabKey] = useState<'auto' | 'manual'>('auto');

  // ── Tab 1 状态（自动下单） ──
  const [addrForm]    = Form.useForm<{ addressId: string }>();
  const [addresses,   setAddresses]   = useState<AliAddress[]>([]);
  const [addrLoading, setAddrLoading] = useState(false);
  const [autoSubmitting, setAutoSubmitting] = useState(false);

  // ── 产品明细（映射核对表） ──
  const [products,      setProducts]      = useState<OrderProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  // 本次下单中临时排除的产品 ID（不影响原单据）
  const [excludedIds,   setExcludedIds]   = useState<Set<number>>(new Set());
  // 规格补全子弹窗：当前待补全 specId 的产品
  const [specEditTarget, setSpecEditTarget] = useState<OrderProduct | null>(null);

  // ── Tab 2 状态（手动关联） ──
  const [bindForm]    = Form.useForm<{ alibabaOrderId: string }>();
  const [bindSubmitting, setBindSubmitting] = useState(false);

  // 每次弹窗打开时：重置状态、拉取地址 & 产品
  useEffect(() => {
    if (!record) {
      addrForm.resetFields();
      bindForm.resetFields();
      setProducts([]);
      setExcludedIds(new Set());
      return;
    }
    setActiveTabKey('auto');
    addrForm.resetFields();
    bindForm.resetFields();
    setExcludedIds(new Set());

    // 并行拉取收货地址 & 产品明细
    setAddrLoading(true);
    request.get<{ code: number; data: AliAddress[]; message: string }>('/alibaba/addresses')
      .then(({ data: res }) => {
        if (res.code === 200 && Array.isArray(res.data)) {
          setAddresses(res.data);
          const def = res.data.find((a) => a.isDefault);
          if (def) addrForm.setFieldValue('addressId', def.addressId);
        } else {
          message.warning(res.message || '获取收货地址失败');
        }
      })
      .catch(() => message.error('获取收货地址失败，请检查网络'))
      .finally(() => setAddrLoading(false));

    setProductsLoading(true);
    request.get<{ code: number; data?: unknown[] }>(purchaseOrderProductsUrl(record.id))
      .then(({ data: res }) => {
        const raw = Array.isArray(res?.data) ? res.data : [];
        setProducts(raw.map((r) =>
          normalizeOrderProduct(typeof r === 'object' && r != null ? (r as Record<string, unknown>) : {}),
        ));
      })
      .catch(() => { /* silent, table 会展示空 */ })
      .finally(() => setProductsLoading(false));
  }, [record, addrForm, bindForm]);

  // ── 映射防呆核算：当前未排除产品中，是否存在未映射的 ──
  const activeProducts = products.filter((p) => !excludedIds.has(p.id));
  const unmappedProducts = activeProducts.filter((p) => !isProductMapped(p));
  const hasUnmapped = unmappedProducts.length > 0;
  // 全部被排除时，也不允许提交（没有任何产品可下单）
  const canSubmit = !hasUnmapped && activeProducts.length > 0;

  // Tab 1：自动下单
  const handleAutoSubmit = async () => {
    let values: { addressId: string };
    try { values = await addrForm.validateFields(); } catch { return; }
    if (!record) return;
    setAutoSubmitting(true);
    try {
      const { data: res } = await request.post<{ code: number; message: string }>(
        `/purchases/${record.id}/place-1688-order`,
        {
          addressId: values.addressId,
          // 把排除的产品 ID 告知后端（可选；后端若不支持则无副作用）
          excludedProductIds: excludedIds.size > 0 ? [...excludedIds] : undefined,
        },
      );
      if (res.code === 200) { message.success(res.message || '1688 下单成功！'); onSuccess(); }
      else { message.error(res.message || '下单失败，请重试'); }
    } catch { message.error('网络异常，下单失败，请重试'); }
    finally { setAutoSubmitting(false); }
  };

  // Tab 2：手动绑定
  const handleBindSubmit = async () => {
    let values: { alibabaOrderId: string };
    try { values = await bindForm.validateFields(); } catch { return; }
    if (!record) return;
    setBindSubmitting(true);
    try {
      const { data: res } = await request.post<{ code: number; message: string }>(
        `/purchases/${record.id}/bind-1688-order`,
        { alibabaOrderId: values.alibabaOrderId.trim() },
      );
      if (res.code === 200) { message.success(res.message || '1688 订单关联成功！'); onSuccess(); }
      else { message.error(res.message || '关联失败，请检查单号后重试'); }
    } catch { message.error('网络异常，请重试'); }
    finally { setBindSubmitting(false); }
  };

  // 规格补全成功回调：原地更新 products 列表，触发 canSubmit 重算
  const handleSpecMapped = useCallback((productId: number, specId: string) => {
    setProducts((prev) =>
      prev.map((p) => p.id === productId ? { ...p, externalSkuId: specId } : p),
    );
    setSpecEditTarget(null);
    message.success('规格映射成功！下单条件已满足，可以提交。');
  }, []);

  // ── 映射核对表 columns ──
  const mappingColumns: ColumnsType<OrderProduct> = [
    {
      title: '本地 SKU 信息',
      key: 'skuInfo',
      width: 260,
      render: (_: unknown, p: OrderProduct) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Image
            src={p.imageUrl ?? undefined}
            width={40}
            height={40}
            style={{ objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
            preview={false}
            fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%23f0f0f0'/%3E%3C/svg%3E"
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: '#1e293b' }}>
              {p.sku ?? p.pnk}
            </div>
            {p.chineseName && (
              <div style={{
                fontSize: 11, color: '#6b7280', marginTop: 2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180,
              }}>
                {p.chineseName}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      title: '1688 映射状态',
      key: 'mappingStatus',
      width: 240,
      render: (_: unknown, p: OrderProduct) => {
        const excluded = excludedIds.has(p.id);
        if (excluded) {
          return <Tag color="default" style={{ fontSize: 11 }}>已移除（本次不下单）</Tag>;
        }

        const status = getMappingStatus(p);

        if (status === 'ok') {
          const offerId = p.alibabaOfferId ?? p.externalProductId;
          return (
            <div>
              <Tag color="success" style={{ fontSize: 11, marginBottom: 2 }}>已映射完备</Tag>
              {offerId && (
                <div style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace', marginTop: 2 }}>
                  商品：{offerId}
                </div>
              )}
              {p.externalSkuId && (
                <div style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace' }}>
                  规格：{p.externalSkuId}
                </div>
              )}
            </div>
          );
        }

        if (status === 'no_sku') {
          return (
            <div>
              <Tag color="warning" style={{ fontSize: 11, marginBottom: 4, fontWeight: 600 }}>
                缺规格 (specId)
              </Tag>
              <div style={{ fontSize: 10, color: '#d4380d', lineHeight: 1.5, marginBottom: 6 }}>
                已绑定商品，但缺少规格选择
              </div>
              <Button
                type="link"
                size="small"
                icon={<SettingOutlined />}
                style={{ padding: 0, fontSize: 11, color: '#fa8c16', fontWeight: 600 }}
                onClick={() => setSpecEditTarget(p)}
              >
                一键补全规格
              </Button>
            </div>
          );
        }

        // status === 'none'
        return (
          <Tag
            color="error"
            style={{ fontSize: 11, padding: '2px 8px', fontWeight: 600, lineHeight: '20px' }}
          >
            ⚠ 未绑定商品
          </Tag>
        );
      },
    },
    {
      title: '采购数量',
      dataIndex: 'purchaseQuantity',
      width: 80,
      align: 'center' as const,
      render: (v: number | null) => (
        <span style={{ fontWeight: 600, color: '#374151' }}>{v ?? '—'}</span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      align: 'center' as const,
      render: (_: unknown, p: OrderProduct) => {
        const excluded = excludedIds.has(p.id);
        return excluded ? (
          <Button
            type="link"
            size="small"
            style={{ fontSize: 11, padding: 0, color: '#6b7280' }}
            onClick={() => setExcludedIds((prev) => { const s = new Set(prev); s.delete(p.id); return s; })}
          >
            恢复
          </Button>
        ) : (
          <Button
            type="link"
            size="small"
            danger
            style={{ fontSize: 11, padding: 0 }}
            onClick={() => setExcludedIds((prev) => new Set(prev).add(p.id))}
          >
            移除
          </Button>
        );
      },
    },
  ];

  // ── 动态底部按钮（根据当前 Tab 切换） ──
  const footer = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <Button onClick={onCancel}>取消</Button>
      {activeTabKey === 'auto' ? (
        <Tooltip
          title={!canSubmit ? (hasUnmapped ? '存在未映射产品，请移除或先完成映射' : '没有待下单产品') : undefined}
        >
          <Button
            type="primary"
            loading={autoSubmitting}
            disabled={!canSubmit}
            style={canSubmit ? { background: '#fa8c16', borderColor: '#fa8c16' } : {}}
            onClick={handleAutoSubmit}
          >
            确认自动下单
          </Button>
        </Tooltip>
      ) : (
        <Button type="primary" loading={bindSubmitting} onClick={handleBindSubmit}>
          确认关联
        </Button>
      )}
    </div>
  );

  return (
    <Modal
      title={
        <span>
          <ShoppingCartOutlined style={{ color: '#fa8c16', marginRight: 8 }} />
          1688 下单
          {record && (
            <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#9ca3af', fontWeight: 400, marginLeft: 12 }}>
              {record.orderNo}
            </span>
          )}
        </span>
      }
      open={!!record}
      onCancel={onCancel}
      footer={footer}
      width={900}
      destroyOnClose
      maskClosable={false}
      styles={{ body: { maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' } }}
    >
      <Tabs
        activeKey={activeTabKey}
        onChange={(k) => setActiveTabKey(k as 'auto' | 'manual')}
        size="small"
        style={{ marginTop: 0 }}
        items={[
          {
            key: 'auto',
            label: '1688 自动下单',
            children: (
              <div style={{ paddingTop: 4 }}>

                {/* ── 防呆 Alert（有未映射产品时展示） ── */}
                {hasUnmapped && !productsLoading && (
                  <Alert
                    type="error"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message={`⚠️ 订单中存在 ${unmappedProducts.length} 个未映射 1688 的产品，无法合并自动下单`}
                    description='请先去产品库完成 1688 商品映射（填写 offerId），或点击下方"移除"将未映射产品排除后再下单，也可切换到右侧【手动绑定】模式。'
                  />
                )}

                {/* ── 映射核对明细表 ── */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                    产品映射核对
                    <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 12, marginLeft: 8 }}>
                      共 {products.length} 件产品，
                      <span style={{ color: '#52c41a' }}>{products.filter(isProductMapped).length} 已映射</span>
                      {unmappedProducts.length > 0 && (
                        <span style={{ color: '#f5222d', marginLeft: 4 }}>{unmappedProducts.length} 未映射</span>
                      )}
                      {excludedIds.size > 0 && (
                        <span style={{ color: '#d9d9d9', marginLeft: 4 }}>{excludedIds.size} 已移除</span>
                      )}
                    </span>
                  </div>
                  <Table<OrderProduct>
                    rowKey="id"
                    size="small"
                    dataSource={products}
                    columns={mappingColumns}
                    loading={productsLoading}
                    pagination={false}
                    scroll={{ y: 240, x: 640 }}
                    rowClassName={(p) =>
                      excludedIds.has(p.id)
                        ? 'opacity-40'
                        : !isProductMapped(p)
                          ? 'bg-red-50'
                          : ''
                    }
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无产品数据" /> }}
                  />
                </div>

                {/* ── 地址选择（有可下单产品时显示） ── */}
                {canSubmit && (
                  <Form form={addrForm} layout="vertical" requiredMark={false}>
                    <Form.Item
                      label={
                        <span>
                          <EnvironmentOutlined style={{ marginRight: 6, color: '#fa8c16' }} />
                          选择收货地址
                        </span>
                      }
                      name="addressId"
                      rules={[{ required: true, message: '请选择收货地址' }]}
                    >
                      <Select
                        placeholder={addrLoading ? '正在加载地址…' : '请选择收货地址'}
                        loading={addrLoading}
                        disabled={addrLoading}
                        optionLabelProp="label"
                        style={{ width: '100%' }}
                        dropdownStyle={{ maxHeight: 320 }}
                      >
                        {addresses.map((addr) => {
                          const fullAddr = [addr.provinceText, addr.cityText, addr.areaText, addr.townText, addr.address]
                            .filter(Boolean).join(' ');
                          return (
                            <Select.Option
                              key={addr.addressId}
                              value={addr.addressId}
                              label={
                                <span>
                                  {addr.isDefault && <Tag color="orange" style={{ marginRight: 6, fontSize: 11 }}>默认</Tag>}
                                  {addr.fullName}
                                  <span style={{ color: '#888', marginLeft: 8, fontSize: 12 }}>{addr.mobile}</span>
                                </span>
                              }
                            >
                              <div style={{ lineHeight: 1.6 }}>
                                <div style={{ fontWeight: 500 }}>
                                  {addr.fullName}
                                  <span style={{ color: '#888', marginLeft: 8, fontSize: 12 }}>{addr.mobile}</span>
                                  {addr.isDefault && <Tag color="orange" style={{ marginLeft: 8, fontSize: 11 }}>默认</Tag>}
                                </div>
                                <div style={{ color: '#999', fontSize: 12, marginTop: 2 }}>{fullAddr}</div>
                              </div>
                            </Select.Option>
                          );
                        })}
                      </Select>
                    </Form.Item>
                  </Form>
                )}

                <div style={{ color: '#888', fontSize: 12 }}>
                  {canSubmit
                    ? `将对此采购单下 ${activeProducts.length} 件已映射产品发起真实 1688 下单，请确认地址无误后提交。`
                    : hasUnmapped
                      ? '请移除未映射产品，或先完成映射后再使用自动下单功能。'
                      : '没有待下单的产品。'}
                </div>
              </div>
            ),
          },
          {
            key: 'manual',
            label: '关联 1688 订单（手动）',
            children: (
              <div style={{ paddingTop: 8 }}>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="手动回填适用于已在 1688 平台完成下单，需将订单号与本系统采购单关联的场景。"
                />
                <Form form={bindForm} layout="vertical" requiredMark={false}>
                  <Form.Item
                    label="1688 订单号（必填）"
                    name="alibabaOrderId"
                    rules={[
                      { required: true, message: '请输入 1688 订单号' },
                      { whitespace: true, message: '订单号不能为空白字符' },
                    ]}
                  >
                    <Input
                      placeholder="请输入 1688 平台的订单号"
                      allowClear
                      prefix={<LinkOutlined style={{ color: '#bbb' }} />}
                    />
                  </Form.Item>
                </Form>
                <div style={{ color: '#888', fontSize: 12 }}>
                  关联成功后，该采购单状态将更新为"采购中"，并可在下方明细中同步查看物流进度。
                </div>
              </div>
            ),
          },
        ]}
      />

      {/* 规格补全子弹窗：在主 Modal 内部挂载，不打断下单流程 */}
      <SpecSelectModal
        product={specEditTarget}
        onCancel={() => setSpecEditTarget(null)}
        onSuccess={handleSpecMapped}
      />
    </Modal>
  );
}

// ─── 确认入库弹窗（实盘核对版）────────────────────────────────

interface WarehouseOption {
  id:   number;
  name: string;
}

// 核对行：在 OrderProduct 基础上加已入库量（只读）+ 本次入库量（可编辑）
interface ReceiveRow extends OrderProduct {
  alreadyReceived:  number;   // 历次已入库数量（后端返回，只读）
  receivedQuantity: number;   // 本次实际入库量（用户填写）
}

interface StockInModalProps {
  record:    PurchaseOrder | null;
  onCancel:  () => void;
  onSuccess: () => void;
  /**
   * 可选：上层已缓存的产品明细（如展开子表时已拉取过）。
   * 当 /products 接口未返回 receivedQuantity 时，作为双保险兜底来源。
   * 上层传入 undefined 时忽略，不影响现有逻辑。
   */
  prefetchedItems?: Array<{
    id:                number;
    receivedQuantity?: number | null;
    received_quantity?: number | null;
  }>;
}

function StockInModal({ record, onCancel, onSuccess, prefetchedItems }: StockInModalProps) {
  const [warehouses,   setWarehouses]   = useState<WarehouseOption[]>([]);
  const [whLoading,    setWhLoading]    = useState(false);
  const [warehouseId,  setWarehouseId]  = useState<number | undefined>(undefined);
  const [rows,         setRows]         = useState<ReceiveRow[]>([]);
  const [prodLoading,  setProdLoading]  = useState(false);
  const [submitting,   setSubmitting]   = useState(false);

  // 从上层预传的明细数据构建 { productId → receivedQuantity } 兜底 Map
  // 仅当值 > 0 时才写入，确保不会把"确实是 0"误覆盖成无效数据
  const prefetchMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const item of prefetchedItems ?? []) {
      const qty = Number(item.receivedQuantity ?? item.received_quantity ?? 0) || 0;
      if (qty > 0) m.set(item.id, qty);
    }
    return m;
  }, [prefetchedItems]);

  // 弹窗打开时：并发拉取仓库列表 + 商品明细
  useEffect(() => {
    if (!record) {
      setRows([]);
      setWarehouseId(undefined);
      return;
    }

    // ★ 关键修复：立即用 record 上的仓库 ID 初始化 state，不等异步列表加载
    //   这样即使仓库列表还在 loading，handleOk 也能拿到正确的 warehouseId
    const boundWhId = record.warehouseId ?? record.warehouse?.id ?? undefined;
    setWarehouseId(boundWhId ?? undefined);

    // ── 拉仓库列表（仅为了显示仓库名称，不影响提交逻辑）────────
    setWhLoading(true);
    request.get<{ code: number; data: WarehouseOption[] | { list: WarehouseOption[] }; message: string }>(
      '/warehouses',
    ).then(({ data: res }) => {
      if (res.code === 200) {
        const list = Array.isArray(res.data)
          ? res.data
          : Array.isArray((res.data as { list: WarehouseOption[] }).list)
            ? (res.data as { list: WarehouseOption[] }).list
            : [];
        setWarehouses(list);
        // 若 record 无绑定仓库，自动选唯一仓库
        if (!boundWhId && list.length === 1) {
          setWarehouseId(list[0].id);
        }
      } else {
        message.warning(res.message || '获取仓库列表失败');
      }
    }).catch(() => message.error('获取仓库列表失败'))
      .finally(() => setWhLoading(false));

    // ── 拉商品明细 ───────────────────────────────────────────
    setProdLoading(true);
    request.get<{ code: number; data?: unknown }>(
      `/purchases/${record.id}/products`,
    ).then(({ data: res }) => {
      const payload = res?.data;
      let rawList: unknown[];
      if (Array.isArray(payload)) {
        rawList = payload;
      } else if (payload && typeof payload === 'object') {
        const obj = payload as Record<string, unknown>;
        rawList = Array.isArray(obj.list) ? obj.list
          : Array.isArray(obj.items)      ? obj.items
          : Array.isArray(obj.data)       ? obj.data
          : Array.isArray(obj.products)   ? obj.products
          : [];
      } else {
        rawList = [];
      }
      console.log('【入库弹窗】后端返回的原始明细数据(rawList):', rawList);
      const products = rawList.map((r) => {
        const raw = typeof r === 'object' && r != null ? (r as Record<string, unknown>) : {};
        const base = normalizeOrderProduct(raw);
        // 第一优先：从 fetch 返回的原始字段中提取已入库数量（支持多种命名变体）
        const alreadyFromFetch = Number(
          raw.receivedQuantity ?? raw.received_quantity ??
          raw.alreadyReceived  ?? raw.already_received  ??
          raw.receivedQty      ?? raw.received_qty      ??
          raw.stockInQty       ?? raw.stock_in_qty      ?? 0,
        ) || 0;
        // 第二保险：fetch 数据缺失（为 0）时，回退到上层预传的 prefetchMap
        const already = alreadyFromFetch > 0
          ? alreadyFromFetch
          : (prefetchMap.get(Number(raw.id)) ?? 0);
        console.log('【入库弹窗】单品原始字段:', raw, '→ fetchAlready:', alreadyFromFetch, '→ 最终 already:', already);
        return { ...base, _alreadyReceived: already };
      });
      // 默认本次入库量 = max(0, 采购数量 - 历次已入库量)，防止多入库
      setRows(products.map((p) => ({
        ...p,
        alreadyReceived:  p._alreadyReceived as number,
        receivedQuantity: Math.max(0, (p.purchaseQuantity ?? 0) - (p._alreadyReceived as number)),
      })));
    }).catch(() => message.error('获取商品明细失败'))
      .finally(() => setProdLoading(false));
  }, [record]);

  // 修改某行的实际入库量
  const handleQtyChange = (productId: number, val: number | null) => {
    setRows((prev) =>
      prev.map((r) => r.id === productId ? { ...r, receivedQuantity: val ?? 0 } : r),
    );
  };

  const handleOk = async () => {
    if (!record) return;
    // ★ 提交时优先从 record 直接取仓库 ID，state 作为次选（处理用户手动选择的情况）
    const finalWhId = warehouseId ?? record.warehouseId ?? record.warehouse?.id;
    if (!finalWhId) { message.warning('请先选择入库仓库'); return; }
    if (rows.length === 0) { message.warning('当前采购单无商品明细，无法入库'); return; }

    setSubmitting(true);
    try {
      const { data: res } = await request.post<{ code: number; message: string }>(
        `/purchases/${record.id}/stock-in`,
        {
          warehouseId: finalWhId,
          items: rows.map((r) => ({
            productId:        r.id,
            sku:              r.sku,
            receivedQuantity: r.receivedQuantity,
          })),
        },
      );
      if (res.code === 200) {
        message.success(res.message || '入库成功，库存已更新');
        onSuccess();
      } else {
        message.error(res.message || '入库失败，请重试');
      }
    } catch { message.error('网络异常，入库失败，请重试'); }
    finally { setSubmitting(false); }
  };

  // 汇总：采购总数 vs 实际入库总数
  const totalPurchased = rows.reduce((s, r) => s + (r.purchaseQuantity ?? 0), 0);
  const totalReceived  = rows.reduce((s, r) => s + r.receivedQuantity, 0);
  const hasShortage    = totalReceived < totalPurchased;

  const receiveColumns: ColumnsType<ReceiveRow> = [
    {
      title: '图片', dataIndex: 'imageUrl', width: 52,
      render: (url: string | null) => url
        ? <Image src={url} width={36} height={36} style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid #f0f0f0' }} preview={false} />
        : <div style={{ width: 36, height: 36, borderRadius: 4, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShoppingOutlined style={{ color: '#ccc', fontSize: 14 }} />
          </div>,
    },
    {
      title: 'SKU', dataIndex: 'sku', width: 130, ellipsis: true,
      render: (v: string | null) => v
        ? <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#374151' }}>{v}</span>
        : <span style={{ color: '#ccc' }}>—</span>,
    },
    {
      title: '商品名称', dataIndex: 'chineseName', ellipsis: true,
      render: (v: string | null) => v ?? <span style={{ color: '#ccc' }}>—</span>,
    },
    {
      title: '采购数量', dataIndex: 'purchaseQuantity', width: 80, align: 'center' as const,
      render: (v: number | null) => (
        <span style={{ color: '#6b7280', fontSize: 13 }}>{v ?? 0}</span>
      ),
    },
    {
      // 历次已入库量（只读，后端返回）
      title: (
        <span>
          已入库量
          <span style={{ fontSize: 11, color: '#52c41a', fontWeight: 400, marginLeft: 4 }}>（历次）</span>
        </span>
      ),
      dataIndex: 'alreadyReceived',
      width: 100,
      align: 'center' as const,
      render: (v: number) => (
        <span style={{ fontSize: 13, color: v > 0 ? '#15803d' : '#d1d5db', fontWeight: v > 0 ? 600 : 400 }}>
          {v}
        </span>
      ),
    },
    {
      // ★ 核心列：本次入库量，默认 = max(0, 采购量 - 已入库量)，允许修改
      title: (
        <span>
          本次入库量
          <span style={{ fontSize: 11, color: '#faad14', fontWeight: 400, marginLeft: 4 }}>（可改）</span>
        </span>
      ),
      dataIndex: 'receivedQuantity',
      width: 130,
      align: 'center' as const,
      render: (_: number, row: ReceiveRow) => {
        const remaining = Math.max(0, (row.purchaseQuantity ?? 0) - row.alreadyReceived);
        return (
          <InputNumber
            min={0}
            max={remaining > 0 ? remaining : (row.purchaseQuantity ?? 9999)}
            value={row.receivedQuantity}
            onChange={(val) => handleQtyChange(row.id, val)}
            size="small"
            style={{ width: 90 }}
            status={row.receivedQuantity < remaining ? 'warning' : undefined}
          />
        );
      },
    },
  ];

  return (
    <Modal
      title={
        <span>
          <InboxOutlined style={{ color: '#52c41a', marginRight: 8 }} />
          确认入库 · 实盘核对
          <span style={{ marginLeft: 10, fontSize: 12, color: '#64748b', fontWeight: 400 }}>
            采购单：<span style={{ fontFamily: 'monospace' }}>{record?.orderNo}</span>
          </span>
        </span>
      }
      open={!!record}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={submitting}
      okText="确认入库"
      cancelText="取消"
      okButtonProps={{ style: { background: '#52c41a', borderColor: '#52c41a' } }}
      width={720}
      destroyOnClose
      maskClosable={false}
    >
      {/* 仓库选择 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: '#374151', flexShrink: 0 }}>
          入库仓库<span style={{ color: '#ff4d4f' }}>*</span>
        </span>
        <Select
          style={{ width: 220 }}
          placeholder={whLoading ? '加载中…' : '请选择入库仓库'}
          loading={whLoading}
          // 仅在"已绑定仓库"时禁用，加载中不禁用（防止死锁）
          disabled={!!(record?.warehouseId || record?.warehouse?.id)}
          value={warehouseId}
          onChange={setWarehouseId}
          optionFilterProp="label"
          showSearch
          notFoundContent={<div style={{ textAlign: 'center', color: '#999', padding: '8px 0', fontSize: 12 }}>暂无仓库，请先创建</div>}
        >
          {warehouses.map((wh) => (
            <Select.Option key={wh.id} value={wh.id} label={wh.name}>{wh.name}</Select.Option>
          ))}
        </Select>
        {(record?.warehouseId || record?.warehouse?.id) && (
          <span style={{ fontSize: 11, color: '#52c41a' }}>（已绑定，不可更改）</span>
        )}
      </div>

      {/* 商品实盘核对表格 */}
      <Table<ReceiveRow>
        rowKey="id"
        dataSource={rows}
        columns={receiveColumns}
        loading={prodLoading}
        pagination={false}
        size="small"
        scroll={{ y: 320, x: 'max-content' }}
        locale={{ emptyText: prodLoading ? '加载商品明细中…' : '暂无商品明细' }}
        style={{ marginBottom: 12 }}
      />

      {/* 底部汇总栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px', background: hasShortage ? '#fffbe6' : '#f6ffed',
        border: `1px solid ${hasShortage ? '#ffe58f' : '#b7eb8f'}`, borderRadius: 8, fontSize: 13 }}>
        <span style={{ color: '#6b7280' }}>
          共 <b>{rows.length}</b> 个 SKU
        </span>
        <span>
          采购总数：<b style={{ color: '#374151' }}>{totalPurchased}</b>
          <span style={{ margin: '0 12px', color: '#d9d9d9' }}>|</span>
          本次入库：
          <b style={{ color: hasShortage ? '#d97706' : '#15803d', fontSize: 15 }}>{totalReceived}</b>
          {hasShortage && (
            <span style={{ marginLeft: 8, color: '#d97706', fontSize: 12 }}>
              ⚠ 短少 {totalPurchased - totalReceived} 件，请确认
            </span>
          )}
        </span>
      </div>
    </Modal>
  );
}
