import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getStoredPermissions, isAdminUser, writeAuthCache, clearAuth, type StoredUser } from '../lib/auth';
import dayjs, { type Dayjs } from 'dayjs';
import request from '../lib/request';
import { formatCurrencySuffix } from '../lib/currency';
import PublicPool from './PublicPool';
import PrivatePool from './PrivatePool';
import ProcurementPlanning from './ProcurementPlanning';
import ProcurementManagement from './ProcurementManagement';
import InventorySKU from './InventorySKU';
import UserManagement from './UserManagement';
import RoleManagement from './RoleManagement';
import AlibabaSettings from './AlibabaSettings';
import ShopAuth from './ShopAuth';
import PlatformProducts from './PlatformProducts';
import PlatformOrders from './PlatformOrders';
import SyncStatusBar from '../components/SyncStatusBar';
import {
  Layout, Menu, Avatar, Dropdown, Tag, Badge,
  Typography, Space, Button, Statistic, DatePicker, Spin, Select, Alert, message,
} from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  GlobalOutlined,
  StarOutlined,
  LogoutOutlined,
  UserOutlined,
  RiseOutlined,
  ShoppingCartOutlined,
  BellOutlined,
  ClockCircleOutlined,
  DownOutlined,
  FileTextOutlined,
  SettingOutlined,
  BulbOutlined,
  DatabaseOutlined,
  ApiOutlined,
  ShopOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  ShoppingOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
} from 'recharts';

const { Sider, Header, Content } = Layout;
const { Title, Text } = Typography;

// 数字跳动动画样式
const statPopStyle = `
@keyframes statPopIn {
  0% { transform: scale(0.9); opacity: 0.7; }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); opacity: 1; }
}
.stat-pop-in {
  animation: statPopIn 0.45s ease-out;
}
`;

const SELECTED_SHOP_KEY = 'selectedShopId';

// ── 从 localStorage 读取登录用户信息 ─────────────────────────
function getStoredUser() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    return JSON.parse(raw) as {
      id: number;
      username: string;
      name: string;
      avatar: string | null;
      role: { id: number; name: string };
    };
  } catch {
    return null;
  }
}

// ── 菜单项类型（扩展了 code 字段用于权限过滤） ────────────────
interface AppMenuItem {
  key:       string;
  icon?:     React.ReactNode;
  label:     string;
  code?:     string;           // 权限码，undefined = 无需权限（始终可见）
  children?: AppMenuItem[];
}

// ── 全量菜单配置（含权限码） ───────────────────────────────────
// code 对应后端 Permission 表的 code 字段，由后端通过 GET /permissions/tree 定义。
// 父级分组节点不设 code，子节点全部被过滤后父节点自动隐藏。
// ── 全量菜单配置（code 与后端 Permission 表 code 字段严格对齐） ─
const ALL_MENU_ITEMS: AppMenuItem[] = [
  { key: 'dashboard', icon: <DashboardOutlined />, label: '仪表盘' }, // 始终可见，无需权限码
  {
    key: 'product-dev',
    icon: <BulbOutlined />,
    label: '产品开发',
    children: [
      { key: 'pool',          icon: <GlobalOutlined />,   label: '公海产品', code: 'MENU_PUBLIC_PRODUCTS' },
      { key: 'private-pool',  icon: <StarOutlined />,     label: '意向产品', code: 'MENU_INTENT_PRODUCTS'  },
      { key: 'inventory-sku', icon: <DatabaseOutlined />, label: '库存 SKU', code: 'MENU_INVENTORY'         },
    ],
  },
  {
    key: 'platform-data',
    icon: <BarChartOutlined />,
    label: '平台数据',
    children: [
      { key: 'platform-products', icon: <AppstoreOutlined />, label: '平台产品', code: 'MENU_PLATFORM_PRODUCTS' },
      { key: 'platform-orders',   icon: <ShoppingOutlined />, label: '平台订单', code: 'MENU_PLATFORM_ORDERS'   },
    ],
  },
  {
    key: 'supply-chain',
    icon: <ShoppingCartOutlined />,
    label: '供应采购',
    children: [
      { key: 'sc-planning',   icon: <FileTextOutlined />, label: '采购计划', code: 'MENU_PURCHASE_PLAN'    },
      { key: 'sc-management', icon: <SettingOutlined />,  label: '采购管理', code: 'MENU_PURCHASE_MANAGE'  },
    ],
  },
  {
    key: 'user-center',
    icon: <TeamOutlined />,
    label: '用户管理',
    children: [
      { key: 'users', icon: <UserOutlined />,              label: '分配账号', code: 'MENU_ASSIGN_ACCOUNT' },
      { key: 'roles', icon: <SafetyCertificateOutlined />, label: '角色管理', code: 'MENU_ROLE_MANAGE'    },
    ],
  },
  {
    key: 'sys-settings',
    icon: <SettingOutlined />,
    label: '系统设置',
    children: [
      { key: 'shop-auth',        icon: <ShopOutlined />, label: '店铺授权',  code: 'MENU_SHOP_AUTH'    },
      { key: 'alibaba-settings', icon: <ApiOutlined />,  label: '1688 配置', code: 'MENU_1688_CONFIG'   },
    ],
  },
];

