import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Table, Button, Space, Empty, Typography, Select, Modal, Descriptions, message, Tag, Alert, Input, DatePicker,
} from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { ReloadOutlined, ShoppingOutlined, SyncOutlined, ThunderboltOutlined, SearchOutlined, AppstoreOutlined } from '@ant-design/icons';
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
    today: [today, today],
    yesterday: [dayjs().subtract(1, 'day').format('YYYY-MM-DD'), dayjs().subtract(1, 'day').format('YYYY-MM-DD')],
    '30d': [dayjs().subtract(29, 'day').format('YYYY-MM-DD'), today],
    month: [dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().endOf('month').format('YYYY-MM-DD')],
    custom: [today, today],
  };
  return ranges[preset] ?? null;
}

// 状态筛选选项
const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '新订单', value: '新订单' },
  { label: '处理中', value: '处理中' },
  { label: '已准备', value: '已准备' },
  { label: '已退货', value: '已退货' },
  { label: '已完成', value: '已完成' },
  { label: '已取消', value: '已取消' },
];

// 状态标签颜色：eMAG 风格，与官方界面接近
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

// 构建跳转链接：新窗口打开平台产品页面（用于 SKU / 图片点击跳转）
function buildPlatformProductsUrl(sku?: string): string {
  const base = `${window.location.origin}/dashboard`;
  const params = new URLSearchParams({ tab: 'platform-products' });
  if (sku && String(sku).trim()) params.set('sku', String(sku).trim());
  return `${base}?${params.toString()}`;
}

// ─── 订单类型 ─────────────────────────────────────────────────
interface OrderItem {
  id?: number;
  productName?: string;
  product_name?: string;
  sku?: string;
  ext_part_number?: string;
  quantity?: number;
  price?: number;
  sale_price?: number;
  total?: number;
  image?: string;
  imageUrl?: string;
  image_url?: string;
  product_image?: string;
  display_image?: string;
  pnk?: string;
}

interface Order {
  id: number;
  orderId?: string;
  order_id?: string;
  platform_order_id?: string;
  emag_order_id?: string;
  shopId?: number;
  shop_id?: number;
  shop?: { region?: string; site?: string };
  region?: string | null;
  site?: string | null;
  order_type?: number;
  type?: number;
  createdAt?: string;
  created_at?: string;
  orderTime?: string;
  order_time?: string;
  amount?: number;
  total?: number;
  totalAmount?: number;
  total_amount?: number;
  status?: string | number;
  statusText?: string;
  status_text?: string;
  statusLabel?: string;
  status_label?: string;
  currency?: string;
  buyerName?: string;
  buyer_name?: string;
  customer_name?: string;
  name?: string;
  full_name?: string;
  recipient_name?: string;
  recipientName?: string;
  buyerEmail?: string;
  buyer_email?: string;
  buyerPhone?: string;
  buyer_phone?: string;
  customer_phone?: string;
  phone?: string;
  shippingAddress?: string;
  shipping_address?: string;
  address?: string;
  delivery_address?: string;
  items?: OrderItem[];
  products?: OrderItem[];
  customer?: { name?: string; full_name?: string };
  buyer?: { name?: string; full_name?: string };
}

type ShopRecord = { id: number; shopName: string; platform: string; region?: string | null; site?: string | null };

