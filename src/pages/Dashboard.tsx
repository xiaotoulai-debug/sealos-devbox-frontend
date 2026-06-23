import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  DASHBOARD_MENU_PERMISSION_CODES,
  getStoredPermissions,
  hasDashboardMenuAccess,
  isAdminUser,
  writeAuthCache,
  clearAuth,
  type StoredUser,
} from '../lib/auth';
import dayjs, { type Dayjs } from 'dayjs';
import request from '../lib/request';
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
import OrderDailyDashboardPage from './OrderDailyDashboardPage';
import OperationDailyDashboard from '../components/operationDaily/OperationDailyDashboard';
import FbeShipments from './FbeShipments';
import WarehouseList from './WarehouseList';
import WarehouseInventory from './WarehouseInventory';
import SyncStatusBar from '../components/SyncStatusBar';
import { ALL_MENU_ITEMS, type AppMenuItem } from '../lib/menuConfig';
import {
  Layout, Menu, Avatar, Dropdown, Tag, Badge,
  Typography, Space, Button, Statistic, DatePicker, Spin, Alert, message,
  Segmented, Table,
} from 'antd';
import {
  LogoutOutlined,
  UserOutlined,
  ShoppingCartOutlined,
  BellOutlined,
  ClockCircleOutlined,
  DownOutlined,
  RollbackOutlined,
  TrophyOutlined,
  LineChartOutlined,
  TableOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import WorkdayCalendarDrawer from '../components/workdayCalendar/WorkdayCalendarDrawer';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  Legend as ReLegend,
} from 'recharts';

const { Sider, Header, Content } = Layout;
const { Title } = Typography;

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

// 分店对比图颜色池（循环使用）
const SHOP_COLORS = ['#2563EB', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

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
      if (item.key === 'dashboard') {
        if (DASHBOARD_MENU_PERMISSION_CODES.some((code) => permissions.includes(code))) {
          acc.push(item);
        }
      } else if (!item.code || permissions.includes(item.code)) {
        acc.push(item);
      }
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
  'order-daily-dashboard': '平台数据 / 订单日报 / 运营看板',
  'fbe-shipments':     '平台数据 / FBE发货',
  'sc-planning':       '供应采购 / 采购计划',
  'sc-management':     '供应采购 / 采购管理',
  'users':             '用户管理 / 分配账号',
  'roles':             '用户管理 / 角色管理',
  'shop-auth':         '系统设置 / 店铺授权',
  'alibaba-settings':  '系统设置 / 1688 配置',
  'warehouse-list':      '产品开发 / 仓库列表',
  'warehouse-inventory': '产品开发 / 仓库库存明细',
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
  // ★ 扩展字段（后端接口跟进后自动生效，暂时占位为 0）
  estimatedProfit?: number;
  estimated_profit?: number;
  refundCount?: number;
  refund_count?: number;
}

// ── 趋势图单日数据（兼容后端各种字段命名风格）────────────────
interface TrendDayItem {
  day?:          string;
  date?:         string;
  shopId?:       number;
  shop_id?:      number;
  shopName?:     string;
  shop_name?:    string;
  region?:       string;
  // 订单量：兼容驼峰与下划线
  orderCount?:   number;
  order_count?:  number;
  order_num?:    number;
  orders?:       number;
  count?:        number;
  // 销售额
  sales_amount?: number;
  salesAmount?:  number;
  sales?:        number;
  gmv?:          number;
}

// ── storeSummaries 预聚合行（后端有则直接用）─────────────────
interface StoreSummaryItem {
  shopId:           number;
  shop_id?:         number;
  shopName?:        string;
  shop_name?:       string;
  // 后端直接字段（优先）
  yesterday?:       number;
  week7?:           number;
  month30?:         number;
  // 驼峰别名
  yesterdayCount?:  number;
  yesterday_count?: number;
  week7Count?:      number;
  week7_count?:     number;
  month30Count?:    number;
  month30_count?:   number;
  // 汇总
  totalCount?:      number;
  total_count?:     number;
  orderCount?:      number;
  order_count?:     number;
}

