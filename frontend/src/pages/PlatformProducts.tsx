import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Table, Button, Space, Empty, Typography, Select, message, Tooltip, Modal, Input, Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import { ReloadOutlined, AppstoreOutlined, CheckCircleOutlined, LinkOutlined, SearchOutlined } from '@ant-design/icons';
import request from '../lib/request';

const { Text } = Typography;

// 产品图片单元格：支持重试、object-fit: contain
function ProductImageCell({
  url,
  pnk,
  shopId,
  onRefresh,
}: { url: string; pnk: string; shopId: number | null; onRefresh: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleRetry = async () => {
    if (!pnk || !shopId) return;
    setLoading(true);
    try {
      await request.post('/store-products/refresh-image', { pnk, shopId });
      message.success('已触发重新抓取');
      onRefresh();
    } catch {
      message.error('重试失败');
    } finally {
      setLoading(false);
    }
  };

  const boxStyle: React.CSSProperties = {
    width: 60,
    height: 60,
    borderRadius: 8,
    background: '#f5f5f5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };

  if (error) {
    return (
      <div style={{ ...boxStyle, flexDirection: 'column', gap: 4 }}>
        <Button type="link" size="small" loading={loading} onClick={handleRetry} style={{ padding: 0, fontSize: 11 }}>
          重试
        </Button>
      </div>
    );
  }

  return (
    <div style={boxStyle}>
      <img
        src={url}
        alt=""
        style={{
          width: 60,
          height: 60,
          objectFit: 'contain',
          borderRadius: 8,
          display: 'block',
        }}
        onError={() => setError(true)}
      />
    </div>
  );
}

// ─── 平台产品（已上架店铺产品）───────────────────────────────────
interface StoreProduct {
  id: number;
  pnk?: string | null;
  sku?: string | null;
  ean?: string | null;
  part_number_key?: string | null;
  part_number?: string | null;
  partNumber?: string | null;
  title?: string | null;
  name?: string | null;
  product_name?: string | null;
  productName?: string | null;
  main_image?: string | null;
  mainImage?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  productUrl?: string | null;
  product_url?: string | null;
  price?: number | null;
  sale_price?: number | null;
  salePrice?: number | null;
  currency?: string | null;
  platformStock?: number | null;
  platform_stock?: number | null;
  stock?: number | null;
  sales_stats?: { d7?: number; d14?: number; d30?: number } | null;
  salesStats?: { d7?: number; d14?: number; d30?: number } | null;
  d7?: number | null;
  d14?: number | null;
  d30?: number | null;
  sales7d?: number | null;
  sales_7d?: number | null;
  sales14d?: number | null;
  sales_14d?: number | null;
  sales30d?: number | null;
  sales_30d?: number | null;
  validation_status?: number;
  status?: string;
  rejection_reason?: string | null;
  rejectionReason?: string | null;
}

// 格式化价格：数字 + 币种（如 28.00 RON）
function formatPrice(value: number, currency?: string | null): string {
  const num = Number(value).toFixed(2);
  const c = (currency ?? '').trim().toUpperCase();
  if (!c) return num;
  if (c === 'RON') return `${num} RON`;
  return `${num} ${c}`;
}

// 无图片占位图（SVG 图标 + 文字）
const NO_IMAGE_PLACEHOLDER = (
  <div
    style={{
      width: 60,
      height: 60,
      borderRadius: 8,
      background: '#f5f5f5',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 10,
      color: '#94a3b8',
      border: '1px dashed #e0e0e0',
    }}
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 2 }}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
    无图片
  </div>
);

// 本地库存 SKU 信息（用于关联与毛利计算）
interface LocalInventoryMap {
  imageUrl: string | null;
  purchasePrice: number | null;
}

// 库存 SKU 列表项（用于映射弹窗搜索）
interface InventoryItem {
  id: number;
  sku?: string | null;
  chineseName?: string | null;
  title?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
}

interface PlatformProductsProps {
  initialSearch?: string;
}