export default function PlatformOrders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [shops, setShops] = useState<ShopRecord[]>([]);
  const [selectedShopName, setSelectedShopName] = useState<string | null>(null);
  const [selectedSite, setSelectedSite] = useState<string>(SITE_ALL);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const prevTotalRef = useRef(0);
  const [forceSyncCooldownUntil, setForceSyncCooldownUntil] = useState<number>(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // 筛选条件
  const [filterOrderId, setFilterOrderId] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('30d');
  const [customDateRange, setCustomDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');

  // 去重后的店铺名列表
  const shopNameOptions = [...new Set(shops.map((s) => s.shopName.trim()).filter(Boolean))].map((name) => ({ label: name, value: name }));
  // 当前店铺名下的站点选项（含全部站点）
  const shopsForName = selectedShopName ? shops.filter((s) => s.shopName.trim() === selectedShopName) : [];
  const siteOptions = [
    { label: '🌍 全部站点', value: SITE_ALL },
    ...shopsForName
      .map((s) => (s.region ?? s.site ?? '') as string)
      .filter(Boolean)
      .filter((r, i, arr) => arr.indexOf(r) === i)
      .map((r) => ({ label: r, value: r })),
  ];
  // 当前筛选对应的 shopIds
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

  useEffect(() => {
    isSyncingRef.current = isSyncing;
  }, [isSyncing]);

  // 强制同步冷却倒计时（5 分钟）
  const FORCE_SYNC_COOLDOWN_SEC = 300;
  useEffect(() => {
    if (forceSyncCooldownUntil <= 0) {
      setCooldownSeconds(0);
      return;
    }
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
      orderId: filterOrderId?.trim() || undefined,
      startDate: range?.[0],
      endDate: range?.[1],
      status: filterStatus?.trim() || undefined,
    };
  }, [filterOrderId, datePreset, customDateRange, filterStatus]);

  const fetchOrders = useCallback(async (
    sids: number[],
    p = 1,
    ps = 50,
    opts?: { cacheBust?: boolean; overrideFilter?: { orderId?: string; startDate?: string; endDate?: string; status?: string } },
  ) => {
    if (sids.length === 0) {
      setOrders([]);
      setTotal(0);
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) {
      message.warning('请先登录');
      return;
    }
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: p, pageSize: ps };
      if (sids.length === 1) {
        params.shopId = sids[0];
      } else {
        params.shopIds = sids.join(',');
      }
      if (opts?.cacheBust) params._t = Date.now();
      const filter = opts?.overrideFilter ?? buildFilterOpts();
      if (filter.orderId) params.orderId = filter.orderId;
      if (filter.startDate) params.startDate = filter.startDate;
      if (filter.endDate) params.endDate = filter.endDate;
      if (filter.status) params.status = filter.status;
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
        const raw = res.data;
        const list = Array.isArray(raw) ? raw : (raw && Array.isArray((raw as { list?: Order[] }).list) ? (raw as { list: Order[] }).list : []);
        const totalVal = (res as { total?: number }).total ?? (raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { total?: number }).total : undefined);
        if ((totalVal ?? 0) > 0 && list.length === 0) {
          console.warn('[平台订单] 分页断档：总数', totalVal, '但当前页返回空数组，尝试重新请求第一页');
          setPage(1);
          setTimeout(() => fetchOrders(sids, 1, ps, { cacheBust: true }), 300);
          return;
        }
        setOrders(list);
        const newTotal = totalVal ?? list.length;
        setTotal(newTotal);
        prevTotalRef.current = newTotal;
        setDataVersion((v) => v + 1);
        const syncing = (res as { isSyncing?: boolean; is_syncing?: boolean }).isSyncing ?? (res as { isSyncing?: boolean; is_syncing?: boolean }).is_syncing ?? false;
        const apiLastSync = (res as { lastSyncAt?: string; last_sync_at?: string }).lastSyncAt ?? (res as { lastSyncAt?: string; last_sync_at?: string }).last_sync_at;
        if (apiLastSync) {
          setLastSyncTime(dayjs(apiLastSync).format('YYYY-MM-DD HH:mm'));
        }
        const wasSyncing = isSyncingRef.current;
        setIsSyncing(syncing);
        if (wasSyncing && !syncing) {
          if (!apiLastSync) setLastSyncTime(dayjs().format('YYYY-MM-DD HH:mm'));
          setTimeout(() => fetchOrders(sids, 1, ps, { cacheBust: true }), 100);
        }
      } else {
        setOrders([]);
        setTotal(0);
      }
    } catch (err) {
      setOrders([]);
      setTotal(0);
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status !== 401) message.error('加载订单失败');
    } finally {
      setLoading(false);
    }
  }, [buildFilterOpts]);

  useEffect(() => {
    fetchShops();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 筛选变化时同步 URL
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

  // 同步进行中时轮询，以便及时获取 isSyncing 状态变化
  useEffect(() => {
    if (!isSyncing || effectiveShopIds.length === 0) return;
    const timer = setInterval(() => {
      fetchOrders(effectiveShopIds, page, pageSize);
    }, 5000);
    return () => clearInterval(timer);
  }, [isSyncing, selectedShopName, selectedSite, page, pageSize, fetchOrders]);

  // 定时轮询检测新订单，自动刷新并提醒
  useEffect(() => {
    if (effectiveShopIds.length === 0) return;
    const timer = setInterval(async () => {
      if (loading) return;
      try {
        const params: Record<string, string | number> = { page: 1, pageSize: 1 };
        if (effectiveShopIds.length === 1) params.shopId = effectiveShopIds[0];
        else params.shopIds = effectiveShopIds.join(',');
        const filter = buildFilterOpts();
        if (filter.orderId) params.orderId = filter.orderId;
        if (filter.startDate) params.startDate = filter.startDate;
        if (filter.endDate) params.endDate = filter.endDate;
        if (filter.status) params.status = filter.status;
        const { data: res } = await request.get<{ code: number; total?: number; data?: { list?: unknown[]; total?: number } }>('/orders', { params });
        if (res.code === 200) {
          const raw = res.data;
          const newTotal = (res as { total?: number }).total ?? (raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { total?: number }).total : undefined) ?? 0;
          const prev = prevTotalRef.current;
          if (prev > 0 && newTotal > prev) {
            const diff = newTotal - prev;
            message.info(`发现 ${diff} 笔新订单，已为您自动刷新列表`, 4);
            fetchOrders(effectiveShopIds, page, pageSize);
          }
        }
      } catch {
        // 静默失败
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [selectedShopName, selectedSite, page, pageSize, loading, buildFilterOpts, fetchOrders]);

  const handleTableChange = useCallback((pag: { current?: number; pageSize?: number } /* , _filters, _sorter, _extra */) => {
    const np = pag.current ?? 1;
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
      // 请求路径：/api/orders/sync（与后端挂载一致，若 404 请核对后端路由）
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
      if (isNarrowDate) {
        message.info('同步完成，已为您拉取最新数据。若未看到新订单，请尝试扩大日期筛选范围。', 6);
      }
      setDetailModalOpen(false);
      setDetailOrder(null);
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
        const errMsg = e.response?.data?.message || e.message || '网络异常';
        message.error(errMsg);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedShopName, selectedSite, pageSize, fetchOrders, cooldownSeconds, datePreset]);

  const handleViewDetail = (order: Order) => {
    setDetailOrder(order);
    setDetailModalOpen(true);
  };

  const columns: ColumnsType<Order> = [
    {
      title: '站点',
      key: 'site',
      width: 110,
      align: 'center',
      render: (_: unknown, r: Order) => {
        const region = r.shop?.region || r.shop?.site || r.region || r.site;
        if (!region) return <span style={{ color: '#94a3b8' }}>未知站点</span>;
        return <span>{String(region)}</span>;
      },
    },
    {
      title: '单号',
      dataIndex: 'platform_order_id',
      key: 'orderId',
      width: 180,
      render: (_: unknown, r: Order) => {
        const id = r.emag_order_id ?? r.platform_order_id ?? r.order_id ?? r.orderId;
        const isFbe = r.order_type === 2 || r.type === 2;
        return (
          <Space size={6} wrap>
            <Button type="link" size="small" onClick={() => handleViewDetail(r)} style={{ padding: 0, fontFamily: 'monospace' }}>
              {id ?? '—'}
            </Button>
            {isFbe && <Tag color="blue">FBE</Tag>}
          </Space>
        );
      },
    },
    {
      title: '下单时间',
      dataIndex: 'orderTime',
      key: 'orderTime',
      width: 180,
      render: (_: unknown, r: Order) => {
        const t = r.orderTime ?? r.order_time ?? r.createdAt ?? r.created_at;
        return <span>{t ? new Date(t).toLocaleString('zh-CN') : '—'}</span>;
      },
    },
    {
      title: '订单金额',
      key: 'amount',
      width: 150,
      render: (_: unknown, r: Order) => {
        const v = r.amount ?? r.total ?? r.totalAmount ?? r.total_amount;
        const c = r.currency ?? '';
        return (
          <Space size={4}>
            <Text strong>{v != null ? formatPrice(v, c) : '—'}</Text>
            {v != null && <Text type="secondary" style={{ fontSize: 11 }}>含税</Text>}
          </Space>
        );
      },
    },
    {
      title: '订单状态',
      dataIndex: 'status_text',
      key: 'status',
      width: 130,
      render: (_: unknown, r: Order) => {
        const statusText = r.statusText ?? r.status_text ?? r.statusLabel ?? r.status_label ?? '';
        const rawStatus = r.status;
        const text = String(statusText).trim();
        const displayText = text || (rawStatus != null ? `未知状态 (${rawStatus})` : '');
        const style = getStatusStyle(text || displayText);
        return !displayText ? (
          <span style={{ color: '#bfbfbf' }}>—</span>
        ) : (
          <Tag
            style={{
              color: style.color,
              backgroundColor: style.bg,
              borderColor: style.border,
              border: '1px solid',
            }}
          >
            {displayText}
          </Tag>
        );
      },
    },
  ];

  const detailItems = detailOrder ? (detailOrder.items ?? detailOrder.products ?? []) : [];

  // 强制 Table 在数据更新后重新渲染状态列
  const tableKey = `orders-${selectedShopName}-${selectedSite}-${page}-${dataVersion}`;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShoppingOutlined style={{ color: '#2563eb' }} /> 平台订单
          </h2>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>
            从 eMAG 同步的订单数据，支持查看买家信息与商品明细
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
                onChange={(v) => {
                  setSelectedShopName(v ?? null);
                  setSelectedSite(SITE_ALL);
                }}
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
            <span style={{ color: '#64748b', fontSize: 12 }}>
              最近同步：{lastSyncTime}
            </span>
          )}
        </Space>
      </div>

      {/* 筛选工具栏 */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          border: '1px solid #f0f0f0',
          padding: '16px 20px',
          marginBottom: 16,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Space wrap size="middle">
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
              type="primary"
              icon={<SearchOutlined />}
              onClick={() => {
                setPage(1);
                fetchOrders(effectiveShopIds, 1, pageSize);
              }}
              loading={loading}
            >
              搜索
            </Button>
            <Button
              onClick={() => {
                setFilterOrderId('');
                setDatePreset('30d');
                setCustomDateRange(null);
                setFilterStatus('');
                setPage(1);
                fetchOrders(effectiveShopIds, 1, pageSize, { overrideFilter: {} });
              }}
              loading={loading}
            >
              重置
            </Button>
          </Space>
        </Space>
      </div>

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
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100', '200'],
            showTotal: (t) => `共 ${t} 条`,
          }}
          locale={{ emptyText: <Empty description={selectedShopName ? '暂无订单' : '请先选择店铺'} style={{ padding: 48 }} /> }}
        />
      </div>

      {/* 订单详情弹窗 */}
      <Modal
        title={
          <Space wrap>
            <Text strong>订单详情</Text>
            <Text code type="secondary">{detailOrder?.emag_order_id ?? detailOrder?.platform_order_id ?? detailOrder?.order_id ?? detailOrder?.orderId ?? '—'}</Text>
            {(detailOrder?.order_type === 2 || detailOrder?.type === 2) && (
              <Tag color="blue">FBE (eMAG发货)</Tag>
            )}
          </Space>
        }
        open={detailModalOpen}
        onCancel={() => { setDetailModalOpen(false); setDetailOrder(null); }}
        footer={[<Button key="close" onClick={() => { setDetailModalOpen(false); setDetailOrder(null); }}>关闭</Button>]}
        width={640}
      >
        {detailOrder && (
          <>
            <Descriptions title="买家信息" column={1} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="姓名">{[detailOrder.buyerName, detailOrder.buyer_name, detailOrder.customer_name, detailOrder.name, detailOrder.full_name, detailOrder.recipient_name, detailOrder.recipientName, detailOrder.customer?.name, detailOrder.customer?.full_name, detailOrder.buyer?.name, detailOrder.buyer?.full_name].find((x) => x != null && String(x).trim()) ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{detailOrder.buyerEmail ?? detailOrder.buyer_email ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="电话">{detailOrder.buyerPhone ?? detailOrder.buyer_phone ?? detailOrder.customer_phone ?? detailOrder.phone ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="收货地址">{detailOrder.shippingAddress ?? detailOrder.shipping_address ?? detailOrder.address ?? detailOrder.delivery_address ?? '—'}</Descriptions.Item>
            </Descriptions>
            {(() => {
              const amt = detailOrder!.amount ?? detailOrder!.total ?? detailOrder!.totalAmount ?? detailOrder!.total_amount;
              return amt != null ? (
                <div style={{ marginBottom: 16 }}>
                  <Text strong>订单金额：</Text>
                  <Text strong>{formatPrice(amt, detailOrder!.currency ?? '')}</Text>
                  <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>含税</Text>
                </div>
              ) : null;
            })()}
            <div>
              <Text strong style={{ marginBottom: 8, display: 'block' }}>商品列表</Text>
              {detailItems.length > 0 ? (
                <Table
                  dataSource={detailItems}
                  columns={[
                    {
                      title: '图片',
                      key: 'image',
                      width: 90,
                      align: 'center',
                      render: (_: unknown, r: OrderItem) => {
                        const url = r.display_image ?? r.image ?? r.imageUrl ?? r.image_url ?? r.product_image;
                        const sku = (r.ext_part_number ?? r.sku ?? '').toString().trim();
                        const linkUrl = buildPlatformProductsUrl(sku || undefined);
                        const linkProps = { href: linkUrl, target: '_blank', rel: 'noopener noreferrer' };
                        if (!url || typeof url !== 'string' || !url.trim()) {
                          return (
                            <a {...linkProps} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, color: '#94a3b8' }}>
                              <AppstoreOutlined style={{ fontSize: 12 }} />
                              待补全平台产品
                            </a>
                          );
                        }
                        return (
                          <a {...linkProps} style={{ display: 'block' }}>
                            <img
                              src={url}
                              alt=""
                              style={{ width: 60, height: 60, objectFit: 'contain', display: 'block', margin: '0 auto' }}
                            />
                          </a>
                        );
                      },
                    },
                    {
                      title: 'SKU',
                      dataIndex: 'ext_part_number',
                      key: 'sku',
                      width: 140,
                      render: (v: string, r: OrderItem) => {
                        const sku = (v ?? r.sku ?? '—').toString().trim() || '—';
                        const linkUrl = buildPlatformProductsUrl(sku !== '—' ? sku : undefined);
                        if (sku === '—') return sku;
                        return (
                          <a href={linkUrl} target="_blank" rel="noopener noreferrer">
                            {sku}
                          </a>
                        );
                      },
                    },
                    { title: '数量', dataIndex: 'quantity', key: 'qty', width: 80 },
                    { title: '单价', dataIndex: 'sale_price', key: 'price', width: 110, render: (v: number) => v != null ? formatPrice(v, detailOrder!.currency ?? '') : '—' },
                    { title: '小计', key: 'total', width: 110, render: (_: unknown, r: OrderItem) => { const q = r.quantity ?? 0; const p = r.sale_price ?? r.price ?? 0; return (q && p) ? formatPrice(q * p, detailOrder!.currency ?? '') : '—'; } },
                  ]}
                  rowKey={(r, i) => String(r.id ?? i)}
                  pagination={false}
                  size="small"
                />
              ) : (
                <Empty description="暂无商品明细" style={{ padding: 24 }} />
              )}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
