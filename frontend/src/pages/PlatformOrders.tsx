import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Table, Button, Space, Empty, Typography, Select, message, Tag, Alert, Input, DatePicker, Image,
} from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import {
  ReloadOutlined, ShoppingOutlined, SyncOutlined, ThunderboltOutlined,
  SearchOutlined, AppstoreOutlined, DownOutlined, UpOutlined,
} from '@ant-design/icons';
import request from '../lib/request';
import { formatPrice } from '../lib/currency';

const { Text } = Typography;

const SITE_ALL = '__all__';

// 日期范围预设
type DatePreset = 'today' | 'yesterday' | '30d' | 'month' | 'custom';

function getDateRangeForPreset(preset: DatePreset, customRange: [Dayjs, Dayjs] | null): [string, string] | null {
  if (preset === 'custom' && customRange) {
    return [customRange[0].format('YYYY-MM-DD'), customRange[1].format('YYYY-MM-DD')];
  }
  const today = dayjs().format('YYYY-MM-DD');
  const ranges: Record<DatePreset, [string, string]> = {
    today:     [today, today],
    yesterday: [dayjs().subtract(1, 'day').format('YYYY-MM-DD'), dayjs().subtract(1, 'day').format('YYYY-MM-DD')],
    '30d':     [dayjs().subtract(29, 'day').format('YYYY-MM-DD'), today],
    month:     [dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().endOf('month').format('YYYY-MM-DD')],
    custom:    [today, today],
  };
  return ranges[preset] ?? null;
}

// 状态筛选选项
const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '新订单',   value: '新订单' },
  { label: '处理中',   value: '处理中' },
  { label: '已准备',   value: '已准备' },
  { label: '已退货',   value: '已退货' },
  { label: '已完成',   value: '已完成' },
  { label: '已取消',   value: '已取消' },
];

// 状态标签颜色
const STATUS_STYLE_MAP: Record<string, { color: string; bg: string; border?: string }> = {
  新订单: { color: '#1677ff', bg: '#e6f4ff', border: '#91caff' },
  处理中: { color: '#d46b08', bg: '#fff7e6', border: '#ffd591' },
  已准备: { color: '#08979c', bg: '#e6fffb', border: '#87e8de' },
  已退货: { color: '#cf1322', bg: '#fff2f0', border: '#ffccc7' },
  已完成: { color: '#389e0d', bg: '#f6ffed', border: '#b7eb8f' },
  已取消: { color: '#8c8c8c', bg: '#fafafa', border: '#d9d9d9' },
};

function getStatusStyle(statusText: string): { color: string; bg: string; border?: string } {
  const t = String(statusText ?? '').trim();
  if (t.includes('已完成')) return STATUS_STYLE_MAP['已完成'] ?? { color: '#389e0d', bg: '#f6ffed', border: '#b7eb8f' };
  if (t.includes('已取消')) return STATUS_STYLE_MAP['已取消'] ?? { color: '#8c8c8c', bg: '#fafafa', border: '#d9d9d9' };
  return STATUS_STYLE_MAP[t] ?? { color: '#595959', bg: '#fafafa', border: '#d9d9d9' };
}

// 构建跳转链接（同时携带 sku + shopId，确保目标页面加载正确店铺）
function buildPlatformProductsUrl(sku?: string, shopId?: number | string | null): string {
  const base = `${window.location.origin}/dashboard`;
  const params = new URLSearchParams({ tab: 'platform-products' });
  if (sku && String(sku).trim()) params.set('sku', String(sku).trim());
  if (shopId != null && String(shopId).trim()) params.set('shopId', String(shopId));
  return `${base}?${params.toString()}`;
}

// ─── 类型 ─────────────────────────────────────────────────────

interface OrderItem {
  id?:             number;
  productName?:    string;
  product_name?:   string;
  sku?:            string;
  ext_part_number?: string;
  quantity?:       number;
  price?:          number;
  sale_price?:     number;
  total?:          number;
  image?:          string;
  imageUrl?:       string;
  image_url?:      string;
  product_image?:  string;
  display_image?:  string;
  pnk?:            string;
}