// ── 权限过滤：递归保留有权访问的菜单节点 ─────────────────────
// permissions === null → 超管或老会话，返回全量
// 父级分组：子节点过滤后若全部被移除，则父节点也隐藏
function filterMenuItems(items: AppMenuItem[], permissions: string[] | null): AppMenuItem[] {
  if (permissions === null) return items;
  return items.reduce<AppMenuItem[]>((acc, item) => {
    if (item.children) {
      const visibleChildren = filterMenuItems(item.children, permissions);
      if (visibleChildren.length > 0) acc.push({ ...item, children: visibleChildren });
    } else {
      // 无 code 的叶子节点（如仪表盘）始终可见
      if (!item.code || permissions.includes(item.code)) acc.push(item);
    }
    return acc;
  }, []);
}

// ── 将 AppMenuItem[] 转换为 Ant Design Menu 接受的 ItemType[] ─
// 剥离 code 字段，避免 TypeScript 类型冲突
type AntMenuItem = {
  key: string;
  icon?: React.ReactNode;
  label: string;
  children?: AntMenuItem[];
};
function toAntMenuItems(items: AppMenuItem[]): AntMenuItem[] {
  return items.map(({ key, icon, label, children }) => ({
    key,
    icon,
    label,
    children: children ? toAntMenuItems(children) : undefined,
  }));
}

// ── 从过滤后的菜单中收集所有叶子节点 key（用于访问权限校验） ──
function collectLeafKeys(items: AppMenuItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of items) {
    if (item.children) {
      for (const k of collectLeafKeys(item.children)) keys.add(k);
    } else {
      keys.add(item.key);
    }
  }
  return keys;
}

const menuLabelMap: Record<string, string> = {
  'dashboard':         '仪表盘',
  'pool':              '产品开发 / 公海产品',
  'private-pool':      '产品开发 / 意向产品',
  'inventory-sku':     '产品开发 / 库存 SKU',
  'platform-products': '平台数据 / 平台产品',
  'platform-orders':   '平台数据 / 平台订单',
  'sc-planning':       '供应采购 / 采购计划',
  'sc-management':     '供应采购 / 采购管理',
  'users':             '用户管理 / 分配账号',
  'roles':             '用户管理 / 角色管理',
  'shop-auth':         '系统设置 / 店铺授权',
  'alibaba-settings':  '系统设置 / 1688 配置',
};

// ── 店铺选项（用于仪表盘筛选）─────────────────────────────────
interface ShopOption {
  id: number;
  shopName: string;
  platform: string;
  region?: string | null;
  site?: string | null;
}