// ── 全局一站式 API 响应结构 ───────────────────────────────────
interface GlobalStatsResponse {
  code: number;
  data: {
    generatedAt?: string;
    dateRange?:   { start?: string; end?: string; startDate?: string; endDate?: string };
    // 全局 KPI（来自 globalTotals 或根层字段）
    globalTotals?: {
      totalOrders?:         number;
      total_orders?:        number;
      awaitingAcknowledge?: number;
      awaiting_acknowledge?:number;
      refundCount?:         number;
      refund_count?:        number;
    };
    total_orders?:         number;
    totalOrders?:          number;
    awaiting_acknowledge?: number;
    awaitingAcknowledge?:  number;
    refund_count?:         number;
    refundCount?:          number;
    currency?:             string;
    // 扁平趋势数组（每行含 shopId + date，后端真实字段名）
    dailyTrends?:  TrendDayItem[];
    daily_trends?: TrendDayItem[];
    // 预聚合分店汇总（若后端提供）
    storeSummaries?:  StoreSummaryItem[];
    store_summaries?: StoreSummaryItem[];
    // 兼容老字段
    trend?:      TrendDayItem[];
    trend_data?: TrendDayItem[];
    trendData?:  TrendDayItem[];
    shops?:      StoreSummaryItem[];
    shopTrends?: StoreSummaryItem[];
    shop_trends?:StoreSummaryItem[];
    table?:      StoreSummaryItem[];
  };
}

// ── 时间范围预设 ─────────────────────────────────────────────
type TimeRangePreset = 'yesterday' | '7d' | '14d' | '30d' | 'custom';

function getRangeForPreset(preset: TimeRangePreset, customRange: [Dayjs, Dayjs] | null): [string, string] {
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  if (preset === 'custom' && customRange) {
    return [customRange[0].format('YYYY-MM-DD'), customRange[1].format('YYYY-MM-DD')];
  }
  if (preset === 'yesterday') return [yesterday, yesterday];
  const today = dayjs().format('YYYY-MM-DD');
  const start = (
    {
      '7d':  dayjs().subtract(6,  'day').format('YYYY-MM-DD'),
      '14d': dayjs().subtract(13, 'day').format('YYYY-MM-DD'),
      '30d': dayjs().subtract(29, 'day').format('YYYY-MM-DD'),
      custom: today,
    } as Record<string, string>
  )[preset] ?? today;
  return [start, today];
}

