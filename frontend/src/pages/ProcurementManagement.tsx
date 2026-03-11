import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Table, Tag, Button, Tooltip, message, Empty, Image, Typography,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table/interface';
import {
  SettingOutlined, ReloadOutlined, ShoppingOutlined,
  SearchOutlined, LinkOutlined,
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

interface OrderProduct {
  id:               number;
  pnk:              string;
  sku:              string | null;
  chineseName:      string | null;
  imageUrl:         string | null;
  purchaseUrl:      string | null;
  purchasePrice:    number | null;
  purchaseQuantity: number | null;
  price:            number | null;
}

// ─── 状态标签映射 ────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PLACED:     { label: '已下单', color: 'blue' },
  IN_TRANSIT: { label: '运输中', color: 'orange' },
  RECEIVED:   { label: '已入库', color: 'green' },
};

// ─── 主组件 ──────────────────────────────────────────────────

export default function ProcurementManagement() {
  const [orders,   setOrders]   = useState<PurchaseOrder[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total,    setTotal]    = useState(0);

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
  ], []);

  // ── 嵌套子表 ──

  const expandedRowRender = useCallback((record: PurchaseOrder) => (
    <OrderProductsTable orderId={record.id} />
  ), []);

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
    </div>
  );
}

// ─── 嵌套子表：订单内产品列表 ────────────────────────────────

function OrderProductsTable({ orderId }: { orderId: number }) {
  const [products, setProducts] = useState<OrderProduct[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: res } = await request.get<{ code: number; data: OrderProduct[] }>(`/orders/${orderId}/products`);
        if (!cancelled && res.code === 200) {
          setProducts(Array.isArray(res.data) ? res.data : []);
        }
      } catch { /* silent */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [orderId]);

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
  ], []);

  return (
    <Table
      rowKey="id"
      dataSource={products}
      columns={subColumns}
      loading={loading}
      pagination={false}
      size="small"
      style={{ margin: '-4px 0' }}
    />
  );
}
