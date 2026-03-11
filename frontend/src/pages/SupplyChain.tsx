import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Table, Tag, Button, Tooltip, message, Empty, Image, Typography,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table/interface';
import {
  SearchOutlined, ShoppingOutlined, ReloadOutlined,
  LinkOutlined, ShoppingCartOutlined,
} from '@ant-design/icons';
import request from '../lib/request';

const { Text } = Typography;

interface PurchasingProduct {
  id:               number;
  pnk:             string;
  title:           string;
  brand:           string | null;
  price:           number | null;
  imageUrl:        string | null;
  purchasePrice:   number | null;
  purchaseUrl:     string | null;
  margin:          number | null;
  sku:             string | null;
  chineseName:     string | null;
  purchaseQuantity: number | null;
  purchasePeriod:  number | null;
  length:          number | null;
  width:           number | null;
  height:          number | null;
  actualWeight:    number | null;
  updatedAt:       string;
}

export default function SupplyChain() {
  const [products, setProducts] = useState<PurchasingProduct[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total,    setTotal]    = useState(0);

  const fetchProducts = useCallback(async (p: number, ps: number) => {
    setLoading(true);
    try {
      const { data: res } = await request.get<{
        code: number;
        data: { list: PurchasingProduct[]; total: number };
        message: string;
      }>('/products/purchasing', { params: { page: p, pageSize: ps } });
      if (res.code === 200 && res.data) {
        setProducts(Array.isArray(res.data.list) ? res.data.list : []);
        setTotal(res.data.total ?? 0);
      } else { message.error(res.message || '获取失败'); }
    } catch { message.error('请求失败，请检查网络或后端服务'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchProducts(1, 20); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePageChange = useCallback((pag: TablePaginationConfig) => {
    const np = pag.current ?? 1;
    const ns = pag.pageSize ?? pageSize;
    setPage(np);
    setPageSize(ns);
    fetchProducts(np, ns);
  }, [fetchProducts, pageSize]);

  const columns = useMemo<ColumnsType<PurchasingProduct>>(() => [
    {
      title: '图片', dataIndex: 'imageUrl', width: 72,
      render: (url: string | null) =>
        url ? (
          <Image src={url} width={48} height={48}
            style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid #f0f0f0' }}
            preview={{ mask: <SearchOutlined style={{ fontSize: 12 }} /> }}
            fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect fill='%23f5f5f5' width='48' height='48'/%3E%3C/svg%3E"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center"><ShoppingOutlined className="text-gray-300" /></div>
        ),
    },
    {
      title: 'SKU', dataIndex: 'sku', width: 140,
      render: (v: string | null) => v
        ? <span style={{ fontSize: 15, fontWeight: 400, fontFamily: "'Inter', monospace", letterSpacing: 0.5 }}>{v}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '中文名', dataIndex: 'chineseName', width: 200, ellipsis: { showTitle: false },
      render: (v: string | null) => v
        ? <Tooltip title={v} placement="topLeft"><span style={{ fontSize: 14 }}>{v}</span></Tooltip>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '长*宽*高(cm)', key: 'dimensions', width: 130, align: 'center',
      render: (_: unknown, record: PurchasingProduct) => {
        const { length: l, width: w, height: h } = record;
        return l != null && w != null && h != null
          ? <span style={{ fontSize: 14, color: '#595959', fontFeatureSettings: '"tnum"' }}>{l}*{w}*{h}</span>
          : <span className="text-gray-300">—</span>;
      },
    },
    {
      title: '实重(kg)', dataIndex: 'actualWeight', width: 90, align: 'center',
      render: (v: number | null) => v != null
        ? <span style={{ fontSize: 14, color: '#595959', fontFeatureSettings: '"tnum"' }}>{v.toFixed(2)}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '售价(含税)', dataIndex: 'price', width: 110, align: 'right',
      render: (v: number | null) => {
        const n = typeof v === 'string' ? parseFloat(v) : v;
        return n != null && !isNaN(n) && n > 0
          ? <span className="font-semibold text-gray-800 tabular-nums">{n.toFixed(2)}</span>
          : <span className="text-gray-300">—</span>;
      },
    },
    {
      title: '定价', key: 'basePrice', width: 100, align: 'right',
      render: (_: unknown, record: PurchasingProduct) => {
        const n = record.price;
        return n != null && n > 0
          ? <span style={{ color: '#d97706', fontWeight: 400, fontFeatureSettings: '"tnum"' }}>{(n * 0.83).toFixed(2)}</span>
          : <span className="text-gray-300">—</span>;
      },
    },
    {
      title: '毛利率', dataIndex: 'margin', width: 100, align: 'center',
      render: (v: number | null) => {
        if (v == null) return <span className="text-gray-300">—</span>;
        const color = v > 35 ? '#52c41a' : v > 20 ? '#faad14' : '#ff4d4f';
        return <Tag bordered={false} style={{ background: v > 35 ? '#f6ffed' : v > 20 ? '#fffbe6' : '#fff2f0', color, fontWeight: 700, fontSize: 13, borderRadius: 8, padding: '2px 10px', fontFeatureSettings: '"tnum"' }}>{v.toFixed(1)}%</Tag>;
      },
    },
    {
      title: '货源', dataIndex: 'purchaseUrl', width: 100, align: 'center',
      render: (v: string | null) => v
        ? <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => window.open(v, '_blank', 'noreferrer,noopener')} style={{ padding: 0, fontWeight: 500 }}>点击跳转</Button>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '采购价', dataIndex: 'purchasePrice', width: 110, align: 'right',
      render: (v: number | null) => v != null
        ? <span style={{ fontWeight: 600, fontSize: 14, color: '#d4380d', fontFeatureSettings: '"tnum"' }}>¥{v.toFixed(2)}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '采购数量', dataIndex: 'purchaseQuantity', width: 100, align: 'center',
      render: (v: number | null) => v != null
        ? <span className="tabular-nums font-medium">{v}</span>
        : <span className="text-gray-300">—</span>,
    },
  ], []);

  return (
    <div className="min-h-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 m-0 flex items-center gap-2">
            <ShoppingCartOutlined style={{ color: '#1890ff', fontSize: 20 }} />
            供应采购
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            共 <span className="font-semibold text-gray-700 text-base">{total}</span> 件待采购产品
          </p>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => { setPage(1); fetchProducts(1, pageSize); }}>刷新</Button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <Table
          rowKey="id" dataSource={products} columns={columns} loading={loading}
          scroll={{ x: 1200 }} size="large" onChange={handlePageChange}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'], showQuickJumper: true, showTotal: (t, r) => `第 ${r[0]}–${r[1]} 条 / 共 ${t} 条` }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无采购中的产品" style={{ padding: '64px 0' }} /> }}
          rowClassName="align-middle"
        />
      </div>
    </div>
  );
}
