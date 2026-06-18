import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs, { type Dayjs } from 'dayjs';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import {
  BarChartOutlined,
  LineChartOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import request from '../lib/request';

const { Text } = Typography;

type PageStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';
type SiteValue = 'ALL' | 'RO' | 'BG' | 'HU';
type StatusMode = 'valid' | 'all' | 'completed_only';
type CurrencyMode = 'original' | 'grouped_by_currency' | 'converted';
type BaseCurrency = 'CNY' | 'EUR' | 'RON' | 'HUF';
type CostStatus = 'complete' | 'partial' | 'missing';
type ProfitDisplayStatus = 'complete' | 'estimated' | 'partial' | 'unavailable';
type CostReliabilityStatus = 'complete' | 'estimated' | 'partial' | 'missing';

interface ShopRecord {
  id: number;
  shopName: string;
  platform: string;
  region?: string | null;
  site?: string | null;
  currency?: string | null;
}

interface OrderDailySummary {
  month?: string;
  orderCount?: number | null;
  itemCount?: number | null;
  grossSales?: number | null;
  amountWithVat?: number | null;
  vatAmount?: number | null;
  refundOrderCount?: number | null;
  refundAmount?: number | null;
  netSales?: number | null;
  productCost?: number | null;
  commissionCost?: number | null;
  fulfillmentCost?: number | null;
  grossProfit?: number | null;
  grossMargin?: number | null;
  avgOrderValue?: number | null;
  currency?: string | null;
  hasMissingCost?: boolean | null;
  costStatus?: CostStatus | null;
  costReliabilityStatus?: CostReliabilityStatus | null;
  costMatchedItemCount?: number | null;
  costMissingItemCount?: number | null;
  grossProfitReliable?: boolean | null;
  profitDisplayable?: boolean | null;
  profitDisplayStatus?: ProfitDisplayStatus | null;
  salesTaxMode?: string | null;
  profitFormulaVersion?: string | null;
}

interface OrderDailyDay extends OrderDailySummary {
  date: string;
}

interface CurrencyGroup {
  currency?: string | null;
  site?: SiteValue | string | null;
  region?: SiteValue | string | null;
  siteLabel?: string | null;
  shopId?: number | null;
  shopIds?: number[];
  shopName?: string | null;
  shopNames?: string[];
  summary?: OrderDailySummary | null;
  days?: OrderDailyDay[];
}

interface OrderDailyPayload {
  summary?: OrderDailySummary | null;
  days?: OrderDailyDay[];
  currencyGroups?: CurrencyGroup[];
  warnings?: string[];
  timezoneMode?: string | null;
  dataSource?: string | null;
  generatedAt?: string | null;
}

interface OrderDailyResponse {
  code?: number;
  data?: OrderDailyPayload | null;
  message?: string;
}

interface FilterState {
  shopGroupKey?: string;
  shopId?: number;
  site: SiteValue;
  month: string;
  statusMode: StatusMode;
  currencyMode: CurrencyMode;
  baseCurrency: BaseCurrency;
}

const STATUS_MODE_OPTIONS: { label: string; value: StatusMode }[] = [
  { label: '有效订单', value: 'valid' },
  { label: '全部订单', value: 'all' },
  { label: '已完成订单', value: 'completed_only' },
];

const DEFAULT_FILTERS: FilterState = {
  site: 'ALL',
  month: dayjs().format('YYYY-MM'),
  statusMode: 'valid',
  currencyMode: 'original',
  baseCurrency: 'CNY',
};

const SITE_LABEL_MAP: Record<string, string> = {
  RO: '罗马尼亚',
  BG: '保加利亚',
  HU: '匈牙利',
};

interface GroupedShop {
  groupKey: string;
  displayName: string;
  shopIds: number[];
  sites: { shopId: number; site: SiteValue | string; label: string; currency?: string | null }[];
}

const SITE_SORT_ORDER: Record<string, number> = { RO: 0, BG: 1, HU: 2 };

function normalizeAnalyticsSite(site: unknown): SiteValue {
  const value = String(site ?? '').trim().toUpperCase();
  if (!value || value === '__ALL__' || value === '_ALL_' || value === 'ALL') return 'ALL';
  if (value === 'RO' || value === 'BG' || value === 'HU') return value;
  return 'ALL';
}

function normalizeShopName(value: unknown): string {
  return String(value ?? '')
    .replace(/\s*[（(]\s*(RO|BG|HU)\s*[）)]\s*$/i, '')
    .trim();
}

function siteLabel(site: unknown): string {
  const value = String(site ?? '').trim().toUpperCase();
  return SITE_LABEL_MAP[value] ?? (value || '未知站点');
}

function groupShopsByName(shops: ShopRecord[]): GroupedShop[] {
  const map = new Map<string, GroupedShop>();
  for (const shop of shops) {
    const displayName = normalizeShopName(shop.shopName);
    if (!displayName) continue;
    const site = String(shop.region ?? shop.site ?? '').trim().toUpperCase();
    const group = map.get(displayName) ?? { groupKey: displayName, displayName, shopIds: [], sites: [] };
    group.shopIds.push(shop.id);
    if (site) {
      group.sites.push({
        shopId: shop.id,
        site,
        label: siteLabel(site),
        currency: shop.currency,
      });
    }
    map.set(displayName, group);
  }
  return Array.from(map.values()).map((group) => ({
    ...group,
    sites: group.sites.sort((a, b) => (
      (SITE_SORT_ORDER[String(a.site).toUpperCase()] ?? 99) - (SITE_SORT_ORDER[String(b.site).toUpperCase()] ?? 99)
    )),
  })).map((group) => ({
    ...group,
    shopIds: group.sites.length > 0
      ? group.sites.map((site) => site.shopId)
      : Array.from(new Set(group.shopIds)),
  }));
}

function getCurrencyGroupKey(group: CurrencyGroup, index: number): string {
  const site = String(group.site ?? group.region ?? '').trim();
  const currency = String(group.currency ?? group.summary?.currency ?? '').trim();
  const shopId = group.shopId != null ? String(group.shopId) : '';
  const shopIds = Array.isArray(group.shopIds) ? group.shopIds.join(',') : '';
  return [site, currency, shopId || shopIds, index].filter(Boolean).join(':') || `group-${index}`;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatPlainNumber(value: unknown): string {
  const n = toNumber(value);
  return n == null ? '--' : n.toLocaleString('zh-CN');
}

function formatMoney(value: unknown, currency?: string | null): string {
  const n = toNumber(value);
  if (n == null || !currency) return '--';
  return `${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function hasDisplayableMoney(value: unknown, currency?: string | null): boolean {
  return toNumber(value) != null && !!currency;
}

function renderSalesTaxTooltip(record: OrderDailySummary | OrderDailyDay | null | undefined): ReactNode {
  const currency = record?.currency;
  const showAmountWithVat = hasDisplayableMoney(record?.amountWithVat, currency);
  const showVatAmount = hasDisplayableMoney(record?.vatAmount, currency);

  return (
    <Space direction="vertical" size={2}>
      <span>按订单商品成交价 sale_price 统计，不包含 VAT。</span>
      {showAmountWithVat && <span>订单金额（含税）：{formatMoney(record?.amountWithVat, currency)}</span>}
      {showVatAmount && <span>VAT：{formatMoney(record?.vatAmount, currency)}</span>}
      {record?.salesTaxMode && <span>税口径：{record.salesTaxMode}</span>}
    </Space>
  );
}

function renderProfitFormulaTooltip(record: OrderDailySummary | OrderDailyDay | null | undefined, fallback?: ReactNode): ReactNode {
  return (
    <Space direction="vertical" size={2}>
      {fallback}
      <span>订单毛利按不含税商品销售额计算，不包含 VAT。</span>
      <span>当前仍未完整计入广告费、仓储费、平台罚款、人工成本等费用。</span>
      {record?.profitFormulaVersion && <span>公式版本：{record.profitFormulaVersion}</span>}
    </Space>
  );
}

function formatMargin(value: unknown): string {
  const n = toNumber(value);
  return n == null ? '--' : `${n.toFixed(2)}%`;
}

function hasProfitNumbers(rowOrSummary: OrderDailySummary | OrderDailyDay | null | undefined): boolean {
  return toNumber(rowOrSummary?.grossProfit) != null && toNumber(rowOrSummary?.grossMargin) != null;
}

function canDisplayProfit(rowOrSummary: OrderDailySummary | OrderDailyDay | null | undefined): boolean {
  if (!rowOrSummary) return false;
  if (rowOrSummary.profitDisplayable === false) return false;
  if (rowOrSummary.profitDisplayable === true) return hasProfitNumbers(rowOrSummary);

  const netSales = toNumber(rowOrSummary.netSales) ?? 0;
  const productCost = toNumber(rowOrSummary.productCost) ?? 0;
  if (!hasProfitNumbers(rowOrSummary)) return false;
  if (netSales <= 0) return false;
  if (productCost <= 0) return false;
  if (rowOrSummary.costStatus === 'missing') return false;
  return true;
}

function isProfitReliable(rowOrSummary: OrderDailySummary | OrderDailyDay | null | undefined): boolean {
  if (!rowOrSummary) return false;
  if (rowOrSummary.grossProfitReliable === true) return true;
  return false;
}

function getProfitDisplayLabel(rowOrSummary: OrderDailySummary | OrderDailyDay | null | undefined): string {
  if (!rowOrSummary) return '未知';
  const displayStatus = rowOrSummary.profitDisplayStatus;
  if (displayStatus === 'complete') return '已覆盖';
  if (displayStatus === 'estimated') return '估算';
  if (displayStatus === 'partial') return '部分缺失';
  if (displayStatus === 'unavailable') return '暂不可算';

  const reliabilityStatus = rowOrSummary.costReliabilityStatus;
  if (rowOrSummary.grossProfitReliable === true) return '已覆盖';
  if (reliabilityStatus === 'complete') return '已覆盖';
  if (reliabilityStatus === 'estimated') return '估算';
  if (reliabilityStatus === 'partial') return '部分缺失';
  if (reliabilityStatus === 'missing') return '成本缺失';
  if (rowOrSummary.costStatus === 'missing') return '成本缺失';
  if (rowOrSummary.costStatus === 'partial') return '部分缺失';
  return '估算';
}

function getCostStatusTag(rowOrSummary: OrderDailySummary | OrderDailyDay | null | undefined) {
  const missingCount = toNumber(rowOrSummary?.costMissingItemCount);
  const matchedCount = toNumber(rowOrSummary?.costMatchedItemCount);
  const hasCountText = missingCount != null || matchedCount != null;
  const countText = hasCountText
    ? `已匹配 ${matchedCount ?? 0} / 缺失 ${missingCount ?? 0}`
    : undefined;

  if (!rowOrSummary) return { color: 'default', label: '未知', tooltip: countText };
  const label = getProfitDisplayLabel(rowOrSummary);
  const colorMap: Record<string, string> = {
    已覆盖: 'green',
    估算: 'blue',
    部分缺失: 'orange',
    成本缺失: 'red',
    暂不可算: 'red',
  };
  return { color: colorMap[label] ?? 'default', label, tooltip: countText };
}

function normalizeWarnings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function getRiskColor(day: OrderDailyDay): string {
  if (!canDisplayProfit(day)) return '#d97706';
  if (!isProfitReliable(day)) return '#d97706';
  const profit = toNumber(day.grossProfit);
  const margin = toNumber(day.grossMargin);
  if (profit != null && profit < 0) return '#dc2626';
  if (margin != null && margin < 10) return '#d97706';
  return '#15803d';
}

function WarningBanner({ warnings }: { warnings: string[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!Array.isArray(warnings) || warnings.length === 0) return null;
  return (
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 12, padding: '8px 12px' }}
      message={(
        <Space size={8} wrap>
          <span>当前毛利包含估算成本，仅供运营参考，不代表最终净利润。</span>
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setExpanded((v) => !v)}>
            {expanded ? '收起详情' : '查看详情'}
          </Button>
        </Space>
      )}
      description={expanded ? (
        <Space direction="vertical" size={2} style={{ marginTop: 4 }}>
          {warnings.map((warning) => <span key={warning}>{warning}</span>)}
        </Space>
      ) : undefined}
    />
  );
}

function FilterBar({
  filters,
  groupedShops,
  loading,
  onChange,
  onSubmit,
  onReset,
}: {
  filters: FilterState;
  groupedShops: GroupedShop[];
  loading: boolean;
  onChange: (next: FilterState) => void;
  onSubmit: () => void;
  onReset: () => void;
}) {
  return (
    <Card style={{ marginBottom: 16, borderRadius: 12 }} styles={{ body: { padding: 16 } }}>
      <Space wrap size="middle">
        <Space size={4}>
          <span style={{ color: '#64748b', fontSize: 13 }}>店铺：</span>
          <Select<string | undefined>
            allowClear
            placeholder="全部店铺"
            value={filters.shopGroupKey}
            onChange={(shopGroupKey) => onChange({ ...filters, shopGroupKey, shopId: undefined, site: 'ALL' })}
            style={{ minWidth: 180 }}
            options={groupedShops.map((shop) => ({ label: shop.displayName, value: shop.groupKey }))}
          />
        </Space>
        <Space size={4}>
          <span style={{ color: '#64748b', fontSize: 13 }}>月份：</span>
          <DatePicker
            picker="month"
            allowClear={false}
            value={dayjs(filters.month, 'YYYY-MM')}
            onChange={(value: Dayjs | null) => {
              if (value) onChange({ ...filters, month: value.format('YYYY-MM') });
            }}
            format="YYYY-MM"
            style={{ width: 130 }}
          />
        </Space>
        <Space size={4}>
          <span style={{ color: '#64748b', fontSize: 13 }}>订单口径：</span>
          <Select<StatusMode>
            value={filters.statusMode}
            onChange={(statusMode) => onChange({ ...filters, statusMode })}
            style={{ width: 140 }}
            options={STATUS_MODE_OPTIONS}
          />
        </Space>
        <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={onSubmit}>
          查询
        </Button>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={onReset}>
          重置
        </Button>
      </Space>
    </Card>
  );
}

function KpiCards({ summary, loading }: { summary: OrderDailySummary | null; loading: boolean }) {
  const currency = summary?.currency;
  const profitDisplayable = canDisplayProfit(summary);
  const profitReliable = isProfitReliable(summary);
  const profitLabel = getProfitDisplayLabel(summary);
  const cards = [
    { title: '订单数', value: formatPlainNumber(summary?.orderCount) },
    { title: '商品件数', value: formatPlainNumber(summary?.itemCount) },
    { title: '销售额（不含税）', value: formatMoney(summary?.grossSales, currency), help: renderSalesTaxTooltip(summary) },
    { title: '退款订单数', value: formatPlainNumber(summary?.refundOrderCount) },
    { title: '退款金额', value: formatMoney(summary?.refundAmount, currency) },
    { title: '净销售额', value: formatMoney(summary?.netSales, currency) },
    { title: '商品成本', value: formatMoney(summary?.productCost, currency) },
    { title: '佣金成本', value: formatMoney(summary?.commissionCost, currency) },
    { title: '履约成本', value: formatMoney(summary?.fulfillmentCost, currency) },
    {
      title: '订单毛利估算',
      value: profitDisplayable ? formatMoney(summary?.grossProfit, currency) : '暂不可算',
      danger: profitDisplayable && toNumber(summary?.grossProfit) != null && Number(summary?.grossProfit) < 0,
      warning: !profitDisplayable || !profitReliable,
      tag: profitDisplayable && !profitReliable ? profitLabel : undefined,
      subText: profitDisplayable && !profitReliable ? '毛利仅供运营参考' : undefined,
      help: renderProfitFormulaTooltip(
        summary,
        profitDisplayable
          ? (profitReliable ? undefined : <span>当前毛利包含估算成本，仅供运营参考，不代表最终净利润。</span>)
          : <span>商品成本缺失较多，当前毛利暂不可算。</span>,
      ),
    },
    {
      title: '毛利率估算',
      value: profitDisplayable ? formatMargin(summary?.grossMargin) : '暂不可算',
      warning: !profitDisplayable || !profitReliable || (toNumber(summary?.grossMargin) != null && Number(summary?.grossMargin) < 10),
      tag: profitDisplayable && !profitReliable ? profitLabel : undefined,
      subText: profitDisplayable && !profitReliable ? '毛利仅供运营参考' : undefined,
      help: renderProfitFormulaTooltip(
        summary,
        profitDisplayable
          ? (profitReliable ? undefined : <span>当前毛利率包含估算成本，仅供运营参考。</span>)
          : <span>成本缺失较多，当前毛利率暂不可算。</span>,
      ),
    },
  ];
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: 12,
      marginBottom: 16,
    }}>
      {cards.map((card) => (
        <Card key={card.title} loading={loading} style={{ borderRadius: 12 }} styles={{ body: { padding: 14 } }}>
          <Tooltip title={card.help}>
            <div>
              <Statistic
                title={card.title}
                value={card.value}
                valueStyle={{
                  fontSize: 18,
                  color: card.danger ? '#dc2626' : card.warning ? '#d97706' : '#1e293b',
                  fontWeight: 700,
                }}
              />
              {card.tag && <Tag color="blue" style={{ marginTop: 6 }}>{card.tag}</Tag>}
              {card.subText && <div style={{ marginTop: 4, color: '#d97706', fontSize: 12 }}>{card.subText}</div>}
            </div>
          </Tooltip>
        </Card>
      ))}
    </div>
  );
}

function CurrencyGroupsPanel({
  groups,
  activeKey,
  onChange,
}: {
  groups: CurrencyGroup[];
  activeKey?: string | null;
  onChange: (key: string) => void;
}) {
  if (!Array.isArray(groups) || groups.length === 0) return null;
  return (
    <Card title="站点 / 币种切换" style={{ marginBottom: 16, borderRadius: 12 }} styles={{ body: { padding: 16 } }}>
      <Space wrap align="start">
        {groups.map((group, index) => {
          const summary = group.summary;
          const currency = group.currency ?? summary?.currency;
          const key = getCurrencyGroupKey(group, index);
          const active = key === activeKey;
          const displaySite = String(group.site ?? group.region ?? '').toUpperCase();
          const displayShopName = group.shopName ?? group.shopNames?.[0];
          return (
            <Card
              key={key}
              size="small"
              hoverable
              onClick={() => onChange(key)}
              style={{
                width: 230,
                borderRadius: 10,
                background: active ? '#eff6ff' : '#f8fafc',
                borderColor: active ? '#2563eb' : '#e5e7eb',
                boxShadow: active ? '0 0 0 1px #2563eb inset' : undefined,
              }}
              styles={{ body: { padding: 12 } }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <div style={{ fontWeight: 700 }}>
                  {group.siteLabel ?? (displaySite ? siteLabel(displaySite) : currency ?? '币种组')}
                  {displaySite && <span style={{ marginLeft: 6, color: '#64748b', fontSize: 12 }}>{displaySite}</span>}
                </div>
                {active && <Tag color="blue" style={{ margin: 0 }}>当前</Tag>}
              </div>
              <div style={{ color: '#64748b', fontSize: 12 }}>币种：{currency ?? '未知'}</div>
              {displayShopName && <div style={{ color: '#64748b', fontSize: 12 }}>店铺：{displayShopName}</div>}
              <div style={{ color: '#64748b', fontSize: 12 }}>订单数：{formatPlainNumber(summary?.orderCount)}</div>
              <div style={{ color: '#64748b', fontSize: 12 }}>净销售额：{formatMoney(summary?.netSales, currency)}</div>
              <div style={{ color: canDisplayProfit(summary) && isProfitReliable(summary) ? '#64748b' : '#d97706', fontSize: 12 }}>
                毛利估算：{canDisplayProfit(summary) ? formatMoney(summary?.grossProfit, currency) : '暂不可算'}
              </div>
              <Tag color={getCostStatusTag(summary).color} style={{ marginTop: 6, marginInlineEnd: 0 }}>{getProfitDisplayLabel(summary)}</Tag>
            </Card>
          );
        })}
      </Space>
    </Card>
  );
}

function TrendCharts({ days, loading, summary }: { days: OrderDailyDay[]; loading: boolean; summary: OrderDailySummary | null }) {
  const summaryDisplayable = canDisplayProfit(summary);
  const summaryReliable = isProfitReliable(summary);
  const chartData = Array.isArray(days)
    ? days.map((day) => ({
      ...day,
      grossProfitForChart: canDisplayProfit(day) ? day.grossProfit : null,
    }))
    : [];
  const hasReliableProfitPoint = chartData.some((day) => day.grossProfitForChart != null);
  const showProfitTrend = summaryDisplayable && hasReliableProfitPoint;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
      <Card title={<Space><LineChartOutlined />每日订单数趋势</Space>} loading={loading} style={{ borderRadius: 12 }}>
        {chartData.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无趋势数据" />
        ) : (
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <RechartsTooltip />
                <Line type="monotone" dataKey="orderCount" name="订单数" stroke="#2563eb" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
      <Card title={<Space><BarChartOutlined />每日销售额 / 毛利趋势</Space>} loading={loading} style={{ borderRadius: 12 }}>
        {chartData.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无趋势数据" />
        ) : (
          <>
            {showProfitTrend && !summaryReliable && (
              <Alert
                type="warning"
                showIcon
                message="当前毛利包含估算成本，仅供运营参考，不代表最终净利润"
                style={{ marginBottom: 12 }}
              />
            )}
            {!showProfitTrend && (
              <Alert
                type="warning"
                showIcon
                message="成本缺失较多，暂不展示毛利趋势"
                style={{ marginBottom: 12 }}
              />
            )}
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RechartsTooltip />
                  <Legend />
                  <Area type="monotone" dataKey="grossSales" name="销售额（不含税）" stroke="#2563eb" fill="#dbeafe" />
                  {showProfitTrend && (
                    <Area
                      type="monotone"
                      dataKey="grossProfitForChart"
                      name="订单毛利估算"
                      stroke="#16a34a"
                      fill="#dcfce7"
                      connectNulls={false}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function DailyStatsTable({
  days,
  loading,
  onViewOrders,
}: {
  days: OrderDailyDay[];
  loading: boolean;
  onViewOrders: (day: OrderDailyDay) => void;
}) {
  const columns: ColumnsType<OrderDailyDay> = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 120, fixed: 'left' },
    { title: '订单数', dataIndex: 'orderCount', key: 'orderCount', width: 90, align: 'right', render: formatPlainNumber },
    { title: '商品件数', dataIndex: 'itemCount', key: 'itemCount', width: 100, align: 'right', render: formatPlainNumber },
    {
      title: (
        <Tooltip title="毛利计算使用不含税商品销售额。含税金额与 VAT 如后端返回，会在单元格提示中展示。">
          <span>销售额（不含税）</span>
        </Tooltip>
      ),
      key: 'grossSales',
      width: 150,
      align: 'right',
      render: (_: unknown, r) => (
        <Tooltip title={renderSalesTaxTooltip(r)}>
          <span>{formatMoney(r.grossSales, r.currency)}</span>
        </Tooltip>
      ),
    },
    { title: '退款数', dataIndex: 'refundOrderCount', key: 'refundOrderCount', width: 90, align: 'right', render: formatPlainNumber },
    { title: '退款金额', key: 'refundAmount', width: 130, align: 'right', render: (_: unknown, r) => formatMoney(r.refundAmount, r.currency) },
    { title: '净销售额', key: 'netSales', width: 130, align: 'right', render: (_: unknown, r) => formatMoney(r.netSales, r.currency) },
    { title: '商品成本', key: 'productCost', width: 130, align: 'right', render: (_: unknown, r) => formatMoney(r.productCost, r.currency) },
    {
      title: '订单毛利估算',
      key: 'grossProfit',
      width: 140,
      align: 'right',
      render: (_: unknown, r) => (
        canDisplayProfit(r)
          ? (
            <Space size={4}>
              <Text style={{ color: getRiskColor(r), fontWeight: 700 }}>{formatMoney(r.grossProfit, r.currency)}</Text>
              {!isProfitReliable(r) && <Tag color="blue" style={{ margin: 0 }}>{getProfitDisplayLabel(r)}</Tag>}
            </Space>
          )
          : <Text style={{ color: '#d97706', fontWeight: 700 }}>暂不可算</Text>
      ),
    },
    {
      title: '毛利率估算',
      key: 'grossMargin',
      width: 120,
      align: 'right',
      render: (_: unknown, r) => {
        const margin = toNumber(r.grossMargin);
        if (!canDisplayProfit(r)) {
          return <Text style={{ color: '#d97706', fontWeight: 600 }}>暂不可算</Text>;
        }
        return (
          <Space size={4}>
            <Text style={{ color: getRiskColor(r), fontWeight: 600 }}>{formatMargin(margin)}</Text>
            {margin != null && margin < 10 && <Tag color="orange" style={{ margin: 0 }}>风险</Tag>}
            {!isProfitReliable(r) && <Tag color="blue" style={{ margin: 0 }}>{getProfitDisplayLabel(r)}</Tag>}
          </Space>
        );
      },
    },
    {
      title: '成本状态',
      key: 'costStatus',
      width: 110,
      align: 'center',
      render: (_: unknown, r) => {
        const status = getCostStatusTag(r);
        const tag = <Tag color={status.color}>{status.label}</Tag>;
        return status.tooltip ? <Tooltip title={status.tooltip}>{tag}</Tooltip> : tag;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      fixed: 'right',
      render: (_: unknown, r) => {
        const orderCount = toNumber(r.orderCount) ?? 0;
        return (
          <Button type="link" size="small" disabled={orderCount <= 0} onClick={() => onViewOrders(r)}>
            查看订单
          </Button>
        );
      },
    },
  ];
  return (
    <Card title="每日明细" style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
      <Table<OrderDailyDay>
        rowKey="date"
        columns={columns}
        dataSource={Array.isArray(days) ? days : []}
        loading={loading}
        pagination={false}
        scroll={{ x: 'max-content', y: 'calc(100vh - 520px)' }}
        locale={{ emptyText: <Empty description="暂无订单日报数据" style={{ padding: 48 }} /> }}
      />
    </Card>
  );
}

export default function OrderDailyDashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [shops, setShops] = useState<ShopRecord[]>([]);
  const [filters, setFilters] = useState<FilterState>(() => ({
    ...DEFAULT_FILTERS,
    shopGroupKey: searchParams.get('shopGroupKey') || undefined,
    shopId: searchParams.get('shopId') ? Number(searchParams.get('shopId')) : undefined,
    site: normalizeAnalyticsSite(searchParams.get('site')),
    month: searchParams.get('month') || DEFAULT_FILTERS.month,
    statusMode: (searchParams.get('statusMode') as StatusMode) || DEFAULT_FILTERS.statusMode,
  }));
  const [summary, setSummary] = useState<OrderDailySummary | null>(null);
  const [days, setDays] = useState<OrderDailyDay[]>([]);
  const [currencyGroups, setCurrencyGroups] = useState<CurrencyGroup[]>([]);
  const [activeCurrencyGroupKey, setActiveCurrencyGroupKey] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [status, setStatus] = useState<PageStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestSeqRef = useRef(0);
  const initialGroupFetchRef = useRef(false);

  const loading = status === 'loading';
  const groupedShops = useMemo(() => groupShopsByName(shops), [shops]);
  const selectedGroupedShop = useMemo(
    () => groupedShops.find((shop) => shop.groupKey === filters.shopGroupKey)
      ?? (filters.shopId != null ? groupedShops.find((shop) => shop.shopIds.includes(Number(filters.shopId))) : undefined),
    [filters.shopGroupKey, filters.shopId, groupedShops],
  );

  const fetchShops = useCallback(async () => {
    if (!localStorage.getItem('token')) return;
    try {
      const { data: res } = await request.get<{ code: number; data?: ShopRecord[] }>('/shops');
      setShops(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      const httpStatus = (err as { response?: { status?: number } })?.response?.status;
      if (httpStatus !== 401) message.error('加载店铺列表失败');
    }
  }, []);

  const syncUrlFilters = useCallback((nextFilters: FilterState) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'order-daily-dashboard');
    if (nextFilters.shopGroupKey) next.set('shopGroupKey', nextFilters.shopGroupKey);
    else next.delete('shopGroupKey');
    if (nextFilters.shopId != null) next.set('shopId', String(nextFilters.shopId));
    else next.delete('shopId');
    next.set('site', 'ALL');
    next.set('month', nextFilters.month);
    next.set('statusMode', nextFilters.statusMode);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const fetchDailyStats = useCallback(async (nextFilters = filters) => {
    if (!localStorage.getItem('token')) {
      message.warning('请先登录');
      return;
    }
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    setStatus('loading');
    setErrorMessage(null);
    setSummary(null);
    setDays([]);
    setCurrencyGroups([]);
    setActiveCurrencyGroupKey(null);
    try {
      const targetGroup = groupedShops.find((shop) => shop.groupKey === nextFilters.shopGroupKey)
        ?? (nextFilters.shopId != null ? groupedShops.find((shop) => shop.shopIds.includes(Number(nextFilters.shopId))) : undefined);
      const params: Record<string, string | number> = {
        month: nextFilters.month,
        site: 'ALL',
        statusMode: nextFilters.statusMode,
        currencyMode: nextFilters.currencyMode,
        baseCurrency: nextFilters.baseCurrency,
      };
      if (targetGroup && targetGroup.shopIds.length > 0) {
        params.shopIds = targetGroup.shopIds.join(',');
      } else if (nextFilters.shopId != null) {
        params.shopId = nextFilters.shopId;
      }
      const { data: res } = await request.get<OrderDailyResponse>('/analytics/orders/daily', { params });
      if (res?.code != null && res.code !== 200) {
        throw new Error(res.message || '加载订单日报失败');
      }
      const payload = res?.data ?? null;
      const nextSummary = payload?.summary ?? null;
      const nextDays = Array.isArray(payload?.days) ? payload.days : [];
      const nextGroups = Array.isArray(payload?.currencyGroups) ? payload.currencyGroups : [];
      const nextWarnings = normalizeWarnings(payload?.warnings);

      if (requestSeqRef.current !== requestSeq) return;
      setSummary(nextSummary);
      setDays(nextDays);
      setCurrencyGroups(nextGroups);
      setActiveCurrencyGroupKey((prev) => {
        if (prev && nextGroups.some((group, index) => getCurrencyGroupKey(group, index) === prev)) return prev;
        const roIndex = nextGroups.findIndex((group) => String(group.site ?? '').toUpperCase() === 'RO');
        const nextIndex = roIndex >= 0 ? roIndex : 0;
        return nextGroups[nextIndex] ? getCurrencyGroupKey(nextGroups[nextIndex], nextIndex) : null;
      });
      setWarnings(nextWarnings);
      setStatus(nextGroups.length > 0 || nextDays.length > 0 || !!nextSummary ? 'success' : 'empty');
      syncUrlFilters({
        ...nextFilters,
        shopGroupKey: targetGroup?.groupKey ?? nextFilters.shopGroupKey,
        shopId: targetGroup ? undefined : nextFilters.shopId,
        site: 'ALL',
      });
    } catch (err) {
      const httpStatus = (err as { response?: { status?: number } })?.response?.status;
      if (httpStatus !== 401) {
        const msg = (err as { message?: string })?.message || '加载订单日报失败';
        setErrorMessage(msg);
        message.error(msg);
      }
      setSummary(null);
      setDays([]);
      setCurrencyGroups([]);
      setActiveCurrencyGroupKey(null);
      setWarnings([]);
      setStatus('error');
    }
  }, [filters, groupedShops, syncUrlFilters]);

  useEffect(() => { fetchShops(); }, [fetchShops]);

  useEffect(() => {
    if (!filters.shopGroupKey && filters.shopId != null && groupedShops.length > 0) {
      const group = groupedShops.find((shop) => shop.shopIds.includes(Number(filters.shopId)));
      if (group) {
        const next = { ...filters, shopGroupKey: group.groupKey, shopId: undefined, site: 'ALL' as SiteValue };
        setFilters(next);
        fetchDailyStats(next);
      }
    }
  }, [fetchDailyStats, filters, groupedShops]);

  useEffect(() => {
    if (filters.shopGroupKey && groupedShops.length > 0 && !initialGroupFetchRef.current) {
      initialGroupFetchRef.current = true;
      fetchDailyStats(filters);
    }
  }, [fetchDailyStats, filters, groupedShops.length]);

  useEffect(() => {
    fetchDailyStats(filters);
    // 仅首屏自动加载，后续由查询按钮或筛选重置触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReset = useCallback(() => {
    const next = { ...DEFAULT_FILTERS };
    setFilters(next);
    fetchDailyStats(next);
  }, [fetchDailyStats]);

  const handleViewOrders = useCallback((day: OrderDailyDay) => {
    const params = new URLSearchParams({ tab: 'platform-orders', date: day.date });
    const activeIndex = currencyGroups.findIndex((group, index) => getCurrencyGroupKey(group, index) === activeCurrencyGroupKey);
    const activeGroup = activeIndex >= 0 ? currencyGroups[activeIndex] : null;
    const site = normalizeAnalyticsSite(activeGroup?.site ?? activeGroup?.region ?? 'ALL');
    const fallbackShopId = activeGroup?.shopIds?.length === 1 ? activeGroup.shopIds[0] : undefined;
    const matchedSiteShopId = selectedGroupedShop?.sites.find((shopSite) => (
      site !== 'ALL' && normalizeAnalyticsSite(shopSite.site) === site
    ))?.shopId;
    const shopId = activeGroup?.shopId ?? fallbackShopId ?? matchedSiteShopId ?? filters.shopId;
    if (shopId != null) params.set('shopId', String(shopId));
    else {
      message.warning('当前站点缺少 shopId，暂无法跳转订单明细');
      return;
    }
    params.set('site', site);
    navigate(`/dashboard?${params.toString()}`);
  }, [activeCurrencyGroupKey, currencyGroups, filters.shopId, navigate, selectedGroupedShop]);

  const activeCurrencyGroup = useMemo(() => {
    const index = currencyGroups.findIndex((group, i) => getCurrencyGroupKey(group, i) === activeCurrencyGroupKey);
    return index >= 0 ? currencyGroups[index] : null;
  }, [activeCurrencyGroupKey, currencyGroups]);
  const activeSummary = activeCurrencyGroup?.summary ?? summary;
  const activeDays = activeCurrencyGroup?.days ?? days;
  const hasData = useMemo(() => activeDays.length > 0 || !!activeSummary, [activeDays.length, activeSummary]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
            <BarChartOutlined style={{ color: '#2563eb' }} /> 订单日报 / 运营看板
          </h2>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>
            按自然月查看每日订单、销售额、成本与毛利估算；部分成本未完整接入时，此数据仅供运营参考。
          </p>
        </div>
      </div>

      <FilterBar
        filters={filters}
        groupedShops={groupedShops}
        loading={loading}
        onChange={setFilters}
        onSubmit={() => fetchDailyStats(filters)}
        onReset={handleReset}
      />

      {status === 'error' && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="订单日报加载失败"
          description={errorMessage || '请检查后端接口是否可用，或稍后重试。'}
        />
      )}

      <WarningBanner warnings={warnings} />
      <CurrencyGroupsPanel groups={currencyGroups} activeKey={activeCurrencyGroupKey} onChange={setActiveCurrencyGroupKey} />

      {loading && !hasData ? (
        <Card style={{ borderRadius: 12 }}>
          <div style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin tip="正在加载订单日报..." />
          </div>
        </Card>
      ) : (
        <>
          <KpiCards summary={activeSummary} loading={loading} />
          {status === 'empty' && (
            <Card style={{ marginBottom: 16, borderRadius: 12 }}>
              <Empty description="当前筛选条件下暂无订单日报数据" />
            </Card>
          )}
          <TrendCharts days={activeDays} loading={loading} summary={activeSummary} />
          <DailyStatsTable days={activeDays} loading={loading} onViewOrders={handleViewOrders} />
        </>
      )}
    </div>
  );
}