// ── 主组件 ────────────────────────────────────────────────────
const TAB_KEYS = ['platform-products', 'inventory-sku', 'platform-orders', 'order-daily-dashboard'] as const;
const ROUTE_ONLY_TAB_PERMISSION_MAP: Partial<Record<(typeof TAB_KEYS)[number], string>> = {
  'platform-orders': 'MENU_PLATFORM_ORDERS',
};

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
  // 仓库库存明细页所需上下文（切换到 warehouse-inventory 时写入）
  const [warehouseDetailId,   setWarehouseDetailId]   = useState<number | null>(null);
  const [warehouseDetailName, setWarehouseDetailName] = useState<string>('');

  // ── 权限状态（React state，确保更新后触发重渲染） ─────────────
  // 初始值从 localStorage 读取，避免首次渲染闪烁
  const [permissions, setPermissions] = useState<string[] | null>(getStoredPermissions);
  const [adminFlag,   setAdminFlag]   = useState<boolean>(isAdminUser);
  // 刷新用户信息（供 Header 实时展示用）
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(getStoredUser);
  const [workdayCalendarOpen, setWorkdayCalendarOpen] = useState(false);

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
  // platform-orders 已从左侧菜单隐藏，但仍需保留 URL 直达与订单日报跳转能力。
  const gotoKey = useCallback((key: string) => {
    const routeOnlyPermission = ROUTE_ONLY_TAB_PERMISSION_MAP[key as (typeof TAB_KEYS)[number]];
    const canAccessRouteOnly = routeOnlyPermission
      ? adminFlag || permissions === null || permissions?.includes(routeOnlyPermission)
      : false;
    const canAccessDashboard = adminFlag || permissions === null || hasDashboardMenuAccess();
    if (key === 'dashboard') {
      if (canAccessDashboard) {
        setActiveKey(key);
      } else {
        message.warning('您没有访问该模块的权限');
        const fallback = allowedKeys.values().next().value;
        if (fallback) setActiveKey(fallback);
      }
      return;
    }
    if (allowedKeys.has(key) || canAccessRouteOnly) {
      setActiveKey(key);
    } else {
      message.warning('您没有访问该模块的权限');
      if (canAccessDashboard) {
        setActiveKey('dashboard');
      } else {
        const fallback = allowedKeys.values().next().value;
        if (fallback) setActiveKey(fallback);
      }
    }
  }, [adminFlag, allowedKeys, permissions]);

  // 支持 URL ?tab= 直接打开对应页面（如从订单详情新窗口跳转）
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && TAB_KEYS.includes(tab as (typeof TAB_KEYS)[number])) {
      gotoKey(tab);
    }
  }, [searchParams, gotoKey]);

  // ── 时间筛选（默认：昨日）────────────────────────────────────
  const [timeRangePreset, setTimeRangePreset] = useState<TimeRangePreset>('30d');
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);

  // ── 店铺列表（全局大盘，始终展示所有店铺）───────────────────
  const [shops, setShops] = useState<ShopOption[]>([]);
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
    } catch {
      setShopsFetched(true);
    }
  }, []);

  // ── 视图切换（图表 / 数据表）────────────────────────────────
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  // 表格视图：各店铺分期订单量
  const [shopTableStats, setShopTableStats] = useState<Record<number, { yesterday: number; week7: number; month30: number }>>({});

  // ── 仪表盘数据（全部来自单次 global-stats 请求）────────────
  const [stats, setStats] = useState<DashboardStatsData | null>(null);
  const [, setTrendData] = useState<TrendDayItem[]>([]);
  const [shopSeriesData, setShopSeriesData] = useState<Record<number, { day: string; order_count: number; sales_amount: number }[]>>({});
  const [globalLoading, setGlobalLoading] = useState(true);

  const isLoading = globalLoading;

  // ──────────────────────────────────────────────────────────────
  // ★ 唯一数据源：GET /api/dashboard/global-stats（仅发一次请求）
  // ──────────────────────────────────────────────────────────────
  const fetchGlobalStats = useCallback(async (start: string, end: string) => {
    setGlobalLoading(true);
    try {
      const { data: res } = await request.get<GlobalStatsResponse>(
        '/dashboard/global-stats',
        { params: { startDate: start, endDate: end } },
      );

      if (res.code !== 200 || !res.data) {
        setStats({ totalOrders: 0, awaitingAcknowledge: 0 });
        setTrendData([]);
        setShopSeriesData({});
        setShopTableStats({});
        return;
      }

      const d = res.data;

      // ── 辅助：统一提取单行的订单量（兼容 orderCount / order_count / orders 等）
      const pickCount = (item: TrendDayItem | StoreSummaryItem): number =>
        Number(
          (item as TrendDayItem).orderCount   ??
          (item as TrendDayItem).order_count  ??
          (item as TrendDayItem).order_num    ??
          (item as TrendDayItem).orders       ??
          (item as TrendDayItem).count        ??
          (item as StoreSummaryItem).totalCount ??
          (item as StoreSummaryItem).total_count ??
          0,
        ) || 0;

      // ── 辅助：规范化 TrendDayItem 为图表所需格式
      const normDay = (item: TrendDayItem) => {
        const date = item.date ?? '';
        return {
          day:          item.day ?? (date ? dayjs(date).format('MM-DD') : ''),
          date,
          order_count:  pickCount(item),
          sales_amount: Number(item.salesAmount ?? item.sales_amount ?? item.sales ?? item.gmv ?? 0) || 0,
        };
      };

      // ── 1. 提取扁平 dailyTrends 数组（后端真实字段名）────────
      const flatTrends: TrendDayItem[] =
        d.dailyTrends  ??
        d.daily_trends ??
        d.trend        ??
        d.trend_data   ??
        d.trendData    ??
        [];

      // ── 2. 全局 KPI ─────────────────────────────────────────
      // 优先读 globalTotals，其次根层字段，最后从 dailyTrends 汇总兜底
      const gt = d.globalTotals;
      const totalOrdersVal =
        gt?.totalOrders ?? gt?.total_orders ??
        d.totalOrders   ?? d.total_orders   ??
        flatTrends.reduce((s, r) => s + pickCount(r), 0);

      setStats({
        totalOrders:         totalOrdersVal,
        awaitingAcknowledge: gt?.awaitingAcknowledge ?? gt?.awaiting_acknowledge ?? d.awaitingAcknowledge ?? d.awaiting_acknowledge ?? 0,
        refundCount:         gt?.refundCount         ?? gt?.refund_count         ?? d.refundCount         ?? d.refund_count         ?? 0,
        currency:            d.currency ?? null,
      });

      // ── 3. 全局趋势（按日期聚合所有店铺，得到一条合计曲线）──
      const globalByDate = new Map<string, { day: string; date: string; order_count: number; sales_amount: number }>();
      flatTrends.forEach((item) => {
        const date = item.date ?? '';
        const day  = item.day ?? (date ? dayjs(date).format('MM-DD') : '');
        const key  = date || day;
        if (!key) return;
        const prev = globalByDate.get(key) ?? { day, date, order_count: 0, sales_amount: 0 };
        globalByDate.set(key, {
          ...prev,
          order_count:  prev.order_count  + pickCount(item),
          sales_amount: prev.sales_amount + Number(item.salesAmount ?? item.sales_amount ?? item.sales ?? item.gmv ?? 0) || 0,
        });
      });
      const mappedTrend = [...globalByDate.values()].sort(
        (a, b) => (a.date || a.day).localeCompare(b.date || b.day),
      );
      setTrendData(mappedTrend);

      // ── 4. 各店铺多系列（图表）：按 shopId 分组 dailyTrends ──
      const seriesMap: Record<number, { day: string; order_count: number; sales_amount: number }[]> = {};
      flatTrends.forEach((item) => {
        const sid = item.shopId ?? item.shop_id;
        if (sid == null) return;
        if (!seriesMap[sid]) seriesMap[sid] = [];
        seriesMap[sid].push(normDay(item));
      });
      // 各店内按日期排序
      Object.values(seriesMap).forEach((arr) =>
        arr.sort((a, b) => (a.date || a.day).localeCompare(b.date || b.day)),
      );
      setShopSeriesData(seriesMap);

      // ── 5. 各店铺表格三期聚合 ─────────────────────────────────
      // 优先用后端预聚合的 storeSummaries，否则从 dailyTrends reduce
      const summaryList: StoreSummaryItem[] =
        d.storeSummaries  ??
        d.store_summaries ??
        (d.shops as StoreSummaryItem[] | undefined) ??
        (d.shopTrends as StoreSummaryItem[] | undefined) ??
        (d.shop_trends as StoreSummaryItem[] | undefined) ??
        (d.table as StoreSummaryItem[] | undefined) ??
        [];

      const tableMap: Record<number, { yesterday: number; week7: number; month30: number }> = {};

      if (summaryList.length > 0) {
        // 后端已聚合 → 直接映射（优先读直接字段 yesterday/week7/month30）
        summaryList.forEach((s) => {
          const sid = s.shopId ?? s.shop_id ?? 0;
          tableMap[sid] = {
            yesterday: Number(s.yesterday ?? s.yesterdayCount ?? s.yesterday_count ?? 0) || 0,
            week7:     Number(s.week7     ?? s.week7Count     ?? s.week7_count     ?? 0) || 0,
            month30:   Number(s.month30   ?? s.month30Count   ?? s.month30_count   ?? 0) || 0,
          };
        });
      } else {
        // 防呆兜底：从 dailyTrends 按日期 reduce 出三期数据
        const todayStr     = dayjs().format('YYYY-MM-DD');
        const yesterdayStr = dayjs().subtract(1,  'day').format('YYYY-MM-DD');
        const day7AgoStr   = dayjs().subtract(6,  'day').format('YYYY-MM-DD');
        const day30AgoStr  = dayjs().subtract(29, 'day').format('YYYY-MM-DD');

        flatTrends.forEach((item) => {
          const sid  = item.shopId ?? item.shop_id;
          if (sid == null) return;
          const date = item.date ?? '';
          if (!tableMap[sid]) tableMap[sid] = { yesterday: 0, week7: 0, month30: 0 };
          const cnt = pickCount(item);
          if (date === yesterdayStr)                         tableMap[sid].yesterday += cnt;
          if (date >= day7AgoStr   && date <= todayStr)     tableMap[sid].week7     += cnt;
          if (date >= day30AgoStr  && date <= todayStr)     tableMap[sid].month30   += cnt;
        });
      }
      setShopTableStats(tableMap);

    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) { clearAuth(); window.location.href = '/login'; return; }
      setStats({ totalOrders: 0, awaitingAcknowledge: 0 });
      setTrendData([]);
      setShopSeriesData({});
      setShopTableStats({});
    } finally {
      setGlobalLoading(false);
    }
  }, []);

  // ── 统一刷新入口 ─────────────────────────────────────────────
  const refreshDashboard = useCallback(() => {
    const [s, e] = getRangeForPreset(timeRangePreset, customRange);
    fetchGlobalStats(s, e);   // ← 唯一一次 HTTP 请求
  }, [timeRangePreset, customRange, fetchGlobalStats]);

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
    fetchGlobalStats(s, e);
  };

  const handleCustomRangeChange = (dates: null | [Dayjs | null, Dayjs | null]) => {
    if (dates && dates[0] && dates[1]) {
      setCustomRange([dates[0], dates[1]]);
      setTimeRangePreset('custom');
      fetchGlobalStats(dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD'));
    }
  };

  const totalOrders         = stats ? (stats.totalOrders ?? stats.total_orders ?? 0) : 0;
  const awaitingAcknowledge = stats ? (stats.awaitingAcknowledge ?? stats.awaiting_acknowledge ?? 0) : 0;
  const refundCount         = stats ? (stats.refundCount ?? stats.refund_count ?? 0) : 0;
  const isAllZero = totalOrders === 0 && awaitingAcknowledge === 0 && refundCount === 0;

  // ★ 分店对比：将各店铺趋势合并为单一时间序列，每店「订单量」作为独立字段
  const mergedShopTrend = useMemo(() => {
    const entries = Object.entries(shopSeriesData);
    if (entries.length === 0) return [];
    const allDays = new Set<string>();
    entries.forEach(([, series]) => series.forEach((d) => allDays.add(d.day)));
    return Array.from(allDays).sort().map((day) => {
      const item: Record<string, string | number> = { day };
      entries.forEach(([sid, series]) => {
        const found = series.find((d) => d.day === day);
        item[`shop_${sid}`] = found?.order_count ?? 0;  // ★ 改为 order_count
      });
      return item;
    });
  }, [shopSeriesData]);

  // ★ 各店铺单量排行（全部时间段累计）
  const shopRanking = useMemo(() => {
    return shops
      .map((shop) => {
        const series = shopSeriesData[shop.id] ?? [];
        const count = series.reduce((sum, d) => sum + (d.order_count ?? 0), 0);
        return { shop, count };
      })
      .filter(({ count }) => count > 0)
      .sort((a, b) => b.count - a.count);
  }, [shops, shopSeriesData]);

  const trendChartLabel = {
    yesterday: '昨日',
    '7d':      '近 7 日',
    '14d':     '近 14 日',
    '30d':     '近 30 日',
    custom:    '自定义',
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
            <Button
              type="text"
              size="small"
              icon={<CalendarOutlined />}
              onClick={() => setWorkdayCalendarOpen(true)}
            >
              运营日历表
            </Button>
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
          <SyncStatusBar shopId={null} />
          <div style={{ padding: 32 }}>
          {/* 仪表盘首页 */}
          {activeKey === 'dashboard' && (
            <OperationDailyDashboard permissions={adminFlag ? null : permissions} />
          )}
          {false && (
            <>
              {/* 仪表盘定位说明 */}
              <Alert
                message="全公司订单量大盘"
                description="汇总所有授权店铺的实际订单量，支持趋势图与数据表双视图切换。"
                type="info"
                showIcon
                style={{ marginBottom: 16, borderRadius: 12 }}
              />

              {/* 时间筛选器 */}
              <div className="flex flex-wrap items-center gap-3 mb-5">
                {shopsFetched && shops.length === 0 && (
                  <span className="text-sm text-amber-600 mr-4">请先在「系统设置 → 店铺授权」中添加店铺</span>
                )}
                <Space size="small" wrap>
                  <Button
                    type={timeRangePreset === 'yesterday' ? 'primary' : 'default'}
                    size="small"
                    onClick={() => handlePresetClick('yesterday')}
                  >
                    昨日
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
                    {/* ① 总订单数 */}
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-start gap-4">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-50">
                        <ShoppingCartOutlined className="text-xl text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400 mb-1 tracking-wide">总订单数</p>
                        <div key={totalOrders} className={totalOrders > 0 ? 'stat-pop-in' : ''}>
                          <Statistic
                            value={isLoading ? '-' : totalOrders}
                            valueStyle={{ fontSize: 22, fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}
                          />
                        </div>
                      </div>
                    </div>
                    {/* ② 待确认订单 */}
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-start gap-4">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-50">
                        <ClockCircleOutlined className="text-xl text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400 mb-1 tracking-wide">待确认订单</p>
                        <div key={awaitingAcknowledge} className={awaitingAcknowledge > 0 ? 'stat-pop-in' : ''}>
                          <Statistic
                            value={isLoading ? '-' : awaitingAcknowledge}
                            valueStyle={{ fontSize: 22, fontWeight: 700, color: awaitingAcknowledge > 0 ? '#d97706' : '#1e293b', lineHeight: 1.2 }}
                          />
                        </div>
                      </div>
                    </div>
                    {/* ③ 退款单量 */}
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-start gap-4">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-red-50">
                        <RollbackOutlined className="text-xl text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400 mb-1 tracking-wide">退款单量</p>
                        <div key={refundCount} className={refundCount > 0 ? 'stat-pop-in' : ''}>
                          <Statistic
                            value={isLoading ? '-' : refundCount}
                            valueStyle={{ fontSize: 22, fontWeight: 700, color: refundCount > 0 ? '#ef4444' : '#1e293b', lineHeight: 1.2 }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  {!isLoading && isAllZero && (
                    <Alert
                      message="当前时段全部店铺订单量为零，公海产品需发布为出价后方可产生销量。"
                      type="info" showIcon style={{ marginTop: 16, borderRadius: 12 }}
                    />
                  )}
                </div>

                {/* ── 视图切换 Toggle ──────────────────────────── */}
                <div className="flex justify-end mb-4">
                  <Segmented
                    value={viewMode}
                    onChange={(v) => setViewMode(v as 'chart' | 'table')}
                    options={[
                      { label: <Space size={4}><LineChartOutlined />趋势图</Space>, value: 'chart' },
                      { label: <Space size={4}><TableOutlined />数据表</Space>, value: 'table' },
                    ]}
                  />
                </div>

                {/* ── 图表视图（viewMode === 'chart'）────────────── */}
                {viewMode === 'chart' && (
                  <>
                    {/* 多系列面积图：每店铺一条线 */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-7">
                      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{trendChartLabel}各店铺订单量对比</p>
                          <p className="text-xs text-gray-400 mt-0.5">各店铺订单量走势（每线代表一个店铺）</p>
                        </div>
                        <Tag bordered={false} color="blue">{trendChartLabel}</Tag>
                      </div>
                      <div className="px-2 py-5" style={{ height: 300 }} key={`${timeRangePreset}-per-shop`}>
                        {isLoading ? (
                          <div className="flex items-center justify-center h-full"><Spin tip="加载各店铺数据..." /></div>
                        ) : mergedShopTrend.length === 0 ? (
                          <div className="flex items-center justify-center h-full text-gray-300 text-sm">暂无分店数据</div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={mergedShopTrend} margin={{ top: 4, right: 24, left: 0, bottom: mergedShopTrend.length > 14 ? 40 : 8 }}>
                              <defs>
                                {shops.map((shop, idx) => (
                                  <linearGradient key={shop.id} id={`gradShop${shop.id}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%"  stopColor={SHOP_COLORS[idx % SHOP_COLORS.length]} stopOpacity={0.18} />
                                    <stop offset="95%" stopColor={SHOP_COLORS[idx % SHOP_COLORS.length]} stopOpacity={0} />
                                  </linearGradient>
                                ))}
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                              <XAxis
                                dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                                interval={mergedShopTrend.length > 14 ? Math.max(0, Math.floor(mergedShopTrend.length / 10)) : 0}
                                angle={mergedShopTrend.length > 14 ? -35 : 0}
                                textAnchor={mergedShopTrend.length > 14 ? 'end' : 'middle'}
                              />
                              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                              <ReTooltip
                                contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', fontSize: 12 }}
                                formatter={(value: number | undefined, name: string) => {
                                  const v = Number(value ?? 0) || 0;
                                  const sid = Number(String(name).replace('shop_', ''));
                                  return [v, shops.find((s) => s.id === sid)?.shopName ?? name];
                                }}
                                labelFormatter={(label) => `日期: ${label}`}
                              />
                              <ReLegend
                                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                                formatter={(value: string) => {
                                  const sid = Number(value.replace('shop_', ''));
                                  return shops.find((s) => s.id === sid)?.shopName ?? value;
                                }}
                              />
                              {shops.map((shop, idx) => (
                                <Area
                                  key={shop.id} type="natural"
                                  dataKey={`shop_${shop.id}`} name={`shop_${shop.id}`}
                                  stroke={SHOP_COLORS[idx % SHOP_COLORS.length]} strokeWidth={2}
                                  fill={`url(#gradShop${shop.id})`}
                                  dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
                                />
                              ))}
                            </AreaChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>

                    {/* 各店铺单量排行榜（图表视图下展示） */}
                    {shopRanking.length > 0 && (
                      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-7">
                        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-50">
                          <TrophyOutlined style={{ color: '#f59e0b', fontSize: 16 }} />
                          <p className="text-sm font-semibold text-gray-800">{trendChartLabel}各店铺单量排行</p>
                        </div>
                        <div className="px-6 py-4 space-y-3">
                          {shopRanking.map(({ shop, count }, idx) => {
                            const maxCount = shopRanking[0]?.count ?? 1;
                            const pct = Math.round((count / maxCount) * 100);
                            const color = SHOP_COLORS[idx % SHOP_COLORS.length];
                            return (
                              <div key={shop.id} className="flex items-center gap-3">
                                <span style={{ width: 20, fontSize: 12, fontWeight: 700, color: idx === 0 ? '#f59e0b' : '#94a3b8', textAlign: 'right', flexShrink: 0 }}>#{idx + 1}</span>
                                <span style={{ width: 140, fontSize: 12, color: '#374151', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shop.shopName}</span>
                                <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                                  <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: 4, transition: 'width 0.4s ease' }} />
                                </div>
                                <span style={{ width: 48, fontSize: 13, fontWeight: 700, color: '#1e293b', textAlign: 'right', flexShrink: 0 }}>{count}</span>
                                <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>单</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ── 表格视图（viewMode === 'table'）────────────── */}
                {viewMode === 'table' && (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-7">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">各店铺订单量汇总</p>
                        <p className="text-xs text-gray-400 mt-0.5">昨日 / 近7天 / 近30天  三期订单量对比</p>
                      </div>
                      <Button
                        size="small" icon={<RollbackOutlined />}
                        onClick={refreshDashboard} loading={isLoading}
                      >刷新</Button>
                    </div>
                    <Table
                      loading={isLoading}
                      dataSource={shops.map((shop) => ({
                        key: shop.id,
                        shopName: shopLabel(shop),
                        yesterday: shopTableStats[shop.id]?.yesterday ?? (isLoading ? null : 0),
                        week7:     shopTableStats[shop.id]?.week7     ?? (isLoading ? null : 0),
                        month30:   shopTableStats[shop.id]?.month30   ?? (isLoading ? null : 0),
                      }))}
                      pagination={false}
                      size="middle"
                      style={{ borderRadius: 12 }}
                      columns={[
                        {
                          title: '店铺',
                          dataIndex: 'shopName',
                          key: 'shopName',
                          render: (name: string, _: unknown, idx: number) => (
                            <Space size={6}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: SHOP_COLORS[idx % SHOP_COLORS.length], display: 'inline-block', flexShrink: 0 }} />
                              <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{name}</span>
                            </Space>
                          ),
                        },
                        {
                          title: '昨日订单量',
                          dataIndex: 'yesterday',
                          key: 'yesterday',
                          align: 'center' as const,
                          render: (v: number | null) => v == null ? '-' : (
                            <span style={{ fontSize: 14, fontWeight: 700, color: v > 0 ? '#2563EB' : '#9ca3af' }}>{v}</span>
                          ),
                          sorter: (a: { yesterday: number }, b: { yesterday: number }) => (a.yesterday ?? 0) - (b.yesterday ?? 0),
                          defaultSortOrder: 'descend' as const,
                        },
                        {
                          title: '近7天订单量',
                          dataIndex: 'week7',
                          key: 'week7',
                          align: 'center' as const,
                          render: (v: number | null) => v == null ? '-' : (
                            <span style={{ fontSize: 14, fontWeight: 700, color: v > 0 ? '#059669' : '#9ca3af' }}>{v}</span>
                          ),
                          sorter: (a: { week7: number }, b: { week7: number }) => (a.week7 ?? 0) - (b.week7 ?? 0),
                        },
                        {
                          title: '近30天订单量',
                          dataIndex: 'month30',
                          key: 'month30',
                          align: 'center' as const,
                          render: (v: number | null) => v == null ? '-' : (
                            <span style={{ fontSize: 14, fontWeight: 700, color: v > 0 ? '#7c3aed' : '#9ca3af' }}>{v}</span>
                          ),
                          sorter: (a: { month30: number }, b: { month30: number }) => (a.month30 ?? 0) - (b.month30 ?? 0),
                        },
                      ]}
                      locale={{ emptyText: shopsFetched && shops.length === 0 ? '暂无店铺数据' : '加载中...' }}
                    />
                  </div>
                )}
              </Spin>
            </>
          )}

          {/* 公海产品池 */}
          {activeKey === 'pool' && <PublicPool />}

          {/* 平台数据 - 平台产品 */}
          {activeKey === 'platform-products' && (
            <PlatformProducts
              initialSearch={searchParams.get('sku') ?? searchParams.get('search') ?? undefined}
              initialShopId={searchParams.get('shopId') ? Number(searchParams.get('shopId')) : undefined}
            />
          )}

          {/* 平台数据 - 平台订单 */}
          {activeKey === 'platform-orders' && <PlatformOrders />}

          {/* 平台数据 - 订单日报 / 运营看板 */}
          {activeKey === 'order-daily-dashboard' && <OrderDailyDashboardPage />}

          {/* 平台数据 - FBE发货 */}
          {activeKey === 'fbe-shipments' && <FbeShipments />}

          {/* 我的私有产品库 */}
          {activeKey === 'private-pool' && <PrivatePool onNavigate={(key) => setActiveKey(key)} />}

          {/* 产品开发 — 仓库列表 */}
          {activeKey === 'warehouse-list' && (
            <WarehouseList
              onViewInventory={(warehouse) => {
                setWarehouseDetailId(warehouse.id);
                setWarehouseDetailName(warehouse.name);
                setActiveKey('warehouse-inventory');
              }}
            />
          )}

          {/* 产品开发 — 仓库库存明细（从仓库列表点击进入，不在侧边菜单显示） */}
          {activeKey === 'warehouse-inventory' && warehouseDetailId != null && (
            <WarehouseInventory
              warehouseId={warehouseDetailId}
              warehouseName={warehouseDetailName}
              onBack={() => setActiveKey('warehouse-list')}
            />
          )}

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
      <WorkdayCalendarDrawer
        open={workdayCalendarOpen}
        canEdit={isAdminUser()}
        onClose={() => setWorkdayCalendarOpen(false)}
      />
    </Layout>
  );
}