interface Order {
  id:                   number;
  orderId?:             string;
  order_id?:            string;
  platform_order_id?:   string;
  emag_order_id?:       string;
  shopId?:              number;
  shop_id?:             number;
  shop?:                { region?: string; site?: string };
  region?:              string | null;
  site?:                string | null;
  order_type?:          number;
  type?:                number;
  createdAt?:           string;
  created_at?:          string;
  orderTime?:           string;
  order_time?:          string;
  amount?:              number;
  total?:               number;
  totalAmount?:         number;
  total_amount?:        number;
  status?:              string | number;
  statusText?:          string;
  status_text?:         string;
  statusLabel?:         string;
  status_label?:        string;
  currency?:            string;
  items?:               OrderItem[];
  products?:            OrderItem[];
}

type ShopRecord = { id: number; shopName: string; platform: string; region?: string | null; site?: string | null };

// ─── 展开行：买家信息 + 商品明细 ────────────────────────────────

function ExpandedOrderRow({ record, currency }: { record: Order; currency: string }) {
  const items = record.items ?? record.products ?? [];
  // 从父行拿到 shopId，透传给跳转链接，确保目标页加载正确店铺
  const parentShopId = record.shopId ?? record.shop_id ?? null;

  // 商品明细列
  const itemColumns: ColumnsType<OrderItem> = [
    {
      title: '图片', key: 'image', width: 72, align: 'center',
      render: (_: unknown, r: OrderItem) => {
        const url = r.display_image ?? r.image ?? r.imageUrl ?? r.image_url ?? r.product_image;
        const sku = (r.ext_part_number ?? r.sku ?? '').toString().trim();
        const linkUrl = buildPlatformProductsUrl(sku || undefined, parentShopId);
        if (!url || typeof url !== 'string' || !url.trim()) {
          return (
            <a href={linkUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, fontSize: 11, color: '#94a3b8' }}
            >
              <AppstoreOutlined style={{ fontSize: 12 }} />
              待补全
            </a>
          );
        }
        return (
          <a href={linkUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
            <Image
              src={url}
              width={52}
              height={52}
              style={{ objectFit: 'contain' }}
              preview={false}
              fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='52' height='52'%3E%3Crect fill='%23f5f5f5' width='52' height='52'/%3E%3C/svg%3E"
            />
          </a>
        );
      },
    },
    {
      title: 'SKU / 商品名', key: 'sku', width: 200,
      render: (_: unknown, r: OrderItem) => {
        const sku  = (r.ext_part_number ?? r.sku ?? '').toString().trim();
        const name = (r.productName ?? r.product_name ?? '').toString().trim();
        const linkUrl = buildPlatformProductsUrl(sku || undefined, parentShopId);
        return (
          <div>
            {sku ? (
              <a href={linkUrl} target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: '#1677ff' }}
              >
                {sku}
              </a>
            ) : (
              <span style={{ color: '#d9d9d9', fontSize: 12 }}>—</span>
            )}
            {name && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 1.4, wordBreak: 'break-all' }}>
                {name}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: '单价', key: 'price', width: 110, align: 'right',
      render: (_: unknown, r: OrderItem) => {
        const v = r.sale_price ?? r.price;
        return v != null ? <Text style={{ fontWeight: 500 }}>{formatPrice(v, currency)}</Text> : <span style={{ color: '#d9d9d9' }}>—</span>;
      },
    },
    {
      title: '数量', dataIndex: 'quantity', key: 'qty', width: 70, align: 'center',
      render: (v: number) => (
        <Tag bordered={false} color="blue" style={{ fontWeight: 600, borderRadius: 6 }}>{v ?? '—'}</Tag>
      ),
    },
    {
      title: '小计', key: 'subtotal', width: 120, align: 'right',
      render: (_: unknown, r: OrderItem) => {
        const q = r.quantity ?? 0;
        const p = r.sale_price ?? r.price ?? 0;
        return (q && p)
          ? <Text strong style={{ color: '#15803d' }}>{formatPrice(q * p, currency)}</Text>
          : <span style={{ color: '#d9d9d9' }}>—</span>;
      },
    },
  ];

  return (
    <div style={{
      margin: '0 0 0 48px',
      padding: '8px 16px 16px',
      background: '#f8fafc',
      borderLeft: '3px solid #e2e8f0',
    }}>
      {/* ── 商品明细表格（子表表头弱化） ── */}
      <style>{`
        .platform-order-sub-table .ant-table-thead > tr > th {
          background: #fafafa !important;
          color: #8c8c8c !important;
          font-weight: 400 !important;
          font-size: 11px !important;
          border-bottom: 1px solid #f0f0f0 !important;
        }
        .platform-order-sub-table .ant-table-thead > tr > th::before {
          display: none !important;
        }
        .platform-order-sub-table .ant-table {
          border: none !important;
        }
      `}</style>
      <Table<OrderItem>
        className="platform-order-sub-table"
        dataSource={items}
        columns={itemColumns}
        rowKey={(r, i) => String(r.id ?? i)}
        pagination={false}
        size="small"
        locale={{ emptyText: <Empty description="暂无商品明细" style={{ padding: '16px 0' }} /> }}
        style={{ borderRadius: 8, overflow: 'hidden' }}
      />
    </div>
  );
}