const REGION_DISPLAY: Record<string, string> = { RO: '🇷🇴 罗马尼亚', BG: '🇧🇬 保加利亚', HU: '🇭🇺 匈牙利' };
function shopLabel(s: ShopOption): string {
  const region = s.region ?? s.site;
  if (s.platform === 'eMAG' && region && REGION_DISPLAY[region]) {
    return `${s.shopName} (${s.platform} · ${REGION_DISPLAY[region]})`;
  }
  return `${s.shopName} (${s.platform})`;
}

// ── 仪表盘 stats API 响应类型 ─────────────────────────────────
interface DashboardStatsData {
  totalOrders?: number;
  total_orders?: number;
  gmv?: number;
  awaitingAcknowledge?: number;
  awaiting_acknowledge?: number;
  currency?: string | null;
}

// ── 趋势图单日数据 ─────────────────────────────────────────────
interface TrendDayItem {
  day?: string;
  date?: string;
  orders?: number;
  sales?: number;
  order_count?: number;
  sales_amount?: number;
  gmv?: number;
}

// ── 时间范围预设 ─────────────────────────────────────────────
type TimeRangePreset = 'today' | '7d' | '14d' | '30d' | 'custom';

function getRangeForPreset(preset: TimeRangePreset, customRange: [Dayjs, Dayjs] | null): [string, string] {
  const today = dayjs().format('YYYY-MM-DD');
  if (preset === 'custom' && customRange) {
    return [customRange[0].format('YYYY-MM-DD'), customRange[1].format('YYYY-MM-DD')];
  }
  const start = (
    {
      today: dayjs().format('YYYY-MM-DD'),
      '7d': dayjs().subtract(6, 'day').format('YYYY-MM-DD'),
      '14d': dayjs().subtract(13, 'day').format('YYYY-MM-DD'),
      '30d': dayjs().subtract(29, 'day').format('YYYY-MM-DD'),
      custom: today,
    } as Record<TimeRangePreset, string>
  )[preset] ?? today;
  return [start, today];
}

// ── 主组件 ────────────────────────────────────────────────────
const TAB_KEYS = ['platform-products', 'inventory-sku', 'platform-orders'] as const;

// ── /me 接口响应类型 ───────────────────────────────────────────
interface MeResponseData {
  id:          number;
  username:    string;
  name:        string;
  avatar:      string | null;
  role:        { id: number; name: string; isAdmin?: boolean };
  permissions: string[] | null; // null = 超管（不限制），[] = 无权限，[...] = 具体列表
}

