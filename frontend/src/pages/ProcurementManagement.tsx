import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Table, Tag, Button, Tooltip, message, Empty, Image, Typography, Drawer, Timeline, Space, Spin,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table/interface';
import {
  SettingOutlined, ReloadOutlined, ShoppingOutlined,
  SearchOutlined, LinkOutlined, SyncOutlined, CarOutlined,
} from '@ant-design/icons';
import request from '../lib/request';

const { Text } = Typography;

// ─── 类型定义 ────────────────────────────────────────────────

interface PurchaseOrder {
  id:          number;
  orderNo:     string;
  operator:    string;
  totalAmount: number;
  itemCount:   number;
  status:      string;
  createdAt:   string;
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
    purchaseQuantity: (raw.purchaseQuantity ?? raw.purchase_quantity ?? null) as number | null,
    price: (raw.price ?? null) as number | null,
    externalOrderId: (raw.externalOrderId ?? raw.external_order_id ?? raw.alibabaOrderId ?? raw.alibaba_order_id ?? null) as string | null | undefined,
    alibabaOrderStatus: (raw.alibabaOrderStatus ?? raw.alibaba_order_status ?? null) as string | null | undefined,
    alibabaTotalAmount: (raw.alibabaTotalAmount ?? raw.alibaba_total_amount ?? null) as number | null | undefined,
    shippingFee: (raw.shippingFee ?? raw.shipping_fee ?? null) as number | null | undefined,
    logisticsCompany: (raw.logisticsCompany ?? raw.logistics_company ?? null) as string | null | undefined,
    logisticsNo: (raw.logisticsNo ?? raw.logistics_no ?? null) as string | null | undefined,
  };
}