export default function PlatformProducts({ initialSearch }: PlatformProductsProps) {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [shops, setShops] = useState<{ id: number; shopName: string; platform: string }[]>([]);
  const [shopId, setShopId] = useState<number | null>(null);
  const [inventoryMap, setInventoryMap] = useState<Record<string, LocalInventoryMap>>({});
  const [currency, setCurrency] = useState<string>('RON');
  const [searchKeyword, setSearchKeyword] = useState(initialSearch ?? '');
  const [appliedKeyword, setAppliedKeyword] = useState(initialSearch ?? ''); // 实际已应用的搜索关键词

  // 手动映射弹窗
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [mapTarget, setMapTarget] = useState<StoreProduct | null>(null);
  const [mapSearchKw, setMapSearchKw] = useState('');
  const [mapSearchResults, setMapSearchResults] = useState<InventoryItem[]>([]);
  const [mapSearchLoading, setMapSearchLoading] = useState(false);
  const [mapSelected, setMapSelected] = useState<InventoryItem | null>(null);
  const [mapSubmitting, setMapSubmitting] = useState(false);

  const fetchInventory = useCallback(async () => {
    try {
      const { data: res } = await request.get<{ code: number; data?: { list?: { sku?: string; imageUrl?: string; purchasePrice?: number }[] } }>(
        '/products/inventory',
        { params: { page: 1, pageSize: 2000 } },
      );
      if (res.code === 200 && Array.isArray(res.data?.list)) {
        const map: Record<string, LocalInventoryMap> = {};
        res.data.list.forEach((p) => {
          const sku = String(p.sku ?? '').trim().toUpperCase();
          if (sku) {
            map[sku] = {
              imageUrl: p.imageUrl ?? null,
              purchasePrice: p.purchasePrice ?? null,
            };
          }
        });
        setInventoryMap(map);
      }
    } catch {
      // 静默失败，不影响平台产品展示
    }
  }, []);

  const fetchShops = useCallback(async () => {
    if (!localStorage.getItem('token')) return;
    try {
      const { data: res } = await request.get<{ code: number; data: { id: number; shopName: string; platform: string }[] }>('/shops');
      const list = Array.isArray(res?.data) ? res.data : [];
      setShops(list);
      if (list.length > 0) {
        const cached = localStorage.getItem('selectedShopId');
        const cachedId = cached ? parseInt(cached, 10) : NaN;
        const valid = list.some((s) => s.id === cachedId);
        setShopId(valid && !isNaN(cachedId) ? cachedId : list[0].id);
      }
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status !== 401) message.error('加载店铺列表失败');
    }
  }, []);

  const fetchProducts = useCallback(async (sid: number | null, keyword?: string, opts?: { refreshSales?: boolean }) => {
    if (sid == null) {
      setProducts([]);
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) {
      message.warning('请先登录');
      return;
    }
    if (opts?.refreshSales) setProducts([]);
    setLoading(true);
    try {
      const params: Record<string, string | number> = { shopId: sid };
      const searchVal = typeof keyword === 'string' ? keyword.trim() : '';
      if (searchVal) params.search = searchVal;
      if (opts?.refreshSales) {
        params.refreshSales = 1;
        params._t = Date.now();
      }
      const { data: res } = await request.get<{
        code: number;
        data?: StoreProduct[] | { list?: StoreProduct[]; currency?: string };
        currency?: string;
      }>('/store-products', { params });
      if (res.code === 200) {
        const raw = res.data;
        const list = Array.isArray(raw)
          ? raw
          : (raw && typeof raw === 'object' && Array.isArray((raw as { list?: StoreProduct[] }).list))
            ? (raw as { list: StoreProduct[] }).list
            : [];
        setProducts([...list]);
        const dataObj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as { currency?: string } : null;
        const c = (res as { currency?: string }).currency ?? dataObj?.currency ?? (list[0] as StoreProduct | undefined)?.currency ?? 'RON';
        setCurrency((c ?? 'RON').trim() || 'RON');
      } else {
        setProducts([]);
      }
    } catch (err) {
      setProducts([]);
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status !== 401) {
        message.error('加载平台产品失败');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInventorySearch = useCallback(async (keyword: string) => {
    setMapSearchLoading(true);
    try {
      const { data: res } = await request.get<{ code: number; data?: { list?: InventoryItem[] } }>(
        '/products/inventory',
        { params: { page: 1, pageSize: 50, keyword: keyword.trim() || undefined } },
      );
      if (res.code === 200 && Array.isArray(res.data?.list)) {
        setMapSearchResults(res.data.list);
      } else {
        setMapSearchResults([]);
      }
    } catch {
      setMapSearchResults([]);
    } finally {
      setMapSearchLoading(false);
    }
  }, []);

  const openMapModal = useCallback((product: StoreProduct) => {
    setMapTarget(product);
    setMapModalOpen(true);
    setMapSearchKw('');
    setMapSelected(null);
    setMapSearchResults([]);
    fetchInventorySearch('');
  }, [fetchInventorySearch]);

  const closeMapModal = useCallback(() => {
    setMapModalOpen(false);
    setMapTarget(null);
    setMapSearchKw('');
    setMapSelected(null);
    setMapSearchResults([]);
  }, []);

  const handleMapConfirm = useCallback(async () => {
    if (!mapTarget || !mapSelected || !shopId) return;
    setMapSubmitting(true);
    try {
      const { data: res } = await request.post<{ code: number; message?: string }>('/store-products/map', {
        pnk: mapTarget.pnk ?? mapTarget.part_number_key ?? mapTarget.partNumber,
        shopId,
        inventorySkuId: mapSelected.id,
        inventorySku: mapSelected.sku ?? undefined,
      });
      if (res.code === 200) {
        message.success('绑定成功');
        closeMapModal();
        fetchInventory();
        fetchProducts(shopId, appliedKeyword);
      } else {
        message.error(res.message ?? '绑定失败');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg ?? '绑定失败');
    } finally {
      setMapSubmitting(false);
    }
  }, [mapTarget, mapSelected, shopId, appliedKeyword, closeMapModal, fetchInventory, fetchProducts]);

  useEffect(() => {
    fetchShops();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  useEffect(() => {
    const kw = initialSearch?.trim();
    if (kw) {
      setSearchKeyword(kw);
      setAppliedKeyword(kw);
      fetchProducts(shopId, kw, { refreshSales: true });
    } else {
      setSearchKeyword('');
      setAppliedKeyword('');
      fetchProducts(shopId, '', { refreshSales: true });
    }
  }, [shopId, initialSearch, fetchProducts]);

  // 映射弹窗：搜索防抖
  useEffect(() => {
    if (!mapModalOpen) return;
    const t = setTimeout(() => fetchInventorySearch(mapSearchKw), 300);
    return () => clearTimeout(t);
  }, [mapModalOpen, mapSearchKw, fetchInventorySearch]);

  const columns: ColumnsType<StoreProduct> = useMemo(() => [
    {
      title: '图片',
      dataIndex: 'main_image',
      key: 'image',
      width: 90,
      align: 'center',
      render: (_: unknown, r: StoreProduct) => {
        const platformUrl = r.main_image ?? r.mainImage ?? r.imageUrl ?? r.image_url;
        const skuKey = String(r.sku ?? '').trim().toUpperCase();
        const local = inventoryMap[skuKey];
        const url = (local?.imageUrl && local.imageUrl.trim()) ? local.imageUrl : (platformUrl && typeof platformUrl === 'string' && platformUrl.trim() ? platformUrl : null);
        if (!url) return NO_IMAGE_PLACEHOLDER;
        const pnk = String(r.pnk ?? '').trim();
        return (
          <ProductImageCell
            url={url}
            pnk={pnk}
            shopId={shopId}
            onRefresh={() => fetchProducts(shopId, appliedKeyword)}
          />
        );
      },
    },
    {
      title: '产品名称',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      width: 400,
      render: (_: unknown, r: StoreProduct) => {
        const name = r.title ?? r.name ?? r.product_name ?? r.productName ?? '';
        const partNumber = r.part_number ?? r.partNumber ?? '';
        const link = r.productUrl ?? r.product_url;
        return (
        <div>
          <div>
            <Text strong ellipsis style={{ maxWidth: 380 }}>{name || '-'}</Text>
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 ml-1">
                查看
              </a>
            )}
          </div>
          {partNumber && (
            <div className="text-gray-400 text-xs mt-1">内部 PN：{partNumber}</div>
          )}
        </div>
        );
      },
    },
    {
      title: 'SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: 200,
      align: 'center',
      render: (_: unknown, r: StoreProduct) => {
        const sku = String(r.sku ?? '').trim();
        const skuKey = sku.toUpperCase();
        const isLinked = skuKey && inventoryMap[skuKey];
        const pnk = String(r.pnk ?? r.part_number_key ?? r.partNumber ?? '').trim();
        const codeStyle = { fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace', fontSize: 14, fontWeight: 400 };
        return (
          <Space size={4} align="center" wrap style={{ justifyContent: 'center' }}>
            <Text copyable={sku ? { text: sku } : undefined} style={codeStyle}>{sku || '-'}</Text>
            {isLinked && (
              <Tag color="success" style={{ margin: 0, fontSize: 11 }}>已关联</Tag>
            )}
            {pnk && (
              <Tooltip title="手动绑定库存 SKU">
                <Button
                  type="link"
                  size="small"
                  icon={<LinkOutlined style={{ color: '#2563eb', fontSize: 14 }} />}
                  onClick={() => openMapModal(r)}
                  style={{ padding: '0 4px', minWidth: 24, height: 24 }}
                />
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: 'EAN',
      dataIndex: 'ean',
      key: 'ean',
      width: 160,
      align: 'center',
      render: (_: unknown, r: StoreProduct) => {
        const ean = String(r.ean ?? '').trim();
        const codeStyle = { fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace', fontSize: 14, fontWeight: 400 };
        return (
          <Text copyable={ean ? { text: ean } : undefined} style={codeStyle}>{ean || '-'}</Text>
        );
      },
    },
    {
      title: 'PNK 码',
      dataIndex: 'pnk',
      key: 'pnk',
      width: 160,
      align: 'center',
      render: (_: unknown, r: StoreProduct) => {
        const pnk = String(r.pnk ?? '').trim();
        const codeStyle = { fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace', fontSize: 14, fontWeight: 400 };
        return (
          <Text copyable={pnk ? { text: pnk } : undefined} style={codeStyle}>{pnk || '-'}</Text>
        );
      },
    },
    {
      title: '销量 (7/14/30)',
      key: 'sales',
      width: 140,
      align: 'center',
      render: (_: unknown, r: StoreProduct) => {
        const stats = r.sales_stats ?? r.salesStats;
        const v7 = Number(stats?.d7 ?? r.d7 ?? r.sales7d ?? r.sales_7d ?? 0) || 0;
        const v14 = Number(stats?.d14 ?? r.d14 ?? r.sales14d ?? r.sales_14d ?? 0) || 0;
        const v30 = Number(stats?.d30 ?? r.d30 ?? r.sales30d ?? r.sales_30d ?? 0) || 0;
        const baseStyle = { fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace', fontSize: 14 };
        const highlightColor = '#1e40af';
        const defaultColor = '#64748b';
        return (
          <Tooltip title="过去7天/14天/30天内的成交件数">
            <span style={baseStyle}>
              <span style={{ fontWeight: v7 > 0 ? 700 : 600, color: v7 > 0 ? highlightColor : defaultColor }}>{v7}</span>
              {' / '}
              <span style={{ fontWeight: v14 > 0 ? 700 : 600, color: v14 > 0 ? highlightColor : defaultColor }}>{v14}</span>
              {' / '}
              <span style={{ fontWeight: v30 > 0 ? 700 : 600, color: v30 > 0 ? highlightColor : defaultColor }}>{v30}</span>
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: '价格',
      dataIndex: 'price',
      key: 'price',
      width: 120,
      align: 'center',
      render: (_: unknown, r: StoreProduct) => {
        const v = r.price ?? r.sale_price ?? r.salePrice;
        const c = r.currency ?? currency;
        return <span>{v != null ? formatPrice(v, c) : '-'}</span>;
      },
    },
    {
      title: '预估毛利',
      key: 'profit',
      width: 120,
      align: 'center',
      render: (_: unknown, r: StoreProduct) => {
        const price = r.price ?? r.sale_price ?? r.salePrice;
        const skuKey = String(r.sku ?? '').trim().toUpperCase();
        const cost = inventoryMap[skuKey]?.purchasePrice;
        if (price == null || cost == null) return <span style={{ color: '#94a3b8' }}>—</span>;
        const profit = Number(price) - Number(cost);
        const c = r.currency ?? currency;
        const color = profit >= 0 ? '#52c41a' : '#ff4d4f';
        return <span style={{ fontWeight: 600, color, fontFeatureSettings: '"tnum"' }}>{formatPrice(profit, c)}</span>;
      },
    },
    {
      title: '平台库存',
      dataIndex: 'platformStock',
      key: 'platformStock',
      width: 100,
      align: 'center',
      render: (_: unknown, r: StoreProduct) => {
        const v = r.platformStock ?? r.platform_stock ?? r.stock;
        return <span>{v != null ? v : '-'}</span>;
      },
    },
  ], [inventoryMap, shopId, appliedKeyword, fetchProducts, currency, openMapModal]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
            <AppstoreOutlined style={{ color: '#2563eb' }} /> 平台产品
          </h2>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>
            已上架至授权店铺的产品，与库存 SKU、公海产品完全隔离
          </p>
        </div>
        <Space>
          <Space size="small">
            <span className="text-sm text-gray-500">店铺：</span>
            <Select
              placeholder="选择店铺"
              value={shopId ?? undefined}
              onChange={(v) => setShopId(v ?? null)}
              options={shops.map((s) => ({ label: `${s.shopName} (${s.platform})`, value: s.id }))}
              style={{ minWidth: 200 }}
            />
          </Space>
          <Button icon={<ReloadOutlined />} onClick={() => { fetchInventory(); fetchProducts(shopId, appliedKeyword, { refreshSales: true }); }} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Input
          placeholder="输入 SKU / EAN / PNK 码搜索..."
          prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          onPressEnter={() => {
            if (shopId == null) {
              message.warning('请先选择店铺');
              return;
            }
            setAppliedKeyword(searchKeyword);
            fetchProducts(shopId, searchKeyword);
          }}
          allowClear
          style={{ width: 280 }}
        />
        <Button
          type="primary"
          icon={<SearchOutlined />}
          onClick={() => {
            if (shopId == null) {
              message.warning('请先选择店铺');
              return;
            }
            setAppliedKeyword(searchKeyword);
            fetchProducts(shopId, searchKeyword);
          }}
          loading={loading}
        >
          搜索
        </Button>
        <Button
          onClick={() => {
            setSearchKeyword('');
            setAppliedKeyword('');
            fetchProducts(shopId, '');
          }}
          loading={loading}
        >
          重置
        </Button>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
        <Table<StoreProduct>
          dataSource={products}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          locale={{ emptyText: <Empty description={shopId ? '暂无平台产品' : '请先选择店铺'} style={{ padding: 48 }} /> }}
        />
      </div>

      {/* 手动绑定库存 SKU 弹窗 */}
      <Modal
        title="手动绑定库存 SKU"
        open={mapModalOpen}
        onCancel={closeMapModal}
        footer={[
          <Button key="cancel" onClick={closeMapModal}>取消</Button>,
          <Button
            key="confirm"
            type="primary"
            loading={mapSubmitting}
            disabled={!mapSelected}
            onClick={handleMapConfirm}
          >
            确认绑定
          </Button>,
        ]}
        width={520}
        destroyOnClose
      >
        {mapTarget && (
          <div style={{ marginBottom: 16, padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>当前产品：</Typography.Text>
            <Typography.Text
              style={{
                marginLeft: 6,
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                fontWeight: 600,
                color: '#1e293b',
                fontSize: 13,
              }}
            >
              PNK: {String(mapTarget.pnk ?? '').trim() || '—'} | SKU: {String(mapTarget.sku ?? '').trim() || '—'}
            </Typography.Text>
          </div>
        )}
        <Input
          placeholder="输入 SKU 或名称搜索库存"
          value={mapSearchKw}
          onChange={(e) => setMapSearchKw(e.target.value)}
          allowClear
          style={{ marginBottom: 12 }}
        />
        <div
          style={{
            maxHeight: 320,
            overflowY: 'auto',
            border: '1px solid #f0f0f0',
            borderRadius: 8,
            padding: 8,
          }}
        >
          {mapSearchLoading ? (
            <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>搜索中...</div>
          ) : mapSearchResults.length === 0 ? (
            <Empty description="暂无匹配的库存 SKU" style={{ padding: 24 }} />
          ) : (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {mapSearchResults.map((item) => {
                const url = item.imageUrl ?? item.image_url;
                const name = item.chineseName ?? item.title ?? '-';
                const sku = String(item.sku ?? '').trim() || '-';
                const isSelected = mapSelected?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setMapSelected(item)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: isSelected ? '#e6f4ff' : '#fafafa',
                      border: `1px solid ${isSelected ? '#91caff' : '#f0f0f0'}`,
                    }}
                  >
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        flexShrink: 0,
                        borderRadius: 6,
                        overflow: 'hidden',
                        background: '#f5f5f5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {url ? (
                        <img src={url} alt="" style={{ width: 48, height: 48, objectFit: 'contain' }} />
                      ) : (
                        <Typography.Text type="secondary" style={{ fontSize: 10 }}>无图</Typography.Text>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Typography.Text strong ellipsis style={{ display: 'block' }}>{name}</Typography.Text>
                      <Typography.Text code type="secondary" style={{ fontSize: 12 }}>{sku}</Typography.Text>
                    </div>
                  </div>
                );
              })}
            </Space>
          )}
        </div>
      </Modal>
    </div>
  );
}