export default function Dashboard() {
  const navigate  = useNavigate();
  const [searchParams] = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [activeKey, setActiveKey] = useState('dashboard');
  const [openKeys,  setOpenKeys]  = useState<string[]>(['product-dev', 'platform-data', 'supply-chain', 'sys-settings', 'user-center']);

  // ── 权限状态（React state，确保更新后触发重渲染） ─────────────
  // 初始值从 localStorage 读取，避免首次渲染闪烁
  const [permissions, setPermissions] = useState<string[] | null>(getStoredPermissions);
  const [adminFlag,   setAdminFlag]   = useState<boolean>(isAdminUser);
  // 刷新用户信息（供 Header 实时展示用）
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(getStoredUser);

  // ── 应用初始化：调用 /me 接口获取最新权限 ─────────────────────
  // 每次页面刷新都会执行，确保权限始终与后端同步，不依赖 localStorage 老数据。
  useEffect(() => {
    let cancelled = false;
    request
      .get<{ code: number; data: MeResponseData; message?: string }>('/auth/me')
      .then(({ data: res }) => {
        if (cancelled) return;
        if (res.code === 200 && res.data) {
          const { permissions: freshPerms, ...userFields } = res.data;
          const freshUser: StoredUser = {
            id:       userFields.id,
            username: userFields.username,
            name:     userFields.name,
            avatar:   userFields.avatar,
            role:     userFields.role,
          };
          // ① 更新 localStorage 缓存（供下次刷新初始快照使用）
          writeAuthCache(freshUser, freshPerms);
          // ② 更新 React state → 触发菜单重新过滤
          const isAdmin = freshUser.role?.isAdmin === true || freshPerms === null;
          setAdminFlag(isAdmin);
          setPermissions(freshPerms);
          setCurrentUser(freshUser);
        }
      })
      .catch(() => {
        if (cancelled) return;
        // token 失效或网络异常 → 跳转登录页
        navigate('/login');
      });
    return () => { cancelled = true; };
  // 仅在组件挂载时执行一次
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 权限过滤：依赖 React state，permissions/adminFlag 变化后自动重算 ──
  const filteredMenuConfig = useMemo(
    () => filterMenuItems(ALL_MENU_ITEMS, adminFlag ? null : permissions),
    [permissions, adminFlag],
  );
  const antMenuItems = useMemo(() => toAntMenuItems(filteredMenuConfig), [filteredMenuConfig]);
  const allowedKeys  = useMemo(() => collectLeafKeys(filteredMenuConfig),  [filteredMenuConfig]);

  // ── 安全跳转：若 key 无权访问，回落到仪表盘 ──────────────────
  const gotoKey = useCallback((key: string) => {
    if (key === 'dashboard' || allowedKeys.has(key)) {
      setActiveKey(key);
    } else {
      message.warning('您没有访问该模块的权限');
      setActiveKey('dashboard');
    }
  }, [allowedKeys]);

  // 支持 URL ?tab= 直接打开对应页面（如从订单详情新窗口跳转）
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && TAB_KEYS.includes(tab as (typeof TAB_KEYS)[number])) {
      gotoKey(tab);
    }
  }, [searchParams, gotoKey]);

  // ── 时间筛选 ─────────────────────────────────────────────────
  const [timeRangePreset, setTimeRangePreset] = useState<TimeRangePreset>('7d');
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);

  // ── 店铺选择（从缓存或接口获取）────────────────────────────────
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [shopId, setShopId] = useState<number | null>(null);
  const [shopsFetched, setShopsFetched] = useState(false);

  const fetchShops = useCallback(async () => {
    try {
      const { data: res } = await request.get<{ code: number; data?: ShopOption[] | { list?: ShopOption[] } }>('/shops');
      const raw = res?.data;
      const list = Array.isArray(raw)
        ? raw
        : (raw && typeof raw === 'object' && Array.isArray((raw as { list?: ShopOption[] }).list))
          ? (raw as { list: ShopOption[] }).list
          : [];
      setShops(list);
      setShopsFetched(true);
      console.log('=== FRONTEND SHOP DROPDOWN ===', list);
      const cached = localStorage.getItem(SELECTED_SHOP_KEY);
      const cachedId = cached ? parseInt(cached, 10) : NaN;
      const validCached = list.some((s) => s.id === cachedId);
      if (validCached && !isNaN(cachedId)) {
        setShopId(cachedId);
      } else if (list.length > 0) {
        const first = list[0].id;
        setShopId(first);
        localStorage.setItem(SELECTED_SHOP_KEY, String(first));
      } else {
        setShopId(null);
      }
    } catch {
      setShopId(null);
      setShopsFetched(true);
    }
  }, []);

  useEffect(() => {
    if (activeKey === 'dashboard') fetchShops();
  }, [activeKey, fetchShops]);

  const handleShopChange = (id: number | null) => {
    setShopId(id);
    if (id != null) localStorage.setItem(SELECTED_SHOP_KEY, String(id));
    else localStorage.removeItem(SELECTED_SHOP_KEY);
  };

  // ── 实时业绩看板数据 ─────────────────────────────────────────
  const [stats, setStats] = useState<DashboardStatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [trendData, setTrendData] = useState<TrendDayItem[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);

  const isLoading = statsLoading || trendLoading;

  const fetchStats = useCallback(async (start: string, end: string, sid: number | null) => {
    setStatsLoading(true);
    try {
      const params: Record<string, string | number> = { startDate: start, endDate: end };
      if (sid != null) params.shopId = sid;
      const { data: res } = await request.get<{
        code: number;
        data: DashboardStatsData & { trend_data?: TrendDayItem[]; trendData?: TrendDayItem[] };
      }>('/dashboard/stats', { params });
      if (res.code === 200 && res.data) {
        setStats(res.data);
        const rawTrend = (res.data as { trend_data?: TrendDayItem[]; trendData?: TrendDayItem[] }).trend_data
          ?? (res.data as { trend_data?: TrendDayItem[]; trendData?: TrendDayItem[] }).trendData;
        if (Array.isArray(rawTrend) && rawTrend.length > 0) {
          const mapped = rawTrend.map((d: TrendDayItem) => {
            const date = d.date ?? '';
            const day = d.day ?? (date ? dayjs(date).format('MM-DD') : '');
            const orderCount = Number(d.order_count ?? d.orders ?? 0) || 0;
            const salesAmount = Number(d.sales_amount ?? d.sales ?? d.gmv ?? 0) || 0;
            return { day, date, order_count: orderCount, sales_amount: salesAmount };
          });
          mapped.sort((a, b) => (a.date || a.day).localeCompare(b.date || b.day));
          setTrendData(mapped);
        }
      } else {
        setStats({ totalOrders: 0, gmv: 0, awaitingAcknowledge: 0 });
      }
    } catch (err) {
      setStats({ totalOrders: 0, gmv: 0, awaitingAcknowledge: 0 });
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        clearAuth();
        window.location.href = '/login';
      }
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchTrend = useCallback(async (start: string, end: string, sid: number | null) => {
    setTrendLoading(true);
    try {
      const params: Record<string, string | number> = { startDate: start, endDate: end };
      if (sid != null) params.shopId = sid;
      const { data: res } = await request.get<{ code: number; data: TrendDayItem[] }>('/dashboard/trend', {
        params,
      });
      if (res.code === 200 && Array.isArray(res.data)) {
        const mapped = res.data.map((d: TrendDayItem) => {
          const date = d.date ?? '';
          const day = d.day ?? (date ? dayjs(date).format('MM-DD') : '');
          const orderCount = Number(d.order_count ?? d.orders ?? 0) || 0;
          const salesAmount = Number(d.sales_amount ?? d.sales ?? d.gmv ?? 0) || 0;
          return { day, date, order_count: orderCount, sales_amount: salesAmount };
        });
        mapped.sort((a, b) => (a.date || a.day).localeCompare(b.date || b.day));
        setTrendData(mapped);
      } else {
        setTrendData([]);
      }
    } catch (err) {
      setTrendData([]);
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        clearAuth();
        window.location.href = '/login';
      }
    } finally {
      setTrendLoading(false);
    }
  }, []);

  const refreshDashboard = useCallback(() => {
    const [s, e] = getRangeForPreset(timeRangePreset, customRange);
    fetchStats(s, e, shopId);
    fetchTrend(s, e, shopId);
  }, [timeRangePreset, customRange, shopId, fetchStats, fetchTrend]);

  useEffect(() => {
    refreshDashboard();
  }, [refreshDashboard]);

  // 每 5 分钟自动刷新
  useEffect(() => {
    const timer = setInterval(refreshDashboard, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [refreshDashboard]);

  const handlePresetClick = (preset: TimeRangePreset) => {
    setTimeRangePreset(preset);
    if (preset !== 'custom') setCustomRange(null);
    const [s, e] = getRangeForPreset(preset, preset === 'custom' ? customRange : null);
    fetchStats(s, e, shopId);
    fetchTrend(s, e, shopId);
  };

  const handleCustomRangeChange = (dates: null | [Dayjs | null, Dayjs | null]) => {
    if (dates && dates[0] && dates[1]) {
      setCustomRange([dates[0], dates[1]]);
      setTimeRangePreset('custom');
      const [s, e] = [dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')];
      fetchStats(s, e, shopId);
      fetchTrend(s, e, shopId);
    }
  };

  const totalOrders = stats ? (stats.totalOrders ?? stats.total_orders ?? 0) : 0;
  const gmv = stats != null ? Number(stats.gmv ?? 0) || 0 : 0;
  const awaitingAcknowledge = stats ? (stats.awaitingAcknowledge ?? stats.awaiting_acknowledge ?? 0) : 0;
  const isAllZero = totalOrders === 0 && gmv === 0 && awaitingAcknowledge === 0;

  // 货币 100% 依赖后端 API 返回的 currency 字段
  const statsCurrency = (stats as DashboardStatsData)?.currency ?? '';
  const currencySuffix = formatCurrencySuffix(statsCurrency);

  const trendChartLabel = {
    today: '今日',
    '7d': '近 7 日',
    '14d': '近 14 日',
    '30d': '近 30 日',
    custom: '自定义',
  }[timeRangePreset];

  const handleLogout = () => {
    clearAuth(); // 同时清除 token / user / permissions
    navigate('/login');
  };

  const userDropdownItems = [
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true, onClick: handleLogout },
  ];

  return (
    <Layout className="min-h-screen">

      {/* ── 侧边栏 ── */}
      <Sider
        collapsed={collapsed}
        trigger={null}          // 移除 AntD 默认的折叠触发器（白条根源）
        theme="dark"
        width={220}
        style={{
          background:  '#0f172a',
          height:      '100vh',
          position:    'sticky',
          top:         0,
          overflowY:   'auto',
          overflowX:   'hidden',
          flexShrink:  0,
        }}
      >
        {/* Logo + 折叠切换 */}
        <div
          className="flex items-center gap-3 px-5 border-b border-white/5 cursor-pointer select-none"
          style={{ height: 64 }}
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? '展开菜单' : '收起菜单'}
        >
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0 shadow-lg">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M3 3h7v7H3V3zm0 11h7v7H3v-7zm11-11h7v7h-7V3zm0 11h7v7h-7v-7z" fill="white" />
            </svg>
          </div>
          {!collapsed && (
            <span className="text-white font-bold text-base tracking-widest">eMAG</span>
          )}
        </div>

        {/* 导航菜单（已按当前用户权限动态过滤） */}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[activeKey]}
          openKeys={collapsed ? [] : openKeys}
          onOpenChange={(keys) => setOpenKeys(keys)}
          onClick={({ key }) => gotoKey(key)}
          items={antMenuItems}
          style={{ background: '#0f172a', borderRight: 'none', marginTop: 8 }}
        />
      </Sider>

      <Layout>

        {/* ── 顶部 Header ── */}
        <Header
          className="flex items-center justify-between border-b border-gray-100"
          style={{ background: '#fff', height: 64, padding: '0 24px' }}
        >
          <Title level={5} style={{ margin: 0, color: '#1e293b', fontWeight: 600 }}>
            {menuLabelMap[activeKey] ?? '仪表盘'}
          </Title>

          <Space size={16}>
            <Badge count={3} size="small">
              <Button type="text" icon={<BellOutlined style={{ fontSize: 18, color: '#64748b' }} />} />
            </Badge>

            <Dropdown menu={{ items: userDropdownItems }} trigger={['click']} placement="bottomRight">
              <Space className="cursor-pointer px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors" size={10}>
                <Avatar
                  size={32}
                  icon={<UserOutlined />}
                  style={{ background: '#2563EB' }}
                  src={currentUser?.avatar ?? undefined}
                />
                <div className="flex flex-col leading-none">
                  <span className="text-sm font-medium text-gray-800">
                    {currentUser?.name ?? currentUser?.username ?? 'Admin'}
                  </span>
                  <span className="text-[11px] text-gray-400 mt-0.5">
                    {currentUser?.role?.name ?? '超级管理员'}
                  </span>
                </div>
                <DownOutlined style={{ fontSize: 10, color: '#94a3b8' }} />
              </Space>
            </Dropdown>
          </Space>
        </Header>

        {/* ── 内容区 ── */}
        <Content className="bg-gray-50 min-h-screen" style={{ overflowY: 'auto' }}>
          <SyncStatusBar shopId={shopId} />
          <div style={{ padding: 32 }}>
          {/* 仪表盘首页 */}
          {activeKey === 'dashboard' && (
            <>
              {/* 仪表盘定位说明 */}
              <Alert
                message="授权店铺真实经营数据"
                description="仅展示授权店铺的销量、GMV 和订单趋势，不统计公海产品数量。"
                type="info"
                showIcon
                style={{ marginBottom: 16, borderRadius: 12 }}
              />

              {/* 店铺选择 + 时间筛选器 */}
              <div className="flex flex-wrap items-center gap-3 mb-5">
                {shops.length > 0 && (
                  <Space size="small" className="mr-4">
                    <span className="text-sm text-gray-500">店铺：</span>
                    <Select
                      size="small"
                      value={shopId ?? undefined}
                      onChange={(v) => handleShopChange(v ?? null)}
                      options={shops.map((s) => ({ label: shopLabel(s), value: s.id }))}
                      style={{ minWidth: 180 }}
                      placeholder="选择店铺"
                    />
                  </Space>
                )}
                {shopsFetched && shops.length === 0 && (
                  <span className="text-sm text-amber-600 mr-4">请先在「系统设置 → 店铺授权」中添加店铺</span>
                )}
                <Space size="small" wrap>
                  <Button
                    type={timeRangePreset === 'today' ? 'primary' : 'default'}
                    size="small"
                    onClick={() => handlePresetClick('today')}
                  >
                    今日
                  </Button>
                  <Button
                    type={timeRangePreset === '7d' ? 'primary' : 'default'}
                    size="small"
                    onClick={() => handlePresetClick('7d')}
                  >
                    近7天
                  </Button>
                  <Button
                    type={timeRangePreset === '14d' ? 'primary' : 'default'}
                    size="small"
                    onClick={() => handlePresetClick('14d')}
                  >
                    近14天
                  </Button>
                  <Button
                    type={timeRangePreset === '30d' ? 'primary' : 'default'}
                    size="small"
                    onClick={() => handlePresetClick('30d')}
                  >
                    近30天
                  </Button>
                  <DatePicker.RangePicker
                    size="small"
                    value={timeRangePreset === 'custom' ? customRange : null}
                    onChange={handleCustomRangeChange}
                    placeholder={['开始日期', '结束日期']}
                    format="YYYY-MM-DD"
                    allowClear={false}
                    className="ml-1"
                  />
                </Space>
              </div>

              {/* 实时业绩看板 - 核心指标卡片 */}
              <Spin spinning={isLoading} tip="加载中..." style={{ minHeight: 320 }}>
                <style>{statPopStyle}</style>
                <div className="mb-7">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-start gap-4">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-50">
                        <ShoppingCartOutlined className="text-xl text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400 mb-1 tracking-wide">总订单数</p>
                        <div key={totalOrders} className={totalOrders > 0 ? 'stat-pop-in' : ''}>
                          <Statistic
                            value={statsLoading ? '-' : totalOrders}
                            valueStyle={{ fontSize: 22, fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-start gap-4">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-50">
                        <RiseOutlined className="text-xl text-emerald-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400 mb-1 tracking-wide">总金额 (GMV)</p>
                        <div key={gmv} className={gmv > 0 ? 'stat-pop-in' : ''}>
                          <Statistic
                            value={statsLoading ? '-' : gmv}
                            precision={2}
                            suffix={currencySuffix ? ` ${currencySuffix}` : undefined}
                            valueStyle={{ fontSize: 22, fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-start gap-4">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-50">
                        <ClockCircleOutlined className="text-xl text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400 mb-1 tracking-wide">待确认订单</p>
                        <div key={awaitingAcknowledge} className={awaitingAcknowledge > 0 ? 'stat-pop-in' : ''}>
                          <Statistic
                            value={statsLoading ? '-' : awaitingAcknowledge}
                            valueStyle={{ fontSize: 22, fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  {!statsLoading && isAllZero && shopId != null && (
                    <Alert
                      message={`当前展示为 ${shops.find((s) => s.id === shopId)?.shopName ?? '当前店铺'} 的真实经营数据。公海产品需发布为出价后方可产生销量。`}
                      type="info"
                      showIcon
                      style={{ marginTop: 16, borderRadius: 12 }}
                    />
                  )}
                </div>

                {/* 订单趋势图 - 随时间段拉伸/压缩 */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-7">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{trendChartLabel}订单趋势</p>
                      <p className="text-xs text-gray-400 mt-0.5">订单量 &amp; 销售额双轴对比</p>
                    </div>
                    <Tag bordered={false} color="blue">{trendChartLabel}</Tag>
                  </div>
                  <div className="px-2 py-5" style={{ height: 280 }} key={timeRangePreset}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={trendData}
                        margin={{ top: 4, right: 24, left: 0, bottom: trendData.length > 14 ? 40 : 8 }}
                      >
                      <defs>
                        <linearGradient id="gradSales" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#2563EB" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradOrders" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#10b981" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        interval={trendData.length > 14 ? Math.max(0, Math.floor(trendData.length / 10)) : 0}
                        angle={trendData.length > 14 ? -35 : 0}
                        textAnchor={trendData.length > 14 ? 'end' : 'middle'}
                      />
                      <YAxis
                        yAxisId="order_count"
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="sales_amount"
                        orientation="right"
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k${currencySuffix ? ` ${currencySuffix}` : ''}`}
                      />
                      <ReTooltip
                        contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', fontSize: 12 }}
                        formatter={(value: number | undefined, name: string) => {
                          const v = Number(value ?? 0) || 0;
                          return name === 'sales_amount' ? [`${v.toFixed(2)}${currencySuffix ? ` ${currencySuffix}` : ''}`, '销售额'] : [v, '订单量'];
                        }}
                        labelFormatter={(label) => `日期: ${label}`}
                      />
                      <Area yAxisId="sales_amount" type="natural" dataKey="sales_amount" stroke="#2563EB" strokeWidth={2} fill="url(#gradSales)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                      <Area yAxisId="order_count" type="natural" dataKey="order_count" stroke="#10b981" strokeWidth={2} fill="url(#gradOrders)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                  {/* 图例 */}
                  <div className="flex items-center gap-6 px-6 pb-5">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
                      <span className="text-xs text-gray-500">销售额（右轴）</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                      <span className="text-xs text-gray-500">订单量（左轴）</span>
                    </div>
                  </div>
                </div>
              </Spin>
            </>
          )}

          {/* 公海产品池 */}
          {activeKey === 'pool' && <PublicPool />}

          {/* 平台数据 - 平台产品 */}
          {activeKey === 'platform-products' && (
            <PlatformProducts initialSearch={searchParams.get('sku') ?? searchParams.get('search') ?? undefined} />
          )}

          {/* 平台数据 - 平台订单 */}
          {activeKey === 'platform-orders' && <PlatformOrders />}

          {/* 我的私有产品库 */}
          {activeKey === 'private-pool' && <PrivatePool onNavigate={(key) => setActiveKey(key)} />}

          {/* 库存 SKU */}
          {activeKey === 'inventory-sku' && (
            <InventorySKU
              onNavigate={(key) => setActiveKey(key)}
              initialKeyword={searchParams.get('sku') ?? undefined}
            />
          )}

          {/* 供应采购 — 采购计划 */}
          {activeKey === 'sc-planning' && <ProcurementPlanning />}

          {/* 供应采购 — 采购管理 */}
          {activeKey === 'sc-management' && <ProcurementManagement />}

          {/* 用户管理 — 分配账号 */}
          {activeKey === 'users' && <UserManagement />}

          {/* 用户管理 — 角色管理 */}
          {activeKey === 'roles' && <RoleManagement />}

          {/* 店铺授权 */}
          {activeKey === 'shop-auth' && <ShopAuth />}

          {/* 1688 配置 */}
          {activeKey === 'alibaba-settings' && <AlibabaSettings />}

          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