// ─── 状态标签映射 ────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PLACED:     { label: '已下单', color: 'blue' },
  IN_TRANSIT: { label: '运输中', color: 'orange' },
  RECEIVED:   { label: '已入库', color: 'green' },
};

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

  const fetchOrders = useCallback(async (p: number, ps: number) => {
    setLoading(true);
    try {
      const { data: res } = await request.get<{
        code: number;
        data: { list: PurchaseOrder[]; total: number };
        message: string;
      }>('/orders', { params: { page: p, pageSize: ps } });
      if (res.code === 200 && res.data) {
        setOrders(Array.isArray(res.data.list) ? res.data.list : []);
        setTotal(res.data.total ?? 0);
      } else { message.error(res.message || '获取失败'); }
    } catch { message.error('请求失败，请检查网络或后端服务'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchOrders(1, 20); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePageChange = useCallback((pag: TablePaginationConfig) => {
    const np = pag.current ?? 1;
    const ns = pag.pageSize ?? pageSize;
    setPage(np);
    setPageSize(ns);
    fetchOrders(np, ns);
  }, [fetchOrders, pageSize]);

  const handleBatchSync = useCallback(async (orderId: number) => {
    setBatchSyncingId(orderId);
    try {
      const { data: res } = await request.get<{ code: number; data?: unknown[] }>(`/orders/${orderId}/products`);
      const raw = Array.isArray(res?.data) ? res.data : [];
      const products = raw.map((r) => normalizeOrderProduct(typeof r === 'object' && r != null ? (r as Record<string, unknown>) : {}));
      const ids = [...new Set(products.map((p) => p.externalOrderId).filter((id): id is string => Boolean(id)))];
      if (ids.length === 0) {
        message.info('该采购单下暂无 1688 子单');
        return;
      }
      let ok = 0;
      for (const externalOrderId of ids) {
        const { data: syncRes } = await request.post<{ code: number; message?: string }>(
          '/procurement/sync-1688-order',
          { externalOrderId },
        );
        if (syncRes?.code === 200) ok++;
      }
      message.success(`已同步 ${ok}/${ids.length} 个子单`);
      fetchOrders(page, pageSize);
      setSubRefreshKey((k) => k + 1);
    } catch {
      message.error('同步失败，请检查网络');
    } finally {
      setBatchSyncingId(null);
    }
  }, [page, pageSize, fetchOrders]);

  const handleOpenLogistics = useCallback((externalOrderId: string) => {
    setLogisticsExternalOrderId(externalOrderId);
    setLogisticsOpen(true);
  }, []);

  const handleCloseLogistics = useCallback(() => {
    setLogisticsOpen(false);
    setLogisticsExternalOrderId(null);
  }, []);

  // ── 主表列定义 ──

  const columns = useMemo<ColumnsType<PurchaseOrder>>(() => [
    {
      title: '采购单编号', dataIndex: 'orderNo', width: 260,
      render: (v: string) => (
        <Text strong style={{ fontFamily: "'Inter', monospace", fontSize: 13, letterSpacing: 0.3 }}>{v}</Text>
      ),
    },
    {
      title: '操作员', dataIndex: 'operator', width: 120,
      render: (v: string) => <Tag bordered={false} color="blue" style={{ fontWeight: 500 }}>{v}</Tag>,
    },
    {
      title: '创建时间', dataIndex: 'createdAt', width: 180,
      render: (v: string) => {
        const d = new Date(v);
        return <Text type="secondary" style={{ fontSize: 13 }}>{d.toLocaleString('zh-CN')}</Text>;
      },
    },
    {
      title: '产品种类', dataIndex: 'itemCount', width: 100, align: 'center',
      render: (v: number) => <span className="font-semibold tabular-nums">{v}</span>,
    },
    {
      title: '总采购金额', dataIndex: 'totalAmount', width: 140, align: 'right',
      render: (v: number) => (
        <span style={{ fontWeight: 700, fontSize: 14, color: '#d4380d', fontFeatureSettings: '"tnum"' }}>
          ¥{v.toFixed(2)}
        </span>
      ),
    },
    {
      title: '状态', dataIndex: 'status', width: 100, align: 'center',
      render: (v: string) => {
        const cfg = STATUS_MAP[v] ?? { label: v, color: 'default' };
        return <Tag color={cfg.color} bordered={false} style={{ fontWeight: 600, borderRadius: 6 }}>{cfg.label}</Tag>;
      },
    },
    {
      title: '操作', key: 'actions', width: 120, fixed: 'right',
      render: (_: unknown, record: PurchaseOrder) => {
        const isSyncing = batchSyncingId === record.id;
        return (
          <Button
            type="link"
            size="small"
            icon={<SyncOutlined spin={isSyncing} />}
            loading={isSyncing}
            disabled={isSyncing}
            onClick={() => handleBatchSync(record.id)}
          >
            一键同步
          </Button>
        );
      },
    },
  ], [handleBatchSync, batchSyncingId]);

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
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => { setPage(1); fetchOrders(1, pageSize); }}>刷新</Button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <Table
          rowKey="id"
          dataSource={orders}
          columns={columns}
          loading={loading}
          size="large"
          scroll={{ x: 1100 }}
          onChange={handlePageChange}
          expandable={{ expandedRowRender }}
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
    </div>
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
    setLoading(true);
    try {
      const { data: res } = await request.get<{ code: number; data?: unknown[] }>(`/orders/${orderId}/products`);
      const raw = Array.isArray(res?.data) ? res.data : [];
      setProducts(raw.map((r) => normalizeOrderProduct(typeof r === 'object' && r != null ? (r as Record<string, unknown>) : {})));
    } catch { /* silent */ }
    finally { setLoading(false); }
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

  const subColumns = useMemo<ColumnsType<OrderProduct>>(() => [
    {
      title: '图片', dataIndex: 'imageUrl', width: 56,
      render: (url: string | null) =>
        url
          ? <Image src={url} width={40} height={40} style={{ objectFit: 'cover', borderRadius: 6, border: '1px solid #f0f0f0' }} preview={{ mask: <SearchOutlined style={{ fontSize: 10 }} /> }} />
          : <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center"><ShoppingOutlined className="text-gray-300" /></div>,
    },
    {
      title: 'SKU', dataIndex: 'sku', width: 140,
      render: (v: string | null) => v
        ? <span style={{ fontFamily: "'Inter', monospace", fontSize: 13, letterSpacing: 0.5, fontWeight: 500 }}>{v}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '中文名', dataIndex: 'chineseName', ellipsis: { showTitle: false },
      render: (v: string | null) => v
        ? <Tooltip title={v} placement="topLeft"><span style={{ fontSize: 13 }}>{v}</span></Tooltip>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '采购链接', dataIndex: 'purchaseUrl', width: 100, align: 'center',
      render: (v: string | null) => v
        ? <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => window.open(v, '_blank', 'noreferrer,noopener')} style={{ padding: 0, fontWeight: 500, fontSize: 13 }}>直达货源</Button>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '采购价', dataIndex: 'purchasePrice', width: 110, align: 'right',
      render: (v: number | null) => v != null
        ? <span style={{ fontWeight: 600, color: '#d4380d', fontFeatureSettings: '"tnum"', fontSize: 13 }}>¥{v.toFixed(2)}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '采购数量', dataIndex: 'purchaseQuantity', width: 90, align: 'center',
      render: (v: number | null) => v != null
        ? <span className="tabular-nums font-medium" style={{ fontSize: 13 }}>{v}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '合计', key: 'subtotal', width: 120, align: 'right',
      render: (_: unknown, record: OrderProduct) => {
        const sub = (record.purchasePrice ?? 0) * (record.purchaseQuantity ?? 0);
        return sub > 0
          ? <span style={{ fontWeight: 700, color: '#1e293b', fontFeatureSettings: '"tnum"', fontSize: 13 }}>¥{sub.toFixed(2)}</span>
          : <span className="text-gray-300">—</span>;
      },
    },
    {
      title: '1688 订单号', dataIndex: 'externalOrderId', width: 160,
      render: (v: string | null) => v
        ? <Text copyable style={{ fontFamily: "'Inter', monospace", fontSize: 12 }}>{v}</Text>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '平台状态', dataIndex: 'alibabaOrderStatus', width: 110, align: 'center',
      render: (v: string | null) => {
        if (!v) return <span className="text-gray-300">—</span>;
        const cfg = ALIBABA_STATUS_MAP[v] ?? { label: v, color: 'default' };
        return <Tag color={cfg.color} bordered={false} style={{ fontWeight: 500, borderRadius: 6 }}>{cfg.label}</Tag>;
      },
    },
    {
      title: '平台金额', key: 'alibabaAmount', width: 140, align: 'right',
      render: (_: unknown, record: OrderProduct) => {
        const amt = record.alibabaTotalAmount;
        const fee = record.shippingFee ?? 0;
        if (amt == null) return <span className="text-gray-300">—</span>;
        return (
          <span>
            <span style={{ fontWeight: 600, color: '#1890ff', fontFeatureSettings: '"tnum"', fontSize: 13 }}>¥{amt.toFixed(2)}</span>
            {fee > 0 && <div className="text-gray-400 text-xs mt-0.5">含运费 ¥{fee.toFixed(2)}</div>}
          </span>
        );
      },
    },
    {
      title: '操作', key: 'subActions', width: 160,
      render: (_: unknown, record: OrderProduct) => {
        const eid = record.externalOrderId;
        if (!eid) return <span className="text-gray-300">—</span>;
        const isSyncing = syncingAlibabaId === eid;
        const isShipped = record.alibabaOrderStatus === 'seller_send' || record.alibabaOrderStatus === 'finish';
        return (
          <Space size="small">
            <Button
              type="link"
              size="small"
              icon={<SyncOutlined spin={isSyncing} />}
              loading={isSyncing}
              disabled={isSyncing}
              onClick={() => handleSyncRow(eid)}
            >
              同步
            </Button>
            {isShipped && (
              <Button
                type="link"
                size="small"
                icon={<CarOutlined />}
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
    <Table
      rowKey="id"
      dataSource={products}
      columns={subColumns}
      loading={loading}
      pagination={false}
      size="small"
      scroll={{ x: 1200 }}
      style={{ margin: '-4px 0' }}
    />
  );
}