// ─── 主组件 ───────────────────────────────────────────────────

export default function PlatformOrders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading]           = useState(false);
  const [orders, setOrders]             = useState<Order[]>([]);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [pageSize, setPageSize]         = useState(50);
  const [shops, setShops]               = useState<ShopRecord[]>([]);
  const [selectedShopName, setSelectedShopName] = useState<string | null>(null);
  const [selectedSite, setSelectedSite] = useState<string>(SITE_ALL);
  const [expandedRowKeys, setExpandedRowKeys]   = useState<React.Key[]>([]);
  const [dataVersion, setDataVersion]   = useState(0);
  const [isSyncing, setIsSyncing]       = useState(false);
  const isSyncingRef = useRef(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const prevTotalRef = useRef(0);
  const [forceSyncCooldownUntil, setForceSyncCooldownUntil] = useState<number>(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // 筛选条件
  const [filterOrderId, setFilterOrderId]   = useState('');
  const [datePreset, setDatePreset]         = useState<DatePreset>('30d');
  const [customDateRange, setCustomDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [filterStatus, setFilterStatus]     = useState<string>('');

  const shopNameOptions = [...new Set(shops.map((s) => s.shopName.trim()).filter(Boolean))].map((name) => ({ label: name, value: name }));
  const shopsForName = selectedShopName ? shops.filter((s) => s.shopName.trim() === selectedShopName) : [];
  const siteOptions  = [
    { label: '🌍 全部站点', value: SITE_ALL },
    ...shopsForName
      .map((s) => (s.region ?? s.site ?? '') as string)
      .filter(Boolean)
      .filter((r, i, arr) => arr.indexOf(r) === i)
      .map((r) => ({ label: r, value: r })),
  ];
  const effectiveShopIds: number[] =
    selectedSite === SITE_ALL
      ? shopsForName.map((s) => s.id)
      : shopsForName.filter((s) => (s.region ?? s.site) === selectedSite).map((s) => s.id);
  const shopIdForSync = effectiveShopIds[0] ?? null;

  const fetchShops = useCallback(async () => {
    if (!localStorage.getItem('token')) return;
    try {
      const { data: res } = await request.get<{ code: number; data: ShopRecord[] }>('/shops');
      const list = Array.isArray(res?.data) ? res.data : [];
      setShops(list);
      if (list.length > 0) {
        const urlShop = searchParams.get('shop');
        const urlSite = searchParams.get('site') ?? SITE_ALL;
        const validShop = urlShop && list.some((s) => s.shopName.trim() === urlShop);
        const firstShopName = list[0].shopName.trim();
        setSelectedShopName(validShop ? urlShop : firstShopName);
        if (validShop && urlSite) {
          const shopsOfName = list.filter((s) => s.shopName.trim() === (validShop ? urlShop : firstShopName));
          const validSite = urlSite === SITE_ALL || shopsOfName.some((s) => (s.region ?? s.site) === urlSite);
          setSelectedSite(validSite ? urlSite : SITE_ALL);
        } else {
          setSelectedSite(SITE_ALL);
        }
      }
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status !== 401) message.error('加载店铺列表失败');
    }
  }, [searchParams]);

  useEffect(() => { isSyncingRef.current = isSyncing; }, [isSyncing]);

  const FORCE_SYNC_COOLDOWN_SEC = 300;
  useEffect(() => {
    if (forceSyncCooldownUntil <= 0) { setCooldownSeconds(0); return; }
    const tick = () => {
      const left = Math.max(0, Math.ceil((forceSyncCooldownUntil - Date.now()) / 1000));
      setCooldownSeconds(left);
      if (left <= 0) setForceSyncCooldownUntil(0);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [forceSyncCooldownUntil]);

  const buildFilterOpts = useCallback(() => {
    const range = getDateRangeForPreset(datePreset, customDateRange);
    return {
      orderId:   filterOrderId?.trim() || undefined,
      startDate: range?.[0],
      endDate:   range?.[1],
      status:    filterStatus?.trim() || undefined,
    };
  }, [filterOrderId, datePreset, customDateRange, filterStatus]);

  const fetchOrders = useCallback(async (
    sids: number[],
    p = 1,
    ps = 50,
    opts?: { cacheBust?: boolean; overrideFilter?: { orderId?: string; startDate?: string; endDate?: string; status?: string } },
  ) => {
    if (sids.length === 0) { setOrders([]); setTotal(0); return; }
    const token = localStorage.getItem('token');
    if (!token) { message.warning('请先登录'); return; }
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: p, pageSize: ps };
      if (sids.length === 1) params.shopId  = sids[0];
      else                   params.shopIds = sids.join(',');
      if (opts?.cacheBust) params._t = Date.now();
      const filter = opts?.overrideFilter ?? buildFilterOpts();
      if (filter.orderId)    params.orderId    = filter.orderId;
      if (filter.startDate)  params.startDate  = filter.startDate;
      if (filter.endDate)    params.endDate    = filter.endDate;
      if (filter.status)     params.status     = filter.status;

      const { data: res } = await request.get<{
        code: number;
        data: Order[] | { list: Order[]; total?: number };
        total?: number;
        isSyncing?: boolean;
        is_syncing?: boolean;
        lastSyncAt?: string;
        last_sync_at?: string;
      }>('/orders', { params });

      if (res.code === 200) {
        const raw      = res.data;
        const list     = Array.isArray(raw) ? raw : (raw && Array.isArray((raw as { list?: Order[] }).list) ? (raw as { list: Order[] }).list : []);
        const totalVal = (res as { total?: number }).total ?? (raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { total?: number }).total : undefined);
        if ((totalVal ?? 0) > 0 && list.length === 0) {
          console.warn('[平台订单] 分页断档：总数', totalVal, '但当前页返回空数组，尝试重新请求第一页');
          setPage(1);
          setTimeout(() => fetchOrders(sids, 1, ps, { cacheBust: true }), 300);
          return;
        }
        setOrders(list);
        setExpandedRowKeys([]); // 翻页/刷新时收起所有展开行
        const newTotal = totalVal ?? list.length;
        setTotal(newTotal);
        prevTotalRef.current = newTotal;
        setDataVersion((v) => v + 1);
        const syncing    = (res as { isSyncing?: boolean; is_syncing?: boolean }).isSyncing ?? (res as { isSyncing?: boolean; is_syncing?: boolean }).is_syncing ?? false;
        const apiLastSync = (res as { lastSyncAt?: string; last_sync_at?: string }).lastSyncAt ?? (res as { lastSyncAt?: string; last_sync_at?: string }).last_sync_at;
        if (apiLastSync) setLastSyncTime(dayjs(apiLastSync).format('YYYY-MM-DD HH:mm'));
        const wasSyncing = isSyncingRef.current;
        setIsSyncing(syncing);
        if (wasSyncing && !syncing) {
          if (!apiLastSync) setLastSyncTime(dayjs().format('YYYY-MM-DD HH:mm'));
          setTimeout(() => fetchOrders(sids, 1, ps, { cacheBust: true }), 100);
        }
      } else {
        setOrders([]); setTotal(0);
      }
    } catch (err) {
      setOrders([]); setTotal(0);
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status !== 401) message.error('加载订单失败');
    } finally {
      setLoading(false);
    }
  }, [buildFilterOpts]);

  useEffect(() => { fetchShops(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedShopName) return;
    const next = new URLSearchParams(searchParams);
    next.set('shop', selectedShopName);
    next.set('site', selectedSite);
    setSearchParams(next, { replace: true });
  }, [selectedShopName, selectedSite]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPage(1);
    fetchOrders(effectiveShopIds, 1, pageSize);
  }, [selectedShopName, selectedSite]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isSyncing || effectiveShopIds.length === 0) return;
    const timer = setInterval(() => { fetchOrders(effectiveShopIds, page, pageSize); }, 5000);
    return () => clearInterval(timer);
  }, [isSyncing, selectedShopName, selectedSite, page, pageSize, fetchOrders]);

  useEffect(() => {
    if (effectiveShopIds.length === 0) return;
    const timer = setInterval(async () => {
      if (loading) return;
      try {
        const params: Record<string, string | number> = { page: 1, pageSize: 1 };
        if (effectiveShopIds.length === 1) params.shopId  = effectiveShopIds[0];
        else                               params.shopIds = effectiveShopIds.join(',');
        const filter = buildFilterOpts();
        if (filter.orderId)   params.orderId   = filter.orderId;
        if (filter.startDate) params.startDate = filter.startDate;
        if (filter.endDate)   params.endDate   = filter.endDate;
        if (filter.status)    params.status    = filter.status;
        const { data: res } = await request.get<{ code: number; total?: number; data?: { list?: unknown[]; total?: number } }>('/orders', { params });
        if (res.code === 200) {
          const raw      = res.data;
          const newTotal = (res as { total?: number }).total ?? (raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { total?: number }).total : undefined) ?? 0;
          const prev = prevTotalRef.current;
          if (prev > 0 && newTotal > prev) {
            const diff = newTotal - prev;
            message.info(`发现 ${diff} 笔新订单，已为您自动刷新列表`, 4);
            fetchOrders(effectiveShopIds, page, pageSize);
          }
        }
      } catch { /* 静默失败 */ }
    }, 30000);
    return () => clearInterval(timer);
  }, [selectedShopName, selectedSite, page, pageSize, loading, buildFilterOpts, fetchOrders]);

  const handleTableChange = useCallback((pag: { current?: number; pageSize?: number }) => {
    const np  = pag.current  ?? 1;
    const nps = pag.pageSize ?? pageSize;
    setPage(np);
    setPageSize(nps);
    fetchOrders(effectiveShopIds, np, nps);
  }, [selectedShopName, selectedSite, pageSize, fetchOrders]);

  const handleForceSync = useCallback(async () => {
    if (effectiveShopIds.length === 0 || cooldownSeconds > 0) return;
    setLoading(true);
    const hideLoading = message.loading('正在从 eMAG 全欧洲站点抓取最新数据...', 0);
    try {
      const { data: res } = await request.post<{ code: number; message?: string }>('/orders/sync', {
        shopIds: effectiveShopIds,
      });
      if (res.code !== 200) {
        hideLoading();
        message.error(res.message ?? '网络异常');
        setLoading(false);
        return;
      }
      hideLoading();
      setForceSyncCooldownUntil(Date.now() + FORCE_SYNC_COOLDOWN_SEC * 1000);
      message.success('已触发全量同步');
      const isNarrowDate = datePreset === 'today' || datePreset === 'yesterday';
      if (isNarrowDate) message.info('同步完成，已为您拉取最新数据。若未看到新订单，请尝试扩大日期筛选范围。', 6);
      setPage(1);
      setOrders([]);
      setTotal(0);
      setDataVersion((v) => v + 1);
      await fetchOrders(effectiveShopIds, 1, pageSize, { cacheBust: true });
    } catch (err: unknown) {
      hideLoading();
      console.error(err);
      const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
      if (e.response?.status === 409) {
        message.error('当前店铺后台正在同步中，为防止数据冲突，请等待1-2分钟后再试。');
      } else {
        message.error(e.response?.data?.message || e.message || '网络异常');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedShopName, selectedSite, pageSize, fetchOrders, cooldownSeconds, datePreset]);

  // ── 主表列 ───────────────────────────────────────────────────

  const columns: ColumnsType<Order> = [
    {
      title: '站点', key: 'site', width: 90, align: 'center',
      render: (_: unknown, r: Order) => {
        const region = r.shop?.region || r.shop?.site || r.region || r.site;
        return region
          ? <Tag bordered={false} color="geekblue" style={{ fontWeight: 600 }}>{String(region)}</Tag>
          : <span style={{ color: '#94a3b8' }}>—</span>;
      },
    },
    {
      title: '订单号', key: 'orderId', width: 175,
      render: (_: unknown, r: Order) => {
        const id    = r.emag_order_id ?? r.platform_order_id ?? r.order_id ?? r.orderId;
        const isFbe = r.order_type === 2 || r.type === 2;
        return (
          <Space size={4} direction="vertical" style={{ gap: 2 }}>
            <Text
              strong
              copyable={{ text: String(id ?? ''), tooltips: ['复制', '已复制'] }}
              style={{ fontFamily: 'monospace', fontSize: 13, color: '#1677ff', letterSpacing: 0.3 }}
            >
              {id ?? '—'}
            </Text>
            {isFbe && <Tag color="blue" style={{ fontSize: 11, marginInlineEnd: 0 }}>FBE</Tag>}
          </Space>
        );
      },
    },
    {
      title: '下单时间', key: 'orderTime', width: 165,
      render: (_: unknown, r: Order) => {
        const t = r.orderTime ?? r.order_time ?? r.createdAt ?? r.created_at;
        return <span style={{ fontSize: 12, color: '#64748b' }}>{t ? new Date(t).toLocaleString('zh-CN') : '—'}</span>;
      },
    },
    {
      // ★ 新增：商品款数/数量，不展开也能一眼看出单子规模
      title: '商品数', key: 'itemCount', width: 80, align: 'center',
      render: (_: unknown, r: Order) => {
        const count = r.items?.length ?? r.products?.length ?? 0;
        const qty   = (r.items ?? r.products ?? []).reduce((sum, i) => sum + (i.quantity ?? 0), 0);
        return count > 0 ? (
          <Space direction="vertical" size={0} style={{ textAlign: 'center' }}>
            <Tag bordered={false} color="blue" style={{ fontSize: 12, fontWeight: 600, borderRadius: 10 }}>
              {count} 款
            </Tag>
            {qty > 0 && <span style={{ fontSize: 10, color: '#94a3b8' }}>共 {qty} 件</span>}
          </Space>
        ) : <span style={{ color: '#d9d9d9', fontSize: 12 }}>—</span>;
      },
    },
    {
      title: '订单金额', key: 'amount', width: 140, align: 'right',
      render: (_: unknown, r: Order) => {
        const v = r.amount ?? r.total ?? r.totalAmount ?? r.total_amount;
        const c = r.currency ?? '';
        return v != null ? (
          <Space size={4}>
            <Text strong style={{ fontSize: 14 }}>{formatPrice(v, c)}</Text>
            <Text type="secondary" style={{ fontSize: 10 }}>含税</Text>
          </Space>
        ) : <span style={{ color: '#d9d9d9' }}>—</span>;
      },
    },
    {
      title: '订单状态', key: 'status', width: 110, align: 'center',
      render: (_: unknown, r: Order) => {
        const statusText  = r.statusText ?? r.status_text ?? r.statusLabel ?? r.status_label ?? '';
        const rawStatus   = r.status;
        const text        = String(statusText).trim();
        const displayText = text || (rawStatus != null ? `未知 (${rawStatus})` : '');
        const style       = getStatusStyle(text || displayText);
        return !displayText ? (
          <span style={{ color: '#bfbfbf' }}>—</span>
        ) : (
          <Tag style={{ color: style.color, backgroundColor: style.bg, borderColor: style.border, border: '1px solid' }}>
            {displayText}
          </Tag>
        );
      },
    },
  ];

  // ── 一键展开 / 收起全部 ─────────────────────────────────────

  const handleToggleExpandAll = useCallback(() => {
    if (expandedRowKeys.length > 0) {
      setExpandedRowKeys([]);
    } else {
      const allExpandableKeys = orders
        .filter((r) => (r.items?.length ?? r.products?.length ?? 0) > 0)
        .map((r) => String(r.id ?? r.platform_order_id ?? r.order_id ?? r.orderId ?? ''));
      setExpandedRowKeys(allExpandableKeys);
    }
  }, [expandedRowKeys, orders]);

  // ── 展开行渲染 ───────────────────────────────────────────────

  const expandedRowRender = useCallback((record: Order) => (
    <ExpandedOrderRow record={record} currency={record.currency ?? ''} />
  ), []);

  const tableKey = `orders-${selectedShopName}-${selectedSite}-${page}-${dataVersion}`;

  // 用 void 消除 shopIdForSync 的 no-used-vars 警告（保留字段备用）
  void shopIdForSync;

  return (
    <div>
      {/* ── 页头 ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShoppingOutlined style={{ color: '#2563eb' }} /> 平台订单
          </h2>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>
            从 eMAG 同步的订单数据，点击行左侧 <b>▶</b> 展开查看买家信息与商品明细
          </p>
        </div>
        <Space wrap>
          {isSyncing && (
            <Alert
              message="正在后台同步历史订单..."
              type="info"
              showIcon
              icon={<SyncOutlined spin />}
              style={{ margin: 0, padding: '6px 12px', fontSize: 12 }}
            />
          )}
          <Space size="small" wrap>
            <Space size={4}>
              <span className="text-sm text-gray-500">店铺：</span>
              <Select
                placeholder="选择店铺"
                value={selectedShopName ?? undefined}
                onChange={(v) => { setSelectedShopName(v ?? null); setSelectedSite(SITE_ALL); }}
                options={shopNameOptions}
                style={{ minWidth: 140 }}
              />
            </Space>
            <Space size={4}>
              <span className="text-sm text-gray-500">站点：</span>
              <Select
                placeholder="选择站点"
                value={selectedSite}
                onChange={(v) => setSelectedSite(v ?? SITE_ALL)}
                options={siteOptions}
                disabled={!selectedShopName || shopsForName.length === 0}
                style={{ minWidth: 160 }}
              />
            </Space>
          </Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchOrders(effectiveShopIds, page, pageSize)} loading={loading}>
            刷新
          </Button>
          <Button
            icon={<ThunderboltOutlined />}
            onClick={handleForceSync}
            loading={loading}
            disabled={cooldownSeconds > 0}
          >
            {cooldownSeconds > 0
              ? `${Math.floor(cooldownSeconds / 60)}:${String(cooldownSeconds % 60).padStart(2, '0')} 后可再次同步`
              : '强制重加载'}
          </Button>
          {lastSyncTime && (
            <span style={{ color: '#64748b', fontSize: 12 }}>最近同步：{lastSyncTime}</span>
          )}
        </Space>
      </div>

      {/* ── 筛选工具栏 ── */}
      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0',
        padding: '16px 20px', marginBottom: 16,
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
      }}>
        <Space wrap size="middle">
          {/* ★ 展开/收起全部明细 — 置于筛选栏最左侧 */}
          <Button
            icon={expandedRowKeys.length > 0 ? <UpOutlined /> : <DownOutlined />}
            onClick={handleToggleExpandAll}
            disabled={orders.length === 0}
            style={{ marginRight: 4 }}
          >
            {expandedRowKeys.length > 0 ? '收起全部明细' : '展开全部明细'}
          </Button>
          <Space size={4}>
            <span style={{ color: '#64748b', fontSize: 13 }}>日期：</span>
            <Space.Compact size="small">
              {(['today', 'yesterday', '30d', 'month'] as const).map((preset) => (
                <Button
                  key={preset}
                  type={datePreset === preset ? 'primary' : 'default'}
                  size="small"
                  onClick={() => setDatePreset(preset)}
                >
                  {{ today: '今天', yesterday: '昨天', '30d': '过去30天', month: '当前月份' }[preset]}
                </Button>
              ))}
            </Space.Compact>
            <DatePicker.RangePicker
              size="small"
              value={
                datePreset === 'custom'
                  ? customDateRange
                  : (() => {
                      const r = getDateRangeForPreset(datePreset, null);
                      return r ? [dayjs(r[0]), dayjs(r[1])] as [Dayjs, Dayjs] : null;
                    })()
              }
              onChange={(dates) => {
                if (dates?.[0] && dates?.[1]) {
                  setDatePreset('custom');
                  setCustomDateRange([dates[0], dates[1]]);
                } else {
                  setDatePreset('30d');
                  setCustomDateRange(null);
                }
              }}
              placeholder={['开始日期', '结束日期']}
              format="YYYY-MM-DD"
              style={{ width: 240 }}
            />
          </Space>
          <Space size={4}>
            <span style={{ color: '#64748b', fontSize: 13 }}>订单号：</span>
            <Input
              placeholder="输入订单号搜索"
              value={filterOrderId}
              onChange={(e) => setFilterOrderId(e.target.value)}
              allowClear
              style={{ width: 180 }}
              onPressEnter={() => { setPage(1); fetchOrders(effectiveShopIds, 1, pageSize); }}
            />
          </Space>
          <Space size={4}>
            <span style={{ color: '#64748b', fontSize: 13 }}>状态：</span>
            <Select
              placeholder="全部状态"
              value={filterStatus || undefined}
              onChange={(v) => setFilterStatus(v ?? '')}
              options={STATUS_OPTIONS}
              style={{ width: 120 }}
              allowClear
            />
          </Space>
          <Space>
            <Button
              type="primary" icon={<SearchOutlined />} loading={loading}
              onClick={() => { setPage(1); fetchOrders(effectiveShopIds, 1, pageSize); }}
            >搜索</Button>
            <Button
              loading={loading}
              onClick={() => {
                setFilterOrderId('');
                setDatePreset('30d');
                setCustomDateRange(null);
                setFilterStatus('');
                setPage(1);
                fetchOrders(effectiveShopIds, 1, pageSize, { overrideFilter: {} });
              }}
            >重置</Button>
          </Space>
        </Space>
      </div>

      {/* ── 主表（含 expandable）── */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0' }}>
        <Table<Order>
          key={tableKey}
          dataSource={orders}
          columns={columns}
          rowKey={(r) => String(r.id ?? r.platform_order_id ?? r.order_id ?? r.orderId ?? '')}
          loading={loading}
          onChange={handleTableChange}
          scroll={{ x: 'max-content', y: 'calc(100vh - 310px)' }}
          pagination={{
            current:         page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100', '200'],
            showTotal:       (t) => `共 ${t} 条`,
          }}
          locale={{ emptyText: <Empty description={selectedShopName ? '暂无订单' : '请先选择店铺'} style={{ padding: 48 }} /> }}
          // ★ 核心：主子表展开配置
          expandable={{
            expandedRowKeys,
            onExpandedRowsChange: (keys) => setExpandedRowKeys([...keys]),
            expandedRowRender,
            // 无商品数据的行不允许展开
            rowExpandable: (record) => (record.items?.length ?? record.products?.length ?? 0) > 0,
            expandRowByClick: false, // 仅点击 ▶ 图标展开，不影响行内按钮点击
          }}
        />
      </div>
    </div>
  );
}
