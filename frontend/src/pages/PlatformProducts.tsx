import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Table, Button, Space, Empty, Typography, Select, message, Tooltip, Modal, Input, Tag, Alert, Dropdown, Popover,
} from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import { ReloadOutlined, AppstoreOutlined, LinkOutlined, SearchOutlined, DownloadOutlined, ToolOutlined, SettingOutlined, FileTextOutlined, DownOutlined, InfoCircleOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import request from '../lib/request';
import ProductImage from '../components/ProductImage';
import RepeatPurchaseModal from '../components/RepeatPurchaseModal';
import type { RepeatPurchaseRow } from '../components/RepeatPurchaseModal';
import { CreateFbeShipmentModal } from './FbeShipments';
import ProfitBreakdownPopover, { type ProfitBreakdown } from '../components/ProfitBreakdownPopover';
import PlatformProductPriceChangeModal from '../components/PlatformProductPriceChangeModal';
import PlatformProductGrabCartPreviewModal from '../components/PlatformProductGrabCartPreviewModal';
import PlatformProductGrabCartBatchModal from '../components/PlatformProductGrabCartBatchModal';
import PlatformProductPriceActionLogModal from '../components/PlatformProductPriceActionLogModal';

const { Text } = Typography;

// ─── 平台产品（已上架店铺产品）───────────────────────────────────
type ProductClass =
  | 'all'
  | 'NEW'
  | 'HOT'
  | 'POTENTIAL'
  | 'NORMAL'
  | 'CLEARANCE';

type ProductClassValue = Exclude<ProductClass, 'all'>;
type LegacyProductClassValue =
  | 'OUT_OF_STOCK_WATCH'
  | 'DEAD'
  | 'TO_BE_ELIMINATED';
type ProductClassTagValue = ProductClassValue | LegacyProductClassValue;

type StockStatusValue =
  | 'OUT_OF_STOCK'
  | 'LOW_STOCK'
  | 'WARNING'
  | 'SAFE'
  | 'OVERSTOCK';

type OperationPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

type OperationAction =
  | 'URGENT_REPLENISH'
  | 'RAISE_PROFIT'
  | 'RAISE_PRICE_MODERATELY'
  | 'JOIN_CAMPAIGN'
  | 'COMPLAIN_HIJACKER'
  | 'WIN_BUY_BOX'
  | 'ADJUST_ADS'
  | 'CREATE_AD'
  | 'INCREASE_CPC'
  | 'LOWER_PRICE'
  | 'WAIT_FOR_ARRIVAL'
  | 'PAUSE_PURCHASE'
  | 'OBSERVE'
  | 'RAISE_PRICE'
  | 'ADVERTISE'
  | 'CLEARANCE';

type KnownOperationAction = OperationAction;

type BuyBoxGroupFilter = 'ALL' | 'WON' | 'NOT_WON' | 'UNKNOWN';
type LinkTypeFilter = 'ALL' | 'SELF_BUILT' | 'RESELL' | 'OWN_BRAND_RESELL' | 'UNKNOWN';
type StockGroupFilter = 'ALL' | 'STOCK_OK' | 'REPLENISH_WARNING' | 'OUT_OF_STOCK_REPLENISHED' | 'OUT_OF_STOCK_NOT_REPLENISHED';

interface FetchProductsOptions {
  refreshSales?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: string | null;
  sortOrder?: 'ascend' | 'descend' | null;
  mappingStatus?: 'all' | 'mapped' | 'unmapped';
  productClass?: ProductClass;
  buyBoxGroup?: BuyBoxGroupFilter;
  linkType?: LinkTypeFilter;
  stockGroup?: StockGroupFilter;
  operationAction?: string;
}

type ClassificationSummary = Partial<Record<ProductClassValue | LegacyProductClassValue | 'total', number>>;

interface StoreOverview {
  productStructure?: ClassificationSummary | null;
  product_structure?: ClassificationSummary | null;
  generatedAt?: string | null;
  generated_at?: string | null;
}

type OverviewCard<T extends string> = {
  value: T;
  title: string;
  description: string;
};

type ActionTipLevel = 'danger' | 'warning' | 'primary' | 'default';

type ClassificationSuggestionAction = {
  label: string;
  action?: OperationAction;
  tone: ActionTipLevel;
};

interface OperationActionStat {
  action: string;
  label?: string | null;
  count: number;
}

interface ProductClassActionTipsProps {
  productClass: ProductClass;
  actionStats: OperationActionStat[];
  hasOperationActionStatsField: boolean;
  selectedAction?: string;
  onActionClick: (action: string) => void;
  onClearActionFilter: () => void;
}

interface OperationAdvice {
  priority?: OperationPriority | string | null;
  action?: OperationAction | string | null;
  title?: string | null;
  reason?: string | null;
  tags?: string[] | null;
  metrics?: Record<string, unknown> | null;
}

interface PriceActionEligibility {
  canChangePrice?: boolean;
  code?: string | null;
  message?: string | null;
}

interface GrabCartEligibility {
  canGrab?: boolean | null;
  can_grab?: boolean | null;
  code?: string | null;
  message?: string | null;
  blockCode?: string | null;
  block_code?: string | null;
  blockMessage?: string | null;
  block_message?: string | null;
}

const OPERATION_ADVICE_DISPLAY_LIMIT = 3;

const BUY_BOX_FILTER_OPTIONS = [
  { value: 'ALL', label: '全部' },
  { value: 'WON', label: '购物车已抢到' },
  { value: 'NOT_WON', label: '未获得购物车' },
  { value: 'UNKNOWN', label: '购物车未知' },
] satisfies { value: BuyBoxGroupFilter; label: string }[];

const LINK_TYPE_FILTER_OPTIONS = [
  { value: 'ALL', label: '全部' },
  { value: 'SELF_BUILT', label: '自建链接' },
  { value: 'RESELL', label: '跟卖链接' },
  { value: 'OWN_BRAND_RESELL', label: '自有品牌跟卖' },
  { value: 'UNKNOWN', label: '待确认' },
] satisfies { value: LinkTypeFilter; label: string }[];

const STOCK_GROUP_FILTER_OPTIONS = [
  { value: 'ALL', label: '全部' },
  { value: 'STOCK_OK', label: '库存充足' },
  { value: 'REPLENISH_WARNING', label: '补货预警' },
  { value: 'OUT_OF_STOCK_REPLENISHED', label: '缺货已补' },
  { value: 'OUT_OF_STOCK_NOT_REPLENISHED', label: '断货未补' },
] satisfies { value: StockGroupFilter; label: string }[];

const renderFilterEntryLabel = (entryLabel: string) => (props: { value?: string | number; label?: React.ReactNode }) => {
  if (props.value === 'ALL') return entryLabel;
  return props.label;
};

const PRODUCT_STRUCTURE_CARDS = [
  {
    value: 'all',
    title: '全部产品',
    description: '当前店铺同步到系统的全部平台产品',
  },
  {
    value: 'NEW',
    title: '新品',
    description: '首次上架或处于新品观察阶段的产品',
  },
  {
    value: 'HOT',
    title: '主推款',
    description: '当前卖得好，或历史有销量但当前断货',
  },
  {
    value: 'POTENTIAL',
    title: '成长款',
    description: '近期开始动销，有继续观察价值',
  },
  {
    value: 'NORMAL',
    title: '常规款',
    description: '表现稳定，正常维护',
  },
  {
    value: 'CLEARANCE',
    title: '清理款',
    description: '有库存但长期卖不动，需要清理',
  },
] satisfies { value: ProductClass; title: string; description: string }[];

const PRODUCT_CLASS_SUGGESTION_ACTIONS = {
  all: [
    { label: '优先查看低库存', tone: 'warning' },
    { label: '检查未关联SKU', tone: 'primary' },
    { label: '处理负毛利产品', action: 'RAISE_PROFIT', tone: 'danger' },
    { label: '补充缺失图片', tone: 'default' },
    { label: '关注无销量库存', tone: 'warning' },
  ],
  HOT: [
    { label: '库存较低', tone: 'warning' },
    { label: '紧急补货', action: 'URGENT_REPLENISH', tone: 'danger' },
    { label: '适度提价', action: 'RAISE_PRICE_MODERATELY', tone: 'warning' },
    { label: '加大广告', action: 'ADJUST_ADS', tone: 'primary' },
    { label: '保持排名', tone: 'default' },
  ],
  NEW: [
    { label: '优先补货入仓', action: 'WAIT_FOR_ARRIVAL', tone: 'primary' },
    { label: '观察首周动销', action: 'OBSERVE', tone: 'warning' },
    { label: '完善listing资料', tone: 'default' },
    { label: '控制首批备货', tone: 'warning' },
    { label: '跟踪可售时间', tone: 'primary' },
  ],
  POTENTIAL: [
    { label: '加广告测试', action: 'ADJUST_ADS', tone: 'primary' },
    { label: '小批量补货', action: 'URGENT_REPLENISH', tone: 'warning' },
    { label: '观察转化率', action: 'OBSERVE', tone: 'default' },
    { label: '优化主图文案', tone: 'primary' },
    { label: '提高曝光', action: 'ADJUST_ADS', tone: 'warning' },
  ],
  NORMAL: [
    { label: '保持价格', tone: 'default' },
    { label: '正常维护', tone: 'primary' },
    { label: '检查库存', tone: 'warning' },
    { label: '补齐资料', tone: 'default' },
    { label: '观察波动', action: 'OBSERVE', tone: 'default' },
  ],
  CLEARANCE: [
    { label: '降低价格', action: 'LOWER_PRICE', tone: 'danger' },
    { label: '参与活动', action: 'JOIN_CAMPAIGN', tone: 'warning' },
    { label: '调整广告', action: 'ADJUST_ADS', tone: 'warning' },
    { label: '暂停采购', action: 'PAUSE_PURCHASE', tone: 'danger' },
    { label: '减少库存占用', tone: 'warning' },
  ],
} as const satisfies Record<ProductClass, readonly ClassificationSuggestionAction[]>;

const ACTION_TIP_LEVEL_STYLE = {
  danger: { color: '#dc2626', background: '#fef2f2', borderColor: '#fecaca' },
  warning: { color: '#d97706', background: '#fff7ed', borderColor: '#fed7aa' },
  primary: { color: '#2563eb', background: '#eff6ff', borderColor: '#bfdbfe' },
  default: { color: '#475569', background: '#f8fafc', borderColor: '#e2e8f0' },
} as const satisfies Record<ActionTipLevel, React.CSSProperties>;

const LINK_TYPE_LABEL_MAP = {
  SELF_BUILT: '自建链接',
  RESELL: '跟卖链接',
  OWN_BRAND_RESELL: '自有品牌跟卖',
  UNKNOWN: '待确认',
} as const;

const LINK_TAG_STYLE_MAP = {
  selfBuilt: { color: '#0891b2', background: '#ecfeff', borderColor: '#a5f3fc' },
  resell: { color: '#d97706', background: '#fff7ed', borderColor: '#fed7aa' },
  ownBrandResell: { color: '#7c3aed', background: '#f5f3ff', borderColor: '#ddd6fe' },
  brand: { color: '#475569', background: '#f1f5f9', borderColor: '#cbd5e1' },
  buyBoxWon: { color: '#15803d', background: '#f0fdf4', borderColor: '#bbf7d0' },
  buyBoxLost: { color: '#dc2626', background: '#fef2f2', borderColor: '#fecaca' },
  default: { color: '#64748b', background: '#f8fafc', borderColor: '#e2e8f0' },
} as const satisfies Record<string, React.CSSProperties>;

const PRODUCT_CLASS_TAG_MAP = {
  HOT: { color: 'orange', label: '主推款' },
  POTENTIAL: { color: 'geekblue', label: '成长款' },
  NORMAL: { color: 'default', label: '常规款' },
  CLEARANCE: { color: 'red', label: '清理款' },
  NEW: { color: 'green', label: '新品' },
  OUT_OF_STOCK_WATCH: { color: 'orange', label: '主推款' },
  DEAD: { color: 'red', label: '清理款' },
  TO_BE_ELIMINATED: { color: 'red', label: '清理款' },
} as const satisfies Record<ProductClassTagValue, { color: string; label: string }>;

const STOCK_STATUS_TAG_MAP = {
  OUT_OF_STOCK: { color: 'red', label: '缺货' },
  LOW_STOCK: { color: 'orange', label: '低库存' },
  WARNING: { color: 'gold', label: '补货预警' },
  SAFE: { color: 'green', label: '库存充足' },
  OVERSTOCK: { color: 'blue', label: '库存偏多' },
} as const satisfies Record<StockStatusValue, { color: string; label: string }>;

const OPERATION_PRIORITY_STYLE_MAP = {
  P0: { color: '#dc2626', background: '#fef2f2', borderColor: '#fecaca', label: 'P0' },
  P1: { color: '#dc2626', background: '#fef2f2', borderColor: '#fecaca', label: 'P1' },
  P2: { color: '#ea580c', background: '#fff7ed', borderColor: '#fed7aa', label: 'P2' },
  P3: { color: '#ca8a04', background: '#fefce8', borderColor: '#fde047', label: 'P3' },
  P4: { color: '#2563eb', background: '#eff6ff', borderColor: '#bfdbfe', label: 'P4' },
  P5: { color: '#334155', background: '#f1f5f9', borderColor: '#cbd5e1', label: 'P5' },
} as const satisfies Record<OperationPriority, { color: string; background: string; borderColor: string; label: string }>;

const OPERATION_PRIORITY_UNKNOWN_STYLE = {
  color: '#64748b',
  background: '#f8fafc',
  borderColor: '#e2e8f0',
  label: '-',
} as const;

const OPERATION_ACTION_LABEL_MAP: Record<KnownOperationAction, string> = {
  URGENT_REPLENISH: '紧急补货',
  RAISE_PROFIT: '提高毛利',
  RAISE_PRICE_MODERATELY: '适度提价',
  JOIN_CAMPAIGN: '参与活动',
  COMPLAIN_HIJACKER: '投诉跟卖',
  WIN_BUY_BOX: '抢购物车',
  ADJUST_ADS: '调整广告',
  CREATE_AD: '调整广告',
  INCREASE_CPC: '调整广告',
  LOWER_PRICE: '降低价格',
  WAIT_FOR_ARRIVAL: '新品待入仓',
  PAUSE_PURCHASE: '暂停采购',
  OBSERVE: '继续观察',
  RAISE_PRICE: '建议涨价',
  ADVERTISE: '调整广告',
  CLEARANCE: '清仓处理',
};

const OPERATION_ACTION_SHORT_LABEL_MAP: Record<KnownOperationAction, string> = {
  URGENT_REPLENISH: '紧急补货',
  RAISE_PROFIT: '提高毛利',
  RAISE_PRICE_MODERATELY: '适度提价',
  JOIN_CAMPAIGN: '参与活动',
  COMPLAIN_HIJACKER: '投诉跟卖',
  WIN_BUY_BOX: '抢购物车',
  ADJUST_ADS: '调整广告',
  CREATE_AD: '调整广告',
  INCREASE_CPC: '调整广告',
  LOWER_PRICE: '降价',
  WAIT_FOR_ARRIVAL: '待入仓',
  PAUSE_PURCHASE: '暂停采购',
  OBSERVE: '观察',
  RAISE_PRICE: '建议涨价',
  ADVERTISE: '调整广告',
  CLEARANCE: '清仓',
};

const AD_OPERATION_ACTIONS = new Set([
  'ADJUST_ADS',
  'CREATE_AD',
  'INCREASE_CPC',
  'ADVERTISE',
]);

function isAdOperationAction(action?: string | null): boolean {
  return AD_OPERATION_ACTIONS.has(String(action ?? '').trim().toUpperCase());
}

function normalizeOperationActionStats(raw: unknown): OperationActionStat[] {
  if (!Array.isArray(raw)) return [];
  const result: OperationActionStat[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as OperationActionStat;
    const action = typeof row.action === 'string' ? row.action.trim().toUpperCase() : '';
    if (!action) continue;
    const count = typeof row.count === 'number' ? row.count : Number(row.count);
    if (!Number.isFinite(count) || count <= 0) continue;
    const label = typeof row.label === 'string' && row.label.trim() ? row.label.trim() : null;
    result.push({ action, label, count });
  }
  return result.sort((a, b) => b.count - a.count);
}

function hasOperationActionStatsKey(source: unknown): boolean {
  if (!source || typeof source !== 'object') return false;
  return 'operationActionStats' in source || 'operation_action_stats' in source;
}

function resolveOperationActionStatsFromResponse(res: unknown): { stats: OperationActionStat[]; hasField: boolean } {
  const resObj = res && typeof res === 'object' ? res as Record<string, unknown> : null;
  const data = resObj?.data;
  const dataObj = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null;
  const hasField = hasOperationActionStatsKey(dataObj) || hasOperationActionStatsKey(resObj);
  const raw =
    dataObj?.operationActionStats
    ?? dataObj?.operation_action_stats
    ?? resObj?.operationActionStats
    ?? resObj?.operation_action_stats;
  return { stats: normalizeOperationActionStats(raw), hasField };
}

function getOperationActionStatLabel(action: string, backendLabel?: string | null): string {
  const normalizedAction = action.trim().toUpperCase();
  if (isAdOperationAction(normalizedAction)) return '调整广告';
  if (normalizedAction === 'JOIN_CAMPAIGN') return '参与活动';
  const explicit = getExplicitLabel(backendLabel);
  if (explicit) return explicit;
  return getOperationActionLabel(normalizedAction) ?? normalizedAction;
}

function getOperationActionStatTone(action: string): ActionTipLevel {
  const key = action.trim().toUpperCase();
  if (key === 'LOWER_PRICE' || key === 'PAUSE_PURCHASE' || key === 'RAISE_PROFIT') return 'danger';
  if (key === 'JOIN_CAMPAIGN' || key === 'URGENT_REPLENISH' || key === 'RAISE_PRICE_MODERATELY') return 'warning';
  if (isAdOperationAction(key)) return 'primary';
  return 'default';
}

interface PurchaseSuggestionData {
  dailySales?: number | null;
  targetStock?: number | null;
  platformStock?: number | null;
  platformInTransit?: number | null;
  inTransitStock?: number | null;
  localStock?: number | null;
  purchasingStock?: number | null;
  purchasingInTransit?: number | null;
  planningStock?: number | null;
  suggestAmount?: number | null;
  targetStockDays?: number | null;
  target_stock_days?: number | null;
  platformStockDays?: number | null;
  platform_stock_days?: number | null;
  totalCoverageDays?: number | null;
  total_coverage_days?: number | null;
  coverageStock?: number | null;
  coverage_stock?: number | null;
  newProductStage?: string | null;
  new_product_stage?: string | null;
  newProductStageLabel?: string | null;
  new_product_stage_label?: string | null;
  firstAvailableAt?: string | null;
  first_available_at?: string | null;
  inventoryTag?: ProductClassValue | LegacyProductClassValue | string;
  text?: string | null;
  label?: string | null;
  reason?: string | null;
}

interface StoreProduct {
  id: number;
  storeProductId?: number | null;
  store_product_id?: number | null;
  shopId?: number | null;
  shop_id?: number | null;
  pnk?: string | null;
  sku?: string | null;
  /** 后端修正后的真实卖家 SKU（eMAG vendorSku 字段），优先展示 */
  vendorSku?: string | null;
  vendor_sku?: string | null;
  ean?: string | null;
  part_number_key?: string | null;
  part_number?: string | null;
  partNumber?: string | null;
  title?: string | null;
  name?: string | null;
  product_name?: string | null;
  productName?: string | null;
  image?: string | null;        // 后端合并后的最终兜底图（优先平台图，无则取本地图）
  local_image?: string | null;  // 纯本地库存备用图
  main_image?: string | null;
  mainImage?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  image_fetching?: boolean;
  imageFetching?: boolean;
  productUrl?: string | null;
  product_url?: string | null;
  emagOfferId?: string | number | null;
  emag_offer_id?: string | number | null;
  offerId?: string | number | null;
  offer_id?: string | number | null;
  price?: number | null;
  sale_price?: number | null;
  salePrice?: number | null;
  currency?: string | null;
  platformStock?: number | null;
  platform_stock?: number | null;
  stock?: number | null;
  // ERP 内部闭环在途量（以发货单为准，补货决策主依据）
  inTransitQuantity?: number | null;
  in_transit_quantity?: number | null;
  inTransitScope?: string | null;
  in_transit_scope?: string | null;
  // eMAG 平台同步的在途量（用于对账）
  stockInTransit?: number | null;
  stock_in_transit?: number | null;
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
  comprehensive_sales?: number | null;
  stockStatus?: string | null;
  stock_status?: string | null;
  stockDays?: number | null;
  stock_days?: number | null;
  stockDailySales?: number | null;
  stock_daily_sales?: number | null;
  validation_status?: number;
  status?: string;
  rejection_reason?: string | null;
  rejectionReason?: string | null;
  // 后端直接返回的映射关系字段（比 inventoryMap 本地字典更权威）
  mapped_inventory_sku?: string | null;
  mappedInventorySku?: string | null;
  inventorySku?: string | null;
  inventory_sku?: string | null;
  inventoryId?: number | null;
  inventory_id?: number | null;
  // 后端直接内联返回的本地库存详情（用于采购计划，无需再查字典）
  local_product_id?: number | null;
  localProductId?: number | null;
  local_chinese_name?: string | null;
  localChineseName?: string | null;
  purchase_cost?: number | null;
  purchaseCost?: number | null;
  // ── 后端预估毛利计算引擎字段（Prisma 小驼峰） ──
  estimatedProfitLocal?: number | null;
  estimated_profit?:     number | null;   // snake_case 别名兜底
  estimatedProfitCny?:   number | null;
  profitCalculatedAt?:   string | null;
  commissionRate?:       number | null;
  profitMarginPct?:      number | null;
  profit_margin_pct?:    number | null;   // snake_case 别名兜底
  // ── 毛利推演明细（后端预计算，含估算标记） ──
  profit_breakdown?:     ProfitBreakdown | null;
  profitBreakdown?:      ProfitBreakdown | null;
  productClass?:         string | null;
  product_class?:        string | null;
  productClassLabel?:    string | null;
  product_class_label?:  string | null;
  classificationReason?: string | null;
  classification_reason?: string | null;
  classificationMetrics?: unknown;
  classification_metrics?: unknown;
  brand?: string | null;
  product_brand?: string | null;
  platformBrand?: string | null;
  platform_brand?: string | null;
  linkType?: string | null;
  link_type?: string | null;
  linkTypeLabel?: string | null;
  link_type_label?: string | null;
  priceActionEligibility?: PriceActionEligibility | null;
  price_action_eligibility?: PriceActionEligibility | null;
  contentPermission?: string | null;
  content_permission?: string | null;
  contentPermissionLabel?: string | null;
  content_permission_label?: string | null;
  offerCompetitionType?: string | null;
  offer_competition_type?: string | null;
  offerCompetitionLabel?: string | null;
  offer_competition_label?: string | null;
  numberOfOffers?: number | null;
  number_of_offers?: number | null;
  buyBoxStatus?: string | null;
  buy_box_status?: string | null;
  buyBoxStatusLabel?: string | null;
  buy_box_status_label?: string | null;
  buyBoxStatusSource?: string | null;
  buy_box_status_source?: string | null;
  buyBoxStatusConfidence?: string | null;
  buy_box_status_confidence?: string | null;
  buyBoxRank?: number | null;
  buy_box_rank?: number | null;
  buyBoxActionTips?: string[] | string | null;
  buy_box_action_tips?: string[] | string | null;
  buyBoxMeta?: unknown;
  buy_box_meta?: unknown;
  grabCartEligibility?: GrabCartEligibility | null;
  grab_cart_eligibility?: GrabCartEligibility | null;
  canGrabCart?: boolean | null;
  can_grab_cart?: boolean | null;
  isSaleable?: boolean | null;
  is_saleable?: boolean | null;
  saleable?: boolean | null;
  purchaseSuggestion?:   PurchaseSuggestionData | null;
  purchase_suggestion?:  PurchaseSuggestionData | null;
  operationAdvice?:      OperationAdvice | null;
  operation_advice?:     OperationAdvice | null;
  operationAdvices?:     OperationAdvice[] | null;
  operation_advices?:    OperationAdvice[] | null;
  __dedupeHiddenCount?:  number;
  __dedupeHiddenPnks?:   string[];
}

// 本地库存 SKU 信息（用于关联、毛利计算及采购计划）
interface LocalInventoryMap {
  id:           number;            // 库存产品 DB 主键，创建采购计划时必须使用此 ID
  imageUrl:     string | null;
  purchasePrice: number | null;
  chineseName:  string | null;
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
  initialShopId?: number;
}

function getMappedInventorySku(product: StoreProduct): string {
  return String(product.mapped_inventory_sku ?? product.mappedInventorySku ?? product.inventorySku ?? product.inventory_sku ?? '').trim();
}

function getPlatformProductPnk(product: StoreProduct): string {
  return String(product.pnk ?? product.part_number_key ?? product.partNumber ?? product.part_number ?? '').trim();
}

function getPlatformProductDedupeKey(product: StoreProduct): string {
  const ean = String(product.ean ?? '').trim();
  if (ean) return `EAN:${ean.toUpperCase()}`;

  const sku = String(product.vendorSku ?? product.vendor_sku ?? product.sku ?? '').trim();
  if (sku) return `SKU:${sku.toUpperCase()}`;

  return `ID:${product.id}`;
}

function attachHiddenProductInfo(visible: StoreProduct, hidden: StoreProduct): StoreProduct {
  const hiddenPnks = new Set<string>(visible.__dedupeHiddenPnks ?? []);
  for (const pnk of hidden.__dedupeHiddenPnks ?? []) {
    if (pnk) hiddenPnks.add(pnk);
  }
  const hiddenPnk = getPlatformProductPnk(hidden);
  if (hiddenPnk) hiddenPnks.add(hiddenPnk);

  return {
    ...visible,
    __dedupeHiddenCount: (visible.__dedupeHiddenCount ?? 0) + 1 + (hidden.__dedupeHiddenCount ?? 0),
    __dedupeHiddenPnks: Array.from(hiddenPnks),
  };
}

function dedupePlatformProductsByEan(list: StoreProduct[]): { list: StoreProduct[]; filteredCount: number } {
  const map = new Map<string, StoreProduct>();
  let filteredCount = 0;

  list.forEach((item) => {
    const key = getPlatformProductDedupeKey(item);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...item, __dedupeHiddenCount: 0, __dedupeHiddenPnks: [] });
      return;
    }

    filteredCount += 1;
    const existingMapped = !!getMappedInventorySku(existing);
    const currentMapped = !!getMappedInventorySku(item);

    if (!existingMapped && currentMapped) {
      map.set(key, attachHiddenProductInfo({ ...item, __dedupeHiddenCount: 0, __dedupeHiddenPnks: [] }, existing));
    } else {
      map.set(key, attachHiddenProductInfo(existing, item));
    }
  });

  return { list: Array.from(map.values()), filteredCount };
}

function renderOverviewCards<T extends string>({
  cards,
  getCount,
  activeValue,
  onCardClick,
}: {
  cards: readonly OverviewCard<T>[];
  getCount: (value: T) => number | undefined;
  activeValue?: T;
  onCardClick?: (value: T) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'nowrap',
        overflowX: 'auto',
        paddingBottom: 2,
      }}
    >
      {cards.map((card) => {
        const clickable = !!onCardClick;
        const active = activeValue === card.value;
        const count = getCount(card.value);
        const displayCount = typeof count === 'number' ? count : '-';
        return (
          <button
            key={card.value}
            type="button"
            onClick={clickable ? () => onCardClick(card.value) : undefined}
            style={{
              flex: '0 0 96px',
              width: 96,
              minHeight: 48,
              padding: '5px 8px',
              textAlign: 'left',
              background: active ? '#eff6ff' : '#fff',
              border: `1px solid ${active ? '#2563eb' : '#e5e7eb'}`,
              borderRadius: 10,
              cursor: clickable ? 'pointer' : 'default',
              boxShadow: active ? '0 4px 12px rgba(37, 99, 235, 0.12)' : 'none',
              transition: 'border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (clickable && !active) e.currentTarget.style.borderColor = '#93c5fd';
            }}
            onMouseLeave={(e) => {
              if (clickable && !active) e.currentTarget.style.borderColor = '#e5e7eb';
            }}
          >
            <div style={{ color: active ? '#1d4ed8' : '#1e293b', fontSize: 12, fontWeight: 600, marginBottom: 1, lineHeight: 1.2 }}>
              {card.title}
            </div>
            <div style={{ color: '#111827', fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>
              {displayCount}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function renderActionFilterTag({
  action,
  label,
  tone,
  active,
  onActionClick,
}: {
  action: string;
  label: string;
  tone: ActionTipLevel;
  active: boolean;
  onActionClick: (action: string) => void;
}) {
  const baseStyle = ACTION_TIP_LEVEL_STYLE[tone];
  return (
    <Tag
      role="button"
      tabIndex={0}
      onClick={() => onActionClick(action)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActionClick(action);
        }
      }}
      style={{
        ...baseStyle,
        marginInlineEnd: 0,
        borderRadius: 999,
        fontSize: 12,
        lineHeight: '22px',
        paddingInline: 9,
        fontWeight: tone === 'danger' || active ? 700 : 600,
        cursor: 'pointer',
        borderWidth: active ? 2 : 1,
        boxShadow: active ? '0 0 0 1px rgba(37, 99, 235, 0.15)' : undefined,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.filter = 'brightness(0.97)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.filter = 'none';
      }}
    >
      {label}
    </Tag>
  );
}

function renderProductClassActionTips({
  productClass,
  actionStats,
  hasOperationActionStatsField,
  selectedAction,
  onActionClick,
  onClearActionFilter,
}: ProductClassActionTipsProps) {
  const fallbackTips = PRODUCT_CLASS_SUGGESTION_ACTIONS[productClass] ?? PRODUCT_CLASS_SUGGESTION_ACTIONS.all;
  const fallbackActionTips = fallbackTips.filter((tip) => Boolean(tip.action));
  const fallbackHintTips = fallbackTips.filter((tip) => !tip.action);

  const useDynamic = actionStats.length > 0;
  const useFallback = !hasOperationActionStatsField && !useDynamic;

  const selectedLabel = selectedAction
    ? (
      actionStats.find((stat) => stat.action === selectedAction)
        ? getOperationActionStatLabel(selectedAction, actionStats.find((stat) => stat.action === selectedAction)?.label)
        : fallbackActionTips.find((tip) => tip.action === selectedAction)?.label
          ?? getOperationActionStatLabel(selectedAction)
    )
    : undefined;

  const subtitle = useDynamic
    ? '根据当前分类真实运营动作统计，点击可筛选产品'
    : useFallback
      ? '以下为参考提示，部分动作暂无法筛选'
      : '当前分类暂无可筛选运营动作';

  const hasClickableActions = useDynamic || (useFallback && fallbackActionTips.length > 0);

  return (
    <div
      style={{
        flex: '1 1 320px',
        minWidth: 280,
        minHeight: 72,
        padding: '10px 12px',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ color: '#1e293b', fontSize: 13, fontWeight: 700 }}>当前分类建议</span>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>{subtitle}</span>
        {selectedLabel ? (
          <span style={{ color: '#64748b', fontSize: 12 }}>
            当前已筛选：{selectedLabel}
          </span>
        ) : null}
        {selectedAction ? (
          <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 12 }} onClick={onClearActionFilter}>
            清除动作筛选
          </Button>
        ) : null}
      </div>
      {useDynamic ? (
        <Space size={[6, 6]} wrap>
          {actionStats.map((stat) => {
            const label = getOperationActionStatLabel(stat.action, stat.label);
            const active = stat.action === selectedAction;
            return (
              <React.Fragment key={stat.action}>
                {renderActionFilterTag({
                  action: stat.action,
                  label: `${label} ${stat.count}`,
                  tone: getOperationActionStatTone(stat.action),
                  active,
                  onActionClick,
                })}
              </React.Fragment>
            );
          })}
        </Space>
      ) : useFallback ? (
        <>
          {fallbackActionTips.length > 0 ? (
            <Space size={[6, 6]} wrap>
              {fallbackActionTips.map((tip) => {
                const active = tip.action === selectedAction;
                return (
                  <React.Fragment key={`${productClass}-${tip.action}`}>
                    {renderActionFilterTag({
                      action: tip.action as string,
                      label: tip.label,
                      tone: tip.tone,
                      active,
                      onActionClick,
                    })}
                  </React.Fragment>
                );
              })}
            </Space>
          ) : null}
          {fallbackHintTips.length > 0 ? (
            <Text type="secondary" style={{ display: 'block', fontSize: 12, lineHeight: '20px', marginTop: fallbackActionTips.length > 0 ? 6 : 0 }}>
              参考：{fallbackHintTips.map((tip) => tip.label).join(' · ')}
            </Text>
          ) : null}
          {!hasClickableActions ? (
            <Text type="secondary" style={{ fontSize: 12 }}>暂无可筛选运营动作</Text>
          ) : null}
        </>
      ) : (
        <Text type="secondary" style={{ fontSize: 12 }}>暂无可筛选运营动作</Text>
      )}
    </div>
  );
}

function normalizeEnumValue(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function getExplicitLabel(label: unknown): string | null {
  return typeof label === 'string' && label.trim() ? label.trim() : null;
}

function resolveProductBrand(record: StoreProduct): string | null {
  const raw = record.brand ?? record.product_brand ?? record.platformBrand ?? record.platform_brand;
  const text = typeof raw === 'string' ? raw.trim() : '';
  return text || null;
}

function getLinkTypeTagStyle(linkType: string): React.CSSProperties {
  if (linkType === 'SELF_BUILT') return LINK_TAG_STYLE_MAP.selfBuilt;
  if (linkType === 'RESELL') return LINK_TAG_STYLE_MAP.resell;
  if (linkType === 'OWN_BRAND_RESELL') return LINK_TAG_STYLE_MAP.ownBrandResell;
  return LINK_TAG_STYLE_MAP.default;
}

function getPriceActionDisabledReason(record: StoreProduct): string | null {
  const linkType = normalizeEnumValue(record.linkType ?? record.link_type);
  if (!['SELF_BUILT', 'RESELL', 'OWN_BRAND_RESELL'].includes(linkType)) {
    return '链接类型待确认';
  }
  // offerId 是否缺失交由 price/preview 后端判断 MISSING_EMAG_OFFER_ID（列表接口未必返回 offerId 字段）
  return null;
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function getGrabCartPreviewDisabledReason(record: StoreProduct): string | null {
  const linkType = normalizeEnumValue(record.linkType ?? record.link_type);
  if (linkType === 'SELF_BUILT') return '自建链接不参与手动抢购物车';
  if (linkType === 'OWN_BRAND_RESELL') return '自有品牌跟卖不参与手动抢购物车';
  if (linkType !== 'RESELL') return '仅普通跟卖可抢购物车';

  const stock = toFiniteNumber(record.platformStock ?? record.platform_stock ?? record.stock);
  if (stock != null && stock <= 0) return '库存为 0，不可抢购物车';

  const buyBoxStatus = normalizeEnumValue(record.buyBoxStatus ?? record.buy_box_status);
  if (buyBoxStatus === 'WON') return '已赢得购物车，无需重复抢车';

  const saleable = record.isSaleable ?? record.is_saleable ?? record.saleable;
  if (saleable === false) return '当前商品不可售';
  const status = normalizeEnumValue(record.status);
  if (['INACTIVE', 'DISABLED', 'NOT_SALEABLE', 'REJECTED'].includes(status)) return '当前商品不可售';

  const eligibility = record.grabCartEligibility ?? record.grab_cart_eligibility ?? null;
  const canGrab = eligibility?.canGrab ?? eligibility?.can_grab ?? record.canGrabCart ?? record.can_grab_cart;
  if (canGrab === false) {
    return eligibility?.message
      ?? eligibility?.blockMessage
      ?? eligibility?.block_message
      ?? eligibility?.code
      ?? eligibility?.blockCode
      ?? eligibility?.block_code
      ?? '未满足后端抢车候选条件';
  }

  return null;
}

function renderCompactInfoTag(label: string, style: React.CSSProperties) {
  return (
    <Tag
      key={label}
      style={{
        ...style,
        margin: 0,
        borderRadius: 999,
        fontSize: 11,
        lineHeight: '20px',
        paddingInline: 7,
        fontWeight: 600,
      }}
    >
      {label}
    </Tag>
  );
}

function getBuyBoxDisplayTag(record: StoreProduct): { label: string; style: React.CSSProperties } {
  const status = normalizeEnumValue(record.buyBoxStatus ?? record.buy_box_status);

  if (status === 'WON') {
    return { label: '购物车已抢到', style: LINK_TAG_STYLE_MAP.buyBoxWon };
  }

  if (status === 'LOST' || status === 'NO_ACTIVE_BUYBOX' || status === 'POSSIBLY_LOST') {
    return { label: '未获得购物车', style: LINK_TAG_STYLE_MAP.buyBoxLost };
  }

  return { label: '购物车未知', style: LINK_TAG_STYLE_MAP.default };
}

function renderLinkTypeTags(record: StoreProduct) {
  const tags: React.ReactNode[] = [];

  const linkType = normalizeEnumValue(record.linkType ?? record.link_type);
  const linkTypeLabel = getExplicitLabel(record.linkTypeLabel ?? record.link_type_label)
    ?? LINK_TYPE_LABEL_MAP[linkType as keyof typeof LINK_TYPE_LABEL_MAP]
    ?? null;
  if (linkTypeLabel) {
    tags.push(renderCompactInfoTag(linkTypeLabel, getLinkTypeTagStyle(linkType)));
  }

  const brand = resolveProductBrand(record);
  if (brand) {
    tags.push(renderCompactInfoTag(`品牌：${brand}`, LINK_TAG_STYLE_MAP.brand));
  }

  const buyBoxTag = getBuyBoxDisplayTag(record);
  tags.push(renderCompactInfoTag(buyBoxTag.label, buyBoxTag.style));

  if (tags.length === 0) return null;
  return tags;
}

function formatMetricValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'boolean') return value ? '是' : '否';
  return null;
}

function formatTargetStockDays(value: unknown): string {
  if (value == null || Number.isNaN(Number(value))) return '-';
  return `${Number(value)} 天`;
}

function formatDecimalDays(value: unknown): string {
  if (value == null || Number.isNaN(Number(value))) return '-';
  return `${Number(value).toFixed(1)} 天`;
}

function formatFirstAvailableAt(value: unknown): string {
  if (value == null) return '-';
  const text = String(value).trim();
  if (!text) return '-';
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : text;
}

function getPurchaseSuggestion(record: StoreProduct): PurchaseSuggestionData | null {
  return record.purchaseSuggestion ?? record.purchase_suggestion ?? null;
}

function getProductClassDisplay(
  record: StoreProduct,
): { classKey: string; color: string; label: string } | null {
  const rawProductClass = record.productClass ?? record.product_class ?? null;
  const classKey = typeof rawProductClass === 'string' ? rawProductClass.trim().toUpperCase() : '';
  if (!classKey) return null;

  const backendLabel = getExplicitLabel(record.productClassLabel ?? record.product_class_label);
  const classConfig = PRODUCT_CLASS_TAG_MAP[classKey as ProductClassTagValue];
  if (backendLabel) {
    return { classKey, color: classConfig?.color ?? 'default', label: backendLabel };
  }
  if (classConfig) {
    return { classKey, color: classConfig.color, label: classConfig.label };
  }
  return { classKey, color: 'default', label: '未知分类' };
}

function getNewProductStageLabel(record: StoreProduct): string | null {
  const suggestion = getPurchaseSuggestion(record);
  if (!suggestion) return null;
  return getExplicitLabel(suggestion.newProductStageLabel ?? suggestion.new_product_stage_label);
}

function getProductClassCount(summary: ClassificationSummary | null | undefined, value: ProductClass): number | undefined {
  if (!summary) return undefined;
  if (value === 'all') return typeof summary.total === 'number' ? summary.total : undefined;

  if (value === 'NEW') {
    return typeof summary.NEW === 'number' ? summary.NEW : 0;
  }

  const direct = summary[value];
  if (typeof direct === 'number') return direct;

  if (value === 'CLEARANCE') {
    const dead = typeof summary.DEAD === 'number' ? summary.DEAD : 0;
    const toBeEliminated = typeof summary.TO_BE_ELIMINATED === 'number' ? summary.TO_BE_ELIMINATED : 0;
    const legacyTotal = dead + toBeEliminated;
    return legacyTotal > 0 ? legacyTotal : undefined;
  }

  return undefined;
}

function getOperationActionLabel(action: unknown): string | undefined {
  if (isAdOperationAction(action != null ? String(action) : null)) return '调整广告';
  if (action == null) return undefined;
  const key = String(action).trim();
  if (!key) return undefined;
  return OPERATION_ACTION_LABEL_MAP[key as KnownOperationAction];
}

function getOperationActionShortLabel(action: unknown): string | undefined {
  if (isAdOperationAction(action != null ? String(action) : null)) return '调整广告';
  if (action == null) return undefined;
  const key = String(action).trim();
  if (!key) return undefined;
  return OPERATION_ACTION_SHORT_LABEL_MAP[key as KnownOperationAction];
}

function isValidOperationAdvice(item: unknown): item is OperationAdvice {
  if (!item || typeof item !== 'object') return false;
  const o = item as OperationAdvice;
  return Boolean(
    o.title?.trim()
    || (o.action != null && String(o.action).trim())
    || o.reason?.trim()
    || (o.priority != null && String(o.priority).trim()),
  );
}

function resolveOperationAdvices(record: StoreProduct): OperationAdvice[] {
  const arr = record.operationAdvices ?? record.operation_advices;
  if (Array.isArray(arr)) {
    return arr.filter(isValidOperationAdvice);
  }
  const single = record.operationAdvice ?? record.operation_advice ?? null;
  if (isValidOperationAdvice(single)) return [single];
  return [];
}

function normalizeOperationPriority(raw: unknown): OperationPriority | null {
  const p = String(raw ?? '').trim().toUpperCase();
  if (p === 'P0' || p === 'P1' || p === 'P2' || p === 'P3' || p === 'P4' || p === 'P5') {
    return p;
  }
  return null;
}

function compareOperationAdvice(a: OperationAdvice, b: OperationAdvice): number {
  const rank = (p: OperationPriority | null) => {
    if (p === 'P0') return 0;
    if (p === 'P1') return 1;
    if (p === 'P2') return 2;
    if (p === 'P3') return 3;
    if (p === 'P4') return 4;
    if (p === 'P5') return 5;
    return 99;
  };
  return rank(normalizeOperationPriority(a.priority)) - rank(normalizeOperationPriority(b.priority));
}

function getSortedOperationAdvices(record: StoreProduct): OperationAdvice[] {
  return resolveOperationAdvices(record).slice().sort(compareOperationAdvice);
}

function getOperationPriorityDisplay(priority: unknown): { label: string; style: React.CSSProperties } {
  const normalized = normalizeOperationPriority(priority);
  if (!normalized) {
    return {
      label: OPERATION_PRIORITY_UNKNOWN_STYLE.label,
      style: {
        color: OPERATION_PRIORITY_UNKNOWN_STYLE.color,
        background: OPERATION_PRIORITY_UNKNOWN_STYLE.background,
        borderColor: OPERATION_PRIORITY_UNKNOWN_STYLE.borderColor,
      },
    };
  }
  const entry = OPERATION_PRIORITY_STYLE_MAP[normalized];
  return {
    label: entry.label,
    style: { color: entry.color, background: entry.background, borderColor: entry.borderColor },
  };
}

function renderOperationPriorityTag(priority: unknown) {
  const { label, style } = getOperationPriorityDisplay(priority);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 11,
        lineHeight: '18px',
        height: 18,
        padding: '0 5px',
        borderRadius: 4,
        border: '1px solid',
        borderColor: style.borderColor ?? '#e2e8f0',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        ...style,
      }}
    >
      {label}
    </span>
  );
}

function getOperationAdviceLabels(operationAdvice: OperationAdvice): { fullLabel: string; shortLabel: string } {
  const action = operationAdvice.action;
  if (isAdOperationAction(action != null ? String(action) : null)) {
    return { fullLabel: '调整广告', shortLabel: '调整广告' };
  }

  const title = operationAdvice.title?.trim();
  const actionLabel = getOperationActionLabel(action);
  const shortActionLabel = getOperationActionShortLabel(action);
  const rawActionStr = action != null && String(action).trim() ? String(action).trim() : '';
  const fullLabel = title || actionLabel || rawActionStr || '未知动作';

  if (title?.includes('负毛利') && action === 'RAISE_PRICE') {
    return { fullLabel, shortLabel: '负毛利调价' };
  }

  if (title && title.length <= 6 && !/[，,。；;]/.test(title)) {
    return { fullLabel, shortLabel: title };
  }

  return {
    fullLabel,
    shortLabel: shortActionLabel || actionLabel || title || rawActionStr || '未知动作',
  };
}

function getOperationAdviceTags(operationAdvice: OperationAdvice): string[] {
  if (!Array.isArray(operationAdvice.tags)) return [];
  return operationAdvice.tags
    .filter((tag) => typeof tag === 'string' && tag.trim())
    .map((tag) => tag.trim());
}

function buildOperationAdviceMetricRows(
  operationAdvice: OperationAdvice,
  purchaseSuggestion?: PurchaseSuggestionData | null,
) {
  const metrics = operationAdvice.metrics && typeof operationAdvice.metrics === 'object'
    ? operationAdvice.metrics
    : null;
  if (!metrics) return [];
  return [
    { label: '产品分类', value: metrics.productClass ?? metrics.product_class },
    { label: '库存状态', value: metrics.stockStatus ?? metrics.stock_status },
    { label: '平台库存', value: metrics.platformStock ?? metrics.platform_stock },
    { label: '可售天数', value: metrics.stockDays ?? metrics.stock_days },
    { label: '近30天销量', value: metrics.sales30d ?? metrics.sales_30d },
    { label: '综合日销', value: metrics.comprehensiveSales ?? metrics.comprehensive_sales },
    { label: '建议采购量', value: metrics.suggestAmount ?? metrics.suggest_amount ?? purchaseSuggestion?.suggestAmount },
    { label: '预估毛利', value: metrics.estimatedProfit ?? metrics.estimated_profit },
    { label: '毛利率', value: metrics.profitMarginPct ?? metrics.profit_margin_pct },
    { label: '规则版本', value: metrics.ruleVersion ?? metrics.rule_version },
  ]
    .map((row) => ({ ...row, value: formatMetricValue(row.value) }))
    .filter((row) => row.value != null);
}

function renderOperationAdvicePopoverContent(
  advices: OperationAdvice[],
  purchaseSuggestion?: PurchaseSuggestionData | null,
) {
  return (
    <div style={{ minWidth: 280, maxWidth: 400, maxHeight: 360, overflowY: 'auto', fontSize: 13 }}>
      {advices.map((advice, index) => {
        const { fullLabel } = getOperationAdviceLabels(advice);
        const reason = advice.reason?.trim();
        const tags = getOperationAdviceTags(advice);
        const metricRows = buildOperationAdviceMetricRows(advice, purchaseSuggestion);
        return (
          <div
            key={`${fullLabel}-${index}`}
            style={{
              paddingBottom: index < advices.length - 1 ? 12 : 0,
              marginBottom: index < advices.length - 1 ? 12 : 0,
              borderBottom: index < advices.length - 1 ? '1px solid #f0f0f0' : undefined,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
              {renderOperationPriorityTag(advice.priority)}
              <span style={{ color: '#1e293b', fontWeight: 700 }}>{fullLabel}</span>
            </div>
            <div style={{ marginBottom: tags.length > 0 || metricRows.length > 0 ? 8 : 0 }}>
              <div style={{ color: '#64748b', marginBottom: 2 }}>原因</div>
              <div style={{ color: '#1e293b', lineHeight: 1.5 }}>{reason || '暂无详细原因'}</div>
            </div>
            {tags.length > 0 && (
              <div style={{ marginBottom: metricRows.length > 0 ? 8 : 0 }}>
                <div style={{ color: '#64748b', marginBottom: 4 }}>标签</div>
                <Space size={[4, 4]} wrap>
                  {tags.map((tag) => (
                    <Tag key={tag} style={{ margin: 0 }}>{tag}</Tag>
                  ))}
                </Space>
              </div>
            )}
            {metricRows.length > 0 && (
              <div>
                <div style={{ color: '#64748b', marginBottom: 4 }}>关键指标</div>
                {metricRows.map((row) => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, lineHeight: 1.8 }}>
                    <span style={{ color: '#64748b' }}>{row.label}</span>
                    <span style={{ color: '#1e293b', fontWeight: 500, textAlign: 'right' }}>{row.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OperationAdviceCell({ record }: { record: StoreProduct }) {
  const advices = getSortedOperationAdvices(record);
  if (advices.length === 0) {
    return <span style={{ color: '#94a3b8' }}>-</span>;
  }

  const visible = advices.slice(0, OPERATION_ADVICE_DISPLAY_LIMIT);
  const overflow = advices.length - visible.length;
  const purchaseSuggestion = record.purchaseSuggestion ?? record.purchase_suggestion ?? null;

  return (
    <Popover
      title="运营建议详情"
      content={renderOperationAdvicePopoverContent(advices, purchaseSuggestion)}
      placement="top"
    >
      <div
        style={{
          cursor: 'pointer',
          maxWidth: '100%',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 4,
          lineHeight: '20px',
        }}
      >
        {visible.map((advice, index) => {
          const { shortLabel } = getOperationAdviceLabels(advice);
          const normalized = normalizeOperationPriority(advice.priority);
          const isHighPriority = normalized === 'P0' || normalized === 'P1';
          return (
            <div
              key={`${shortLabel}-${index}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                maxWidth: '100%',
                minWidth: 0,
                lineHeight: '20px',
              }}
            >
              {renderOperationPriorityTag(advice.priority)}
              <span
                style={{
                  color: '#111827',
                  fontWeight: isHighPriority ? 700 : 600,
                  fontSize: 12,
                  lineHeight: '20px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 100,
                }}
              >
                {shortLabel}
              </span>
            </div>
          );
        })}
        {overflow > 0 && (
          <span style={{ color: '#64748b', fontSize: 12, fontWeight: 500, lineHeight: '18px' }}>
            +{overflow}
          </span>
        )}
      </div>
    </Popover>
  );
}

export default function PlatformProducts({ initialSearch, initialShopId }: PlatformProductsProps) {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [shops, setShops] = useState<{ id: number; shopName: string; platform: string; region?: string | null; site?: string | null }[]>([]);
  const [shopId, setShopId] = useState<number | null>(null);
  const [inventoryMap, setInventoryMap] = useState<Record<string, LocalInventoryMap>>({});
  const [currency, setCurrency] = useState<string>('');
  const [searchKeyword, setSearchKeyword] = useState(initialSearch ?? '');
  const [appliedKeyword, setAppliedKeyword] = useState(initialSearch ?? ''); // 实际已应用的搜索关键词
  const [productClass, setProductClass] = useState<ProductClass>('all');
  const [classificationSummary, setClassificationSummary] = useState<ClassificationSummary | null>(null);
  const [storeOverview, setStoreOverview] = useState<StoreOverview | null>(null);
  const [buyBoxGroup, setBuyBoxGroup] = useState<BuyBoxGroupFilter>('ALL');
  const [linkTypeFilter, setLinkTypeFilter] = useState<LinkTypeFilter>('ALL');
  const [stockGroup, setStockGroup] = useState<StockGroupFilter>('ALL');
  const buyBoxGroupRef = useRef<BuyBoxGroupFilter>('ALL');
  const linkTypeFilterRef = useRef<LinkTypeFilter>('ALL');
  const stockGroupRef = useRef<StockGroupFilter>('ALL');
  const [operationActionFilter, setOperationActionFilter] = useState<string | undefined>();
  const operationActionFilterRef = useRef<string | undefined>(undefined);
  const [operationActionStats, setOperationActionStats] = useState<OperationActionStat[]>([]);
  const [hasOperationActionStatsField, setHasOperationActionStatsField] = useState(false);
  buyBoxGroupRef.current = buyBoxGroup;
  linkTypeFilterRef.current = linkTypeFilter;
  stockGroupRef.current = stockGroup;
  operationActionFilterRef.current = operationActionFilter;
  // 关联状态筛选：'all' | 'mapped' | 'unmapped'
  const [mappingStatus, setMappingStatus] = useState<'all' | 'mapped' | 'unmapped'>('all');

  // 手动映射弹窗
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [mapTarget, setMapTarget] = useState<StoreProduct | null>(null);
  const [mapSearchKw, setMapSearchKw] = useState('');
  const [mapSearchResults, setMapSearchResults] = useState<InventoryItem[]>([]);
  const [mapSearchLoading, setMapSearchLoading] = useState(false);
  const [mapSelected, setMapSelected] = useState<InventoryItem | null>(null);
  const [mapSubmitting, setMapSubmitting] = useState(false);

  // 手动贴图地址弹窗
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pasteTarget, setPasteTarget] = useState<StoreProduct | null>(null);
  const [pasteUrl, setPasteUrl] = useState('');
  const [pasteSubmitting, setPasteSubmitting] = useState(false);

  // 同步链接
  const [syncUrlsLoading, setSyncUrlsLoading] = useState(false);
  const [syncProductsLoading, setSyncProductsLoading] = useState(false);
  const prevProductsCountRef = useRef(0);

  // 分页状态（受控，确保切换 pageSize 时联动刷新）
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [dedupeFilteredCount, setDedupeFilteredCount] = useState(0);
  // 服务端排序状态
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend' | null>(null);

  // 多选与采购计划
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [selectedRows,    setSelectedRows]    = useState<StoreProduct[]>([]);
  const [planModalOpen,   setPlanModalOpen]   = useState(false);
  // FBE 发货单弹窗
  const [fbeModalOpen,    setFbeModalOpen]    = useState(false);
  // 手动改价弹窗
  const [priceModalOpen,  setPriceModalOpen]  = useState(false);
  const [priceTarget,     setPriceTarget]     = useState<StoreProduct | null>(null);
  // 抢购物车只读预览弹窗
  const [grabCartPreviewOpen, setGrabCartPreviewOpen] = useState(false);
  const [grabCartTarget,      setGrabCartTarget]      = useState<StoreProduct | null>(null);
  // 调价日志弹窗
  const [priceActionLogOpen, setPriceActionLogOpen] = useState(false);
  const [priceActionLogTarget, setPriceActionLogTarget] = useState<StoreProduct | null>(null);
  // 抢购物车候选池弹窗
  const [grabCartBatchOpen, setGrabCartBatchOpen] = useState(false);
  const hasSelected = selectedRowKeys.length > 0;
  // 待刷新状态（后台有新数据时仅累加，不强制刷新，由用户手动触发）
  const [pendingUpdateCount, setPendingUpdateCount] = useState(0);

  const fetchInventory = useCallback(async () => {
    try {
      const { data: res } = await request.get<{ code: number; data?: { list?: { id?: number; sku?: string; imageUrl?: string; purchasePrice?: number; chineseName?: string }[] } }>(
        '/products/inventory',
        { params: { page: 1, pageSize: 2000 } },
      );
      if (res.code === 200 && Array.isArray(res.data?.list)) {
        const map: Record<string, LocalInventoryMap> = {};
        res.data.list.forEach((p) => {
          const sku = String(p.sku ?? '').trim().toUpperCase();
          if (sku && p.id != null) {
            map[sku] = {
              id:            p.id,
              imageUrl:      p.imageUrl ?? null,
              purchasePrice: p.purchasePrice ?? null,
              chineseName:   p.chineseName ?? null,
            };
          }
        });
        setInventoryMap(map);
      }
    } catch {
      // 静默失败，不影响平台产品展示
    }
  }, []);

  const fetchClassificationSummary = useCallback(async (sid: number | null) => {
    if (sid == null) {
      setClassificationSummary(null);
      return;
    }
    try {
      const { data: res } = await request.get<
        ClassificationSummary | { code?: number; data?: ClassificationSummary | null }
      >('/store-products/classification-summary', { params: { shopId: sid } });
      const payload = res && typeof res === 'object' && 'data' in res
        ? (res as { code?: number; data?: ClassificationSummary | null }).data
        : (res as ClassificationSummary);
      setClassificationSummary(payload && typeof payload === 'object' ? payload : null);
    } catch {
      setClassificationSummary(null);
    }
  }, []);

  const fetchStoreOverview = useCallback(async (sid: number | null) => {
    if (sid == null) {
      setStoreOverview(null);
      return;
    }
    try {
      const { data: res } = await request.get<
        StoreOverview | { code?: number; data?: StoreOverview | null }
      >('/store-products/store-overview', { params: { shopId: sid } });
      const payload = res && typeof res === 'object' && 'data' in res
        ? (res as { code?: number; data?: StoreOverview | null }).data
        : (res as StoreOverview);
      setStoreOverview(payload && typeof payload === 'object'
        ? {
          ...payload,
          productStructure: payload.productStructure ?? payload.product_structure ?? null,
          generatedAt: payload.generatedAt ?? payload.generated_at ?? null,
        }
        : null);
    } catch {
      setStoreOverview(null);
    }
  }, []);

  const fetchShops = useCallback(async () => {
    if (!localStorage.getItem('token')) return;
    try {
      const { data: res } = await request.get<{ code: number; data: { id: number; shopName: string; platform: string; region?: string | null; site?: string | null }[] }>('/shops');
      const list = Array.isArray(res?.data) ? res.data : [];
      setShops(list);
      if (list.length > 0) {
        // ★ 优先级：URL 传入的 shopId > localStorage 缓存 > 默认第一个店铺
        if (initialShopId && list.some((s) => s.id === initialShopId)) {
          setShopId(initialShopId);
        } else {
          const cached = localStorage.getItem('selectedShopId');
          const cachedId = cached ? parseInt(cached, 10) : NaN;
          const valid = list.some((s) => s.id === cachedId);
          setShopId(valid && !isNaN(cachedId) ? cachedId : list[0].id);
        }
      }
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status !== 401) message.error('加载店铺列表失败');
    }
  }, [initialShopId]);

  const fetchProducts = useCallback(async (sid: number | null, keyword?: string, opts?: FetchProductsOptions) => {
    if (sid == null) {
      setProducts([]);
      setTotalCount(0);
      setDedupeFilteredCount(0);
      setOperationActionStats([]);
      setHasOperationActionStatsField(false);
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) {
      message.warning('请先登录');
      return;
    }
    const p = opts?.page ?? 1;
    const ps = opts?.pageSize ?? 20;
    if (opts?.refreshSales) setProducts([]);
    setLoading(true);
    try {
      const params: Record<string, string | number> = { shopId: sid, page: p, pageSize: ps };
      const searchVal = typeof keyword === 'string' ? keyword.trim() : '';
      if (searchVal) params.search = searchVal;
      if (opts?.sortBy) params.sortBy = opts.sortBy;
      if (opts?.sortOrder) params.sortOrder = opts.sortOrder;
      if (opts?.mappingStatus && opts.mappingStatus !== 'all') params.mappingStatus = opts.mappingStatus;
      if (opts?.productClass && opts.productClass !== 'all') params.productClass = opts.productClass;
      const effectiveBuyBoxGroup = opts?.buyBoxGroup ?? buyBoxGroupRef.current;
      const effectiveLinkType = opts?.linkType ?? linkTypeFilterRef.current;
      const effectiveStockGroup = opts?.stockGroup ?? stockGroupRef.current;
      if (effectiveBuyBoxGroup !== 'ALL') params.buyBoxGroup = effectiveBuyBoxGroup;
      if (effectiveLinkType !== 'ALL') params.linkType = effectiveLinkType;
      if (effectiveStockGroup !== 'ALL') params.stockGroup = effectiveStockGroup;
      const effectiveOperationAction = opts && 'operationAction' in opts
        ? opts.operationAction
        : operationActionFilterRef.current;
      if (effectiveOperationAction) params.operationAction = effectiveOperationAction;
      if (opts?.refreshSales) params.refreshSales = 1;
      params._t = Date.now();
      const { data: res } = await request.get<{
        code: number;
        data?: StoreProduct[] | {
          list?: StoreProduct[];
          total?: number;
          totalCount?: number;
          currency?: string;
          operationActionStats?: OperationActionStat[] | null;
          operation_action_stats?: OperationActionStat[] | null;
        };
        currency?: string;
        operationActionStats?: OperationActionStat[] | null;
        operation_action_stats?: OperationActionStat[] | null;
      }>('/store-products', { params });
      if (res.code === 200) {
        const { stats, hasField } = resolveOperationActionStatsFromResponse(res);
        setOperationActionStats(stats);
        setHasOperationActionStatsField(hasField);
        const raw = res.data;
        const list = Array.isArray(raw)
          ? raw
          : (raw && typeof raw === 'object' && Array.isArray((raw as { list?: StoreProduct[] }).list))
            ? (raw as { list: StoreProduct[] }).list
            : [];
        const dataObj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as { total?: number; totalCount?: number; currency?: string } : null;
        const backendTotal = (typeof dataObj?.total === 'number' ? dataObj.total : typeof dataObj?.totalCount === 'number' ? dataObj.totalCount : 0) || 0;
        const deduped = dedupePlatformProductsByEan(list);
        setProducts(deduped.list);
        setTotalCount(backendTotal);
        setDedupeFilteredCount(deduped.filteredCount);
        prevProductsCountRef.current = deduped.list.length;
        const c = (res as { currency?: string }).currency ?? dataObj?.currency ?? (list[0] as StoreProduct | undefined)?.currency ?? '';
        setCurrency((c ?? '').trim() || '');
      } else {
        setProducts([]);
        setTotalCount(0);
        setDedupeFilteredCount(0);
        setOperationActionStats([]);
        setHasOperationActionStatsField(false);
      }
    } catch (err) {
      setProducts([]);
      setTotalCount(0);
      setDedupeFilteredCount(0);
      setOperationActionStats([]);
      setHasOperationActionStatsField(false);
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

  // 纠偏成功后的刷新回调，传给 ProfitBreakdownPopover
  const handleProfitCorrected = useCallback(() => {
    fetchProducts(shopId, appliedKeyword, {
      page,
      pageSize,
      sortBy,
      sortOrder,
      mappingStatus,
      productClass,
    });
  }, [fetchProducts, shopId, appliedKeyword, page, pageSize, sortBy, sortOrder, mappingStatus, productClass]);

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

  const openPasteModal = useCallback((product: StoreProduct) => {
    setPasteTarget(product);
    setPasteModalOpen(true);
    setPasteUrl('');
  }, []);

  const closePasteModal = useCallback(() => {
    setPasteModalOpen(false);
    setPasteTarget(null);
    setPasteUrl('');
  }, []);

  const openPriceChangeModal = useCallback((product: StoreProduct) => {
    setPriceTarget(product);
    setPriceModalOpen(true);
  }, []);

  const closePriceChangeModal = useCallback(() => {
    setPriceModalOpen(false);
    setPriceTarget(null);
  }, []);

  const openGrabCartPreviewModal = useCallback((product: StoreProduct) => {
    setGrabCartTarget(product);
    setGrabCartPreviewOpen(true);
  }, []);

  const closeGrabCartPreviewModal = useCallback(() => {
    setGrabCartPreviewOpen(false);
    setGrabCartTarget(null);
  }, []);

  const openPriceActionLogModal = useCallback((product: StoreProduct) => {
    setPriceActionLogTarget(product);
    setPriceActionLogOpen(true);
  }, []);

  const closePriceActionLogModal = useCallback(() => {
    setPriceActionLogOpen(false);
    setPriceActionLogTarget(null);
  }, []);

  const handleGrabCartSuccess = useCallback(() => {
    closeGrabCartPreviewModal();
    fetchProducts(shopId, appliedKeyword, {
      page,
      pageSize,
      sortBy,
      sortOrder,
      mappingStatus,
      productClass,
      buyBoxGroup,
      linkType: linkTypeFilter,
      stockGroup,
      operationAction: operationActionFilter,
    });
  }, [
    closeGrabCartPreviewModal,
    fetchProducts,
    shopId,
    appliedKeyword,
    page,
    pageSize,
    sortBy,
    sortOrder,
    mappingStatus,
    productClass,
    buyBoxGroup,
    linkTypeFilter,
    stockGroup,
    operationActionFilter,
  ]);

  const handlePriceChangeSuccess = useCallback(() => {
    closePriceChangeModal();
    fetchProducts(shopId, appliedKeyword, {
      page,
      pageSize,
      sortBy,
      sortOrder,
      mappingStatus,
      productClass,
      buyBoxGroup,
      linkType: linkTypeFilter,
      stockGroup,
      operationAction: operationActionFilter,
    });
  }, [
    closePriceChangeModal,
    fetchProducts,
    shopId,
    appliedKeyword,
    page,
    pageSize,
    sortBy,
    sortOrder,
    mappingStatus,
    productClass,
    buyBoxGroup,
    linkTypeFilter,
    stockGroup,
    operationActionFilter,
  ]);

  const handleSyncUrls = useCallback(async () => {
    if (!shopId) return;
    setSyncUrlsLoading(true);
    try {
      const { data: res } = await request.post<{ code: number; message?: string }>('/store-products/sync-urls', { shopId });
      if (res.code === 200) {
        setPendingUpdateCount(0);
        setPage(1);
        await fetchProducts(shopId, appliedKeyword, {
          page: 1,
          pageSize,
          sortBy,
          sortOrder,
          mappingStatus,
          productClass,
                });
        await fetchClassificationSummary(shopId);
        await fetchStoreOverview(shopId);
        message.success('同步成功');
      } else {
        message.error(res.message ?? '网络异常');
      }
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
      if (e.response?.status === 409) {
        message.error('当前店铺后台正在同步中，为防止数据冲突，请等待1-2分钟后再试。');
      } else {
        const errMsg = e.response?.data?.message || e.message || '网络异常';
        message.error(errMsg);
      }
    } finally {
      setSyncUrlsLoading(false);
    }
  }, [shopId, appliedKeyword, pageSize, sortBy, sortOrder, mappingStatus, productClass, fetchProducts, fetchClassificationSummary, fetchStoreOverview]);

  const handleSyncProducts = useCallback(async () => {
    const selectedShopIds = shopId != null ? [shopId] : [];
    if (!selectedShopIds.length) {
      message.warning('请先选择需要同步的店铺或站点');
      return;
    }
    setSyncProductsLoading(true);
    const hideLoading = message.loading('正在通过双引擎深度抓取平台数据及高清图片，预计需要 1-2 分钟，请耐心等待...', 0);
    try {
      const payload = selectedShopIds.length === 1
        ? { shopId: selectedShopIds[0], shopIds: selectedShopIds }
        : { shopIds: selectedShopIds };
      const { data: res } = await request.post<{ code: number; message?: string }>('/store-products/sync', payload, {
        timeout: 300000,
      });
      hideLoading();
      if (res.code === 200) {
        message.success('基础产品信息已拉取完毕！高清图片正在后台加速同步中，请稍后刷新页面查看。', 5);
      } else {
        message.error(res.message ?? '网络异常');
      }
    } catch (err: unknown) {
      hideLoading();
      const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
      if (e.response?.status === 409) {
        message.error('当前店铺后台正在同步中，为防止数据冲突，请等待1-2分钟后再试。');
      } else {
        const errMsg = e.response?.data?.message || e.message || '网络异常';
        message.error(errMsg);
      }
    } finally {
      setSyncProductsLoading(false);
      if (shopId) {
        setPendingUpdateCount(0);
        setPage(1);
        fetchProducts(shopId, appliedKeyword, {
          refreshSales: true,
          page: 1,
          pageSize,
          sortBy,
          sortOrder,
          mappingStatus,
          productClass,
                });
        fetchClassificationSummary(shopId);
        fetchStoreOverview(shopId);
      }
    }
  }, [shopId, appliedKeyword, pageSize, sortBy, sortOrder, mappingStatus, productClass, fetchProducts, fetchClassificationSummary, fetchStoreOverview]);

  const handlePasteSubmit = useCallback(async () => {
    if (!pasteTarget || !shopId) return;
    const url = pasteUrl.trim();
    if (!url) {
      message.warning('请输入图片地址');
      return;
    }
    const pnk = String(pasteTarget.pnk ?? pasteTarget.part_number_key ?? pasteTarget.partNumber ?? '').trim();
    if (!pnk) {
      message.error('产品 PNK 为空，无法保存');
      return;
    }
    setPasteSubmitting(true);
    try {
      const { data: res } = await request.post<{ code: number; message?: string }>('/store-products/set-image', {
        pnk,
        shopId,
        imageUrl: url,
      });
      if (res.code === 200) {
        message.success('图片已保存');
        closePasteModal();
        setPage(1);
        fetchProducts(shopId, appliedKeyword, {
          page: 1,
          pageSize,
          sortBy,
          sortOrder,
          mappingStatus,
          productClass,
                });
      } else {
        message.error(res.message ?? '保存失败');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg ?? '保存失败，请确认后端已支持 set-image 接口');
    } finally {
      setPasteSubmitting(false);
    }
  }, [pasteTarget, pasteUrl, shopId, appliedKeyword, pageSize, sortBy, sortOrder, mappingStatus, productClass, closePasteModal, fetchProducts]);

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

      // ── 严格校验业务状态码 ──────────────────────────────────────
      // 只有后端明确返回 code === 200 才视为成功。
      // 任何其他值（400 / 404 / 500 等）直接 early-return，弹窗保持打开，
      // 绝不执行 closeMapModal() 或刷新列表，防止"假绑定"现象。
      if (res.code !== 200) {
        message.error(res.message ?? '绑定失败，请稍后重试');
        return;
      }

      // ── 明确成功后才执行后续操作 ───────────────────────────────
      message.success(res.message ?? '绑定成功');
      closeMapModal();
      fetchInventory();
      setPage(1);
      fetchProducts(shopId, appliedKeyword, {
        page: 1,
        pageSize,
        sortBy,
        sortOrder,
        mappingStatus,
        productClass,
          });
    } catch (err: unknown) {
      // ── HTTP 层面 4xx/5xx 错误（Axios 抛出）────────────────────
      // 优先读后端 response body 的 message，兜底显示通用提示。
      // 此处绝对不调用 closeMapModal()，弹窗保持打开让用户重试。
      const axiosBody = (err as { response?: { data?: { message?: string } } })?.response?.data;
      const errMsg = axiosBody?.message ?? '绑定失败，请稍后重试';
      message.error(errMsg);
    } finally {
      setMapSubmitting(false);
    }
  }, [mapTarget, mapSelected, shopId, appliedKeyword, pageSize, sortBy, sortOrder, mappingStatus, productClass, closeMapModal, fetchInventory, fetchProducts]);

  useEffect(() => {
    fetchShops();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  useEffect(() => {
    fetchClassificationSummary(shopId);
  }, [shopId, fetchClassificationSummary]);

  useEffect(() => {
    fetchStoreOverview(shopId);
  }, [shopId, fetchStoreOverview]);

  useEffect(() => {
    setPendingUpdateCount(0);
    setPage(1);
    operationActionFilterRef.current = undefined;
    setOperationActionFilter(undefined);
    const kw = initialSearch?.trim();
    if (kw) {
      setSearchKeyword(kw);
      setAppliedKeyword(kw);
      fetchProducts(shopId, kw, {
        refreshSales: true,
        page: 1,
        pageSize,
        sortBy,
        sortOrder,
        mappingStatus,
        productClass,
          });
    } else {
      setSearchKeyword('');
      setAppliedKeyword('');
      fetchProducts(shopId, '', {
        refreshSales: true,
        page: 1,
        pageSize,
        sortBy,
        sortOrder,
        mappingStatus,
        productClass,
          });
    }
  }, [shopId, initialSearch, pageSize, sortBy, sortOrder, mappingStatus, productClass, fetchProducts]);

  // 定时轮询检测新产品，仅累加待刷新数量，不强制刷新（由用户手动触发）
  useEffect(() => {
    if (!shopId || loading) return;
    const timer = setInterval(async () => {
      try {
        const params: Record<string, string | number> = { shopId };
        if (appliedKeyword) params.search = appliedKeyword;
        if (mappingStatus !== 'all') params.mappingStatus = mappingStatus;
        if (productClass !== 'all') params.productClass = productClass;
        if (buyBoxGroup !== 'ALL') params.buyBoxGroup = buyBoxGroup;
        if (linkTypeFilter !== 'ALL') params.linkType = linkTypeFilter;
        if (stockGroup !== 'ALL') params.stockGroup = stockGroup;
        const { data: res } = await request.get<{ code: number; data?: StoreProduct[] | { list?: StoreProduct[] } }>('/store-products', { params });
        if (res.code === 200) {
          const raw = res.data;
          const list = Array.isArray(raw)
            ? raw
            : (raw && typeof raw === 'object' && Array.isArray((raw as { list?: StoreProduct[] }).list))
              ? (raw as { list: StoreProduct[] }).list
              : [];
          const newCount = list.length;
          const prev = prevProductsCountRef.current;
          if (prev > 0 && newCount > prev) {
            const diff = newCount - prev;
            setPendingUpdateCount((c) => c + diff);
          }
        }
      } catch {
        // 静默失败
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [shopId, appliedKeyword, mappingStatus, productClass, buyBoxGroup, linkTypeFilter, stockGroup, loading]);

  // 映射弹窗：搜索防抖
  useEffect(() => {
    if (!mapModalOpen) return;
    const t = setTimeout(() => fetchInventorySearch(mapSearchKw), 300);
    return () => clearTimeout(t);
  }, [mapModalOpen, mapSearchKw, fetchInventorySearch]);

  const handleRefreshFromPending = useCallback(() => {
    if (shopId == null) return;
    setPendingUpdateCount(0);
    setPage(1);
    fetchProducts(shopId, appliedKeyword, {
      page: 1,
      pageSize,
      sortBy,
      sortOrder,
      mappingStatus,
      productClass,
    });
  }, [shopId, appliedKeyword, pageSize, sortBy, sortOrder, mappingStatus, productClass, fetchProducts]);

  /** 顶部「刷新」与空态「刷新列表」共用：刷新库存字典 + 带 refreshSales 的平台产品列表 */
  const handleRefreshList = useCallback(() => {
    setPendingUpdateCount(0);
    fetchInventory();
    setPage(1);
    fetchProducts(shopId, appliedKeyword, {
      refreshSales: true,
      page: 1,
      pageSize,
      sortBy,
      sortOrder,
      mappingStatus,
      productClass,
    });
    fetchClassificationSummary(shopId);
    fetchStoreOverview(shopId);
  }, [shopId, appliedKeyword, pageSize, sortBy, sortOrder, mappingStatus, productClass, fetchProducts, fetchInventory, fetchClassificationSummary, fetchStoreOverview]);

  const handleProductStructureCardClick = useCallback((value: ProductClass) => {
    operationActionFilterRef.current = undefined;
    setOperationActionFilter(undefined);
    setProductClass(value);
    setPage(1);
    fetchProducts(shopId, appliedKeyword, {
      page: 1,
      pageSize,
      sortBy,
      sortOrder,
      mappingStatus,
      productClass: value,
      operationAction: undefined,
    });
  }, [shopId, appliedKeyword, pageSize, sortBy, sortOrder, mappingStatus, fetchProducts]);

  const handleOperationActionClick = useCallback((action: string) => {
    const next = operationActionFilter === action ? undefined : action;
    operationActionFilterRef.current = next;
    setOperationActionFilter(next);
    setPage(1);
    fetchProducts(shopId, appliedKeyword, {
      page: 1,
      pageSize,
      sortBy,
      sortOrder,
      mappingStatus,
      productClass,
      operationAction: next,
    });
  }, [operationActionFilter, shopId, appliedKeyword, pageSize, sortBy, sortOrder, mappingStatus, productClass, fetchProducts]);

  const handleClearOperationActionFilter = useCallback(() => {
    operationActionFilterRef.current = undefined;
    setOperationActionFilter(undefined);
    setPage(1);
    fetchProducts(shopId, appliedKeyword, {
      page: 1,
      pageSize,
      sortBy,
      sortOrder,
      mappingStatus,
      productClass,
      operationAction: undefined,
    });
  }, [shopId, appliedKeyword, pageSize, sortBy, sortOrder, mappingStatus, productClass, fetchProducts]);



  // ── 批量创建采购计划 ───────────────────────────────────────────
  const handleCreatePlan = useCallback(() => {
    // 拦截：直接检查行内后端返回的本地库存 ID，不依赖本地字典
    const unlinked = selectedRows.filter(
      (r) => !(r.local_product_id ?? r.localProductId),
    );
    if (unlinked.length > 0) {
      message.warning(`有 ${unlinked.length} 个产品未关联本地库存 SKU，无法创建采购计划。请先在"操作"列完成绑定。`);
      return;
    }
    setPlanModalOpen(true);
  }, [selectedRows]);

  // 将选中的平台产品转换为 RepeatPurchaseRow，直接从行数据取后端内联字段
  const planRows = useMemo<RepeatPurchaseRow[]>(() => {
    return selectedRows.map((r) => {
      const localId  = r.local_product_id ?? r.localProductId ?? 0;
      const linkedSku = String(r.mapped_inventory_sku ?? r.inventorySku ?? r.inventory_sku ?? '').trim() || null;
      // 图片：优先取本地库存图，兜底取平台图
      const imageUrl  = r.local_image ?? r.image ?? r.main_image ?? null;
      return {
        id:               localId,
        imageUrl,
        sku:              linkedSku,
        chineseName:      r.local_chinese_name ?? r.localChineseName ?? null,
        purchasePrice:    r.purchase_cost ?? r.purchaseCost ?? null,
        purchaseQuantity: 1,
      };
    });
  }, [selectedRows]);

  const handleTableChange = useCallback((pagination: { current?: number; pageSize?: number }, _filters: unknown, sorter: unknown) => {
    const newPage = pagination.current ?? 1;
    const newSize = pagination.pageSize ?? pageSize;
    const sizeChanged = newSize !== pageSize;
    const sorterObj = Array.isArray(sorter) ? (sorter as { field?: string | string[]; order?: string; columnKey?: string }[])[0] : (sorter as { field?: string | string[]; order?: string; columnKey?: string });
    // columnKey（列定义的 key 属性）优先于 dataIndex（field），确保 key:'stock' 能正确传给后端
    const rawField  = sorterObj?.field;
    const newSortBy = sorterObj?.columnKey != null
      ? String(sorterObj.columnKey)
      : rawField != null
        ? (Array.isArray(rawField) ? String(rawField[0]) : String(rawField))
        : null;
    const newSortOrder = (sorterObj?.order ?? null) as 'ascend' | 'descend' | null;
    setPage(sizeChanged ? 1 : newPage);
    setPageSize(newSize);
    setSortBy(newSortOrder ? newSortBy : null);
    setSortOrder(newSortOrder);
    const sortByParam = newSortOrder ? (newSortBy || 'comprehensive_sales') : undefined;
    const sortOrderParam = newSortOrder ?? undefined;
    if (shopId != null) {
      fetchProducts(shopId, appliedKeyword, {
        page: sizeChanged ? 1 : newPage,
        pageSize: newSize,
        sortBy: sortByParam,
        sortOrder: sortOrderParam,
        mappingStatus,
        productClass,
          });
    }
  }, [shopId, appliedKeyword, pageSize, mappingStatus, productClass, fetchProducts]);

  const columns: ColumnsType<StoreProduct> = useMemo(() => [
    {
      title: '图片',
      dataIndex: 'main_image',
      key: 'image',
      width: 90,
      align: 'center',
      fixed: 'left' as const,
      render: (_: unknown, r: StoreProduct) => {
        // 主图：后端已合并字段（平台图优先），依次回退兼容各字段命名
        const raw = r.image ?? r.main_image ?? r.mainImage ?? r.imageUrl ?? r.image_url ?? null;
        const url = raw && typeof raw === 'string' ? raw.trim() : null;
        // 本地备用图：传给 ProductImage，平台图 404/403 时自动降级使用
        const localUrl = r.local_image && typeof r.local_image === 'string' ? r.local_image.trim() : null;
        return <ProductImage url={url} localUrl={localUrl} />;
      },
    },
    {
      title: '产品名称',
      dataIndex: 'title',
      key: 'title',
      ellipsis: { showTitle: false },
      width: 280,
      fixed: 'left' as const,
      render: (_: unknown, r: StoreProduct) => {
        const name = r.title ?? r.name ?? r.product_name ?? r.productName ?? '';
        const partNumber = r.part_number ?? r.partNumber ?? '';
        const link = r.product_url ?? r.productUrl;
        const linkStr = link && typeof link === 'string' ? link.trim() : '';
        const titleContent = name || '-';
        const classDisplay = getProductClassDisplay(r);
        const reason = r.classificationReason ?? r.classification_reason ?? null;
        const newProductStageLabel = classDisplay?.classKey === 'NEW' ? getNewProductStageLabel(r) : null;
        const linkTypeTags = renderLinkTypeTags(r);
        return (
          <div>
            {linkStr ? (
              <Tooltip title={`点击跳转：${titleContent}`} placement="topLeft" mouseEnterDelay={0.4}>
                <a
                  href={linkStr}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    maxWidth: 260,
                    color: '#1890ff',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 500,
                    lineHeight: 1.5,
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; e.currentTarget.style.textUnderlineOffset = '3px'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; e.currentTarget.style.textUnderlineOffset = 'unset'; }}
                >
                  {titleContent}
                </a>
              </Tooltip>
            ) : (
              <Text strong ellipsis style={{ maxWidth: 260, display: 'block' }}>{titleContent}</Text>
            )}
            {partNumber && (
              <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>内部 PN：{partNumber}</div>
            )}
            {(classDisplay || linkTypeTags) && (
              <Space size={[4, 4]} wrap style={{ marginTop: 4 }}>
                {classDisplay ? (
                  <Tooltip title={reason || undefined}>
                    <Tag color={classDisplay.color} style={{ margin: 0, fontSize: 11 }}>
                      {classDisplay.label}
                    </Tag>
                  </Tooltip>
                ) : null}
                {newProductStageLabel ? (
                  <Tooltip title={newProductStageLabel}>
                    <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>
                      {newProductStageLabel}
                    </Tag>
                  </Tooltip>
                ) : null}
                {linkTypeTags}
              </Space>
            )}
          </div>
        );
      },
    },
    {
      title: '编码信息',
      key: 'codes',
      width: 300,
      align: 'left',
      render: (_: unknown, r: StoreProduct) => {
        // vendorSku：后端修正后的真实卖家 SKU，优先展示
        const vendorSku = String(r.vendorSku ?? r.vendor_sku ?? '').trim();
        // platformSku：eMAG 内部生成 ID，仅在 Tooltip 中展示，便于排查
        const platformSku = String(r.sku ?? '').trim();
        const displaySku = vendorSku || platformSku;
        const ean = String(r.ean ?? '').trim();
        const pnk = getPlatformProductPnk(r);
        const hiddenCount = r.__dedupeHiddenCount ?? 0;
        const hiddenPnks = r.__dedupeHiddenPnks ?? [];

        // 仅以后端明确返回的关联字段为准，去掉本地字典兜底，
        // 避免 SKU 名称相同但未实际绑定的行误亮"已关联"标签。
        const isMapped = !!(r.mapped_inventory_sku || r.inventorySku || r.inventory_sku);
        const codeStyle: React.CSSProperties = {
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
          fontSize: 13,
          fontWeight: 400,
          wordBreak: 'break-all',
        };
        const labelStyle: React.CSSProperties = {
          color: '#94a3b8',
          fontSize: 12,
          flexShrink: 0,
        };
        const rowStyle: React.CSSProperties = {
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flexWrap: 'wrap',
          lineHeight: 1.45,
        };

        return (
          <Space direction="vertical" size={3} style={{ width: '100%' }}>
            <div style={rowStyle}>
              <span style={labelStyle}>SKU：</span>
              <Tooltip
                title={vendorSku && platformSku && vendorSku !== platformSku
                  ? `平台内部 SKU：${platformSku}`
                  : undefined}
                placement="top"
              >
                <Text copyable={displaySku ? { text: displaySku } : undefined} style={codeStyle}>
                  {displaySku || '-'}
                </Text>
              </Tooltip>
              {isMapped && (
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
            </div>
            {vendorSku && platformSku && vendorSku !== platformSku && (
              <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', lineHeight: 1.3 }}>
                平台SKU：{platformSku}
              </div>
            )}
            <div style={rowStyle}>
              <span style={labelStyle}>EAN：</span>
              <Text copyable={ean ? { text: ean } : undefined} style={codeStyle}>
                {ean || '-'}
              </Text>
              {hiddenCount > 0 && (
                <Tooltip
                  title={hiddenPnks.length > 0
                    ? `该 EAN 包含多个历史 PNK：${hiddenPnks.join('、')}`
                    : `该 EAN 已自动隐藏 ${hiddenCount} 条冗余历史记录`}
                >
                  <Tag color="default" style={{ margin: 0, fontSize: 11 }}>
                    历史 PNK ×{hiddenCount}
                  </Tag>
                </Tooltip>
              )}
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>PNK：</span>
              <Text copyable={pnk ? { text: pnk } : undefined} style={codeStyle}>
                {pnk || '-'}
              </Text>
            </div>
          </Space>
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
      title: '综合日销',
      key: 'comprehensive_sales',
      dataIndex: 'comprehensive_sales',
      width: 100,
      align: 'center',
      sorter: true,
      sortOrder: sortBy === 'comprehensive_sales' ? sortOrder : undefined,
      render: (_: unknown, r: StoreProduct) => {
        const val = r.comprehensive_sales;
        const num = typeof val === 'number' && !Number.isNaN(val) ? val : 0;
        return <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace', fontSize: 14 }}>{num.toFixed(2)}</span>;
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
        const c = r.currency ?? '';
        const disabledReason = getPriceActionDisabledReason(r);
        const grabCartDisabledReason = getGrabCartPreviewDisabledReason(r);
        let priceText = '—';
        if (v != null) {
          const num = Number(v).toFixed(2);
          const suffix = (c ?? '').trim();
          priceText = suffix ? `${num} ${suffix}` : num;
        }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, lineHeight: 1.3 }}>
            <span>{priceText}</span>
            <Tooltip title={disabledReason || undefined}>
              <Button
                size="small"
                type="link"
                disabled={!!disabledReason}
                onClick={() => openPriceChangeModal(r)}
                style={{ padding: 0, height: 20, fontSize: 12 }}
              >
                改价
              </Button>
            </Tooltip>
            <Tooltip title={grabCartDisabledReason || undefined}>
              <Button
                size="small"
                type="link"
                disabled={!!grabCartDisabledReason}
                onClick={() => openGrabCartPreviewModal(r)}
                style={{ padding: 0, height: 20, fontSize: 12 }}
              >
                手动抢车
              </Button>
            </Tooltip>
            <Button
              size="small"
              type="link"
              onClick={() => openPriceActionLogModal(r)}
              style={{ padding: 0, height: 20, fontSize: 12 }}
            >
              调价日志
            </Button>
          </div>
        );
      },
    },
    {
      title: '预估毛利',
      key: 'profit',
      width: 150,
      align: 'center',
      render: (_: unknown, r: StoreProduct) => {
        // ── 显式萃取所有字段，避免字段名映射在子组件内隐式降级 ──
        const skuKey       = String(r.sku ?? '').trim().toUpperCase();
        const purchaseCost = inventoryMap[skuKey]?.purchasePrice ?? null;
        // profit_breakdown 是后端返回的 snake_case 键名
        const breakdown    = r.profit_breakdown ?? r.profitBreakdown ?? null;
        // estimated_profit 是后端新引擎的 snake_case 字段；estimatedProfitLocal 为旧字段名兼容
        const profitLocal  = r.estimatedProfitLocal ?? r.estimated_profit ?? null;
        // CNY 毛利：优先从 breakdown 内读，其次读顶层字段
        const profitCny    = breakdown?.profitCny ?? r.estimatedProfitCny ?? null;
        // 毛利率：优先 breakdown，其次顶层（兼容 snake_case）
        const marginPct    = breakdown?.profitMarginPct ?? r.profitMarginPct ?? r.profit_margin_pct ?? null;
        const price        = r.price ?? r.sale_price ?? r.salePrice ?? null;
        return (
          <ProfitBreakdownPopover
            pnk={r.pnk ?? r.part_number_key ?? ''}
            breakdown={breakdown}
            profitLocal={profitLocal}
            profitCny={profitCny}
            marginPct={marginPct}
            price={price}
            currency={currency}
            purchaseCost={purchaseCost}
            onCorrectionDone={handleProfitCorrected}
          />
        );
      },
    },
    {
      title: '平台库存',
      dataIndex: 'platformStock',
      key: 'stock',          // 与后端 sortBy=stock 参数对齐
      width: 100,
      align: 'center',
      sorter: true,
      sortOrder: sortBy === 'stock' ? sortOrder : undefined,
      render: (_: unknown, r: StoreProduct) => {
        const v = r.platformStock ?? r.platform_stock ?? r.stock;
        const rawStockStatus = r.stockStatus ?? r.stock_status ?? null;
        const stockStatusKey = typeof rawStockStatus === 'string' ? rawStockStatus.trim().toUpperCase() : '';
        const stockStatusConfig = STOCK_STATUS_TAG_MAP[stockStatusKey as StockStatusValue];
        const stockDaysRaw = r.stockDays ?? r.stock_days ?? null;
        const stockDays = stockDaysRaw != null && !Number.isNaN(Number(stockDaysRaw)) ? Number(stockDaysRaw) : null;
        const dailySalesRaw = r.stockDailySales ?? r.stock_daily_sales ?? r.comprehensive_sales ?? r.purchaseSuggestion?.dailySales ?? null;
        const dailySales = dailySalesRaw != null && !Number.isNaN(Number(dailySalesRaw)) ? Number(dailySalesRaw) : null;
        const stockStatusTag = stockStatusConfig ? (
          <Tag color={stockStatusConfig.color} style={{ margin: 0, fontSize: 11 }}>
            {stockStatusConfig.label}
          </Tag>
        ) : null;
        const tooltip = stockDays != null ? (
          <div>
            <div>预计可售天数：{stockDays.toFixed(1)} 天</div>
            <div>参考日销：{dailySales != null ? dailySales.toFixed(2) : '-'} 单/天</div>
          </div>
        ) : null;
        return (
          <Space direction="vertical" size={2} align="center">
            <span>{v != null ? v : '-'}</span>
            {tooltip && stockStatusTag ? (
              <Tooltip title={tooltip}>{stockStatusTag}</Tooltip>
            ) : stockStatusTag}
          </Space>
        );
      },
    },
    {
      title: (
        <span>
          在途库存
          <Tooltip title="在途库存：当前平台产品维度的 FBE 已发货未入仓数量；eMAG平台量用于对账">
            <InfoCircleOutlined style={{ marginLeft: 4, color: '#94a3b8', fontSize: 12, cursor: 'help' }} />
          </Tooltip>
        </span>
      ),
      dataIndex: 'inTransitQuantity',
      key: 'inTransitQuantity',
      width: 130,
      align: 'center',
      render: (_: unknown, r: StoreProduct) => {
        const erp      = r.inTransitQuantity ?? r.in_transit_quantity ?? 0;
        const platform = r.stockInTransit    ?? r.stock_in_transit    ?? null;

        // 两者均为 0 / null
        if (!erp && !platform) return <span style={{ color: '#94a3b8' }}>-</span>;

        // 差异判断：均有值且不相等
        const hasDiff = erp > 0 && platform !== null && platform !== erp;

        return (
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            {/* ERP 主数据 */}
            <Tooltip title={`当前平台产品维度的 FBE 已发货未入仓数量：${erp} 件`}>
              <span style={{
                color: erp > 0 ? '#2563eb' : '#94a3b8',
                fontWeight: 700,
                fontSize: 14,
                fontFeatureSettings: '"tnum"',
                lineHeight: 1.2,
                cursor: 'default',
              }}>
                🚚 {erp}
              </span>
            </Tooltip>
            {/* eMAG 平台辅助数据（有值才显示） */}
            {platform !== null && (
              <Tooltip title={`eMAG 平台识别在途：${platform} 件${hasDiff ? '（与ERP存在差异，请核查）' : ''}`}>
                <span style={{
                  fontSize: 11,
                  color: hasDiff ? '#f59e0b' : '#94a3b8',
                  fontFeatureSettings: '"tnum"',
                  lineHeight: 1,
                  cursor: 'default',
                }}>
                  平台: {platform}{hasDiff ? ' ⚠️' : ''}
                </span>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: '建议采购量',
      key: 'purchaseSuggestion',
      width: 120,
      align: 'center',
      fixed: 'right' as const,
      render: (_: unknown, r: StoreProduct) => {
        const suggestion = getPurchaseSuggestion(r);
        const rawSuggestAmount = suggestion?.suggestAmount;
        const suggestAmount = rawSuggestAmount != null && !Number.isNaN(Number(rawSuggestAmount))
          ? Number(rawSuggestAmount)
          : null;
        const displayAmount = suggestAmount != null && suggestAmount > 0 ? suggestAmount : null;
        if (!suggestion) return <span style={{ color: '#94a3b8' }}>-</span>;

        const suggestionText = (suggestion.text ?? suggestion.label ?? '').trim();
        const suggestionReason = (suggestion.reason ?? '').trim();
        const formatValue = (value: number | null | undefined) => (
          value != null && !Number.isNaN(Number(value)) ? Number(value) : null
        );
        const stockDetailRows = [
          { label: '目标库存', value: formatValue(suggestion.targetStock) },
          { label: '平台库存', value: formatValue(suggestion.platformStock) },
          { label: '平台在途', value: formatValue(suggestion.platformInTransit ?? r.in_transit_quantity ?? null) },
          { label: '本地库存', value: formatValue(suggestion.localStock) },
          { label: '采购在途', value: formatValue(suggestion.purchasingInTransit ?? suggestion.purchasingStock) },
          { label: '计划中', value: formatValue(suggestion.planningStock) },
        ].filter((row) => row.value != null);
        const coverageDetailRows = [
          { label: '目标库存天数', value: formatTargetStockDays(suggestion.targetStockDays ?? suggestion.target_stock_days) },
          { label: '平台可售天数', value: formatDecimalDays(suggestion.platformStockDays ?? suggestion.platform_stock_days) },
          { label: '总覆盖天数', value: formatDecimalDays(suggestion.totalCoverageDays ?? suggestion.total_coverage_days) },
          { label: '新品阶段', value: getExplicitLabel(suggestion.newProductStageLabel ?? suggestion.new_product_stage_label) ?? '-' },
          { label: '首次可售时间', value: formatFirstAvailableAt(suggestion.firstAvailableAt ?? suggestion.first_available_at) },
        ];
        const detailRows = [
          ...stockDetailRows,
          ...coverageDetailRows,
          { label: '建议采购', value: displayAmount ?? 0, strong: true },
        ];

        const content = (
          <div style={{ minWidth: 260, fontSize: 13 }}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: '#64748b' }}>采购建议</div>
              <div style={{ color: '#1e293b', fontWeight: 600 }}>
                {suggestionText || (displayAmount ? `建议采购 ${displayAmount}` : '暂无采购建议')}
              </div>
            </div>
            {suggestionReason && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ color: '#64748b' }}>原因</div>
                <div style={{ color: '#1e293b', lineHeight: 1.5 }}>{suggestionReason}</div>
              </div>
            )}
            <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
              {detailRows.map((row) => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, lineHeight: 1.8 }}>
                  <span style={{ color: row.strong ? '#1e293b' : '#64748b', fontWeight: row.strong ? 700 : 400 }}>
                    {row.label}
                  </span>
                  <span style={{ color: row.strong ? '#2563eb' : '#1e293b', fontWeight: row.strong ? 700 : 500, fontFeatureSettings: '"tnum"' }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );

        return (
          <Popover title="采购建议详情" content={content} placement="top">
            {displayAmount != null ? (
              <span style={{ color: '#2563eb', cursor: 'pointer', fontWeight: 700, fontFeatureSettings: '"tnum"' }}>
                {displayAmount}
              </span>
            ) : (
              <span style={{ color: '#94a3b8', cursor: 'pointer' }}>-</span>
            )}
          </Popover>
        );
      },
    },
    {
      title: '运营建议',
      key: 'operationAdvice',
      width: 190,
      align: 'center',
      fixed: 'right' as const,
      render: (_: unknown, r: StoreProduct) => <OperationAdviceCell record={r} />,
    },
  ], [inventoryMap, currency, shopId, appliedKeyword, fetchProducts, openMapModal, openPasteModal, sortBy, sortOrder, handleProfitCorrected, openPriceChangeModal, openGrabCartPreviewModal, openPriceActionLogModal]);

  /** 纯数字且不足 13 位时提示（EAN 通常为 13 位，含前导零场景由后端统一） */
  const searchEanHint = useMemo(() => {
    const t = searchKeyword.trim();
    if (!t || !/^\d+$/.test(t)) return null;
    if (t.length >= 13) return null;
    return '正在尝试匹配相似编码';
  }, [searchKeyword]);

  /** 有搜索词且无数据时：引导刷新列表 / 拉取平台产品 */
  const tableEmptyText = useMemo(() => {
    if (!shopId) {
      return <Empty description="请先选择店铺" style={{ padding: 48 }} />;
    }
    const kw = appliedKeyword.trim();
    if (kw) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div style={{ maxWidth: 400, margin: '0 auto' }}>
              <div style={{ marginBottom: 8 }}>未找到与「{kw}」相关的产品</div>
              <div style={{ color: '#94a3b8', fontSize: 13 }}>
                若数据尚未同步，可先刷新列表或拉取平台产品，更新当前店铺数据。
              </div>
            </div>
          }
          extra={
            <Space wrap>
              <Button type="primary" icon={<ReloadOutlined />} onClick={handleRefreshList} loading={loading}>
                刷新列表
              </Button>
              <Button
                icon={<DownloadOutlined />}
                onClick={handleSyncProducts}
                loading={syncProductsLoading}
                disabled={!shopId}
              >
                拉取平台产品
              </Button>
            </Space>
          }
          style={{ padding: 48 }}
        />
      );
    }
    return <Empty description="暂无平台产品" style={{ padding: 48 }} />;
  }, [shopId, appliedKeyword, handleRefreshList, handleSyncProducts, loading, syncProductsLoading]);

  const productStructureSummary = storeOverview?.productStructure ?? classificationSummary;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
            <AppstoreOutlined style={{ color: '#2563eb' }} /> 平台产品
          </h2>
        </div>
        <Space>
          <Space size="small">
            <span className="text-sm text-gray-500">店铺：</span>
            <Select
              placeholder="选择店铺"
              value={shopId ?? undefined}
              onChange={(v) => setShopId(v ?? null)}
              options={shops.map((s) => {
                const region = s.region ?? s.site;
                return {
                  label: region ? `${s.shopName} (${s.platform} · ${region})` : `${s.shopName} (${s.platform})`,
                  value: s.id,
                };
              })}
              style={{ minWidth: 200 }}
            />
          </Space>
            <Button icon={<ReloadOutlined />} onClick={handleRefreshList} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* 批量处理 Dropdown */}
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              {
                key: 'plan',
                icon: <FileTextOutlined />,
                label: '📝 创建采购计划',
                onClick: handleCreatePlan,
              },
              {
                key: 'fbe',
                icon: <span>📦</span>,
                label: '📦 创建 FBE 发货单',
                onClick: () => {
                  if (selectedRows.length === 0) { message.warning('请先勾选需要发货的产品'); return; }
                  setFbeModalOpen(true);
                },
              },
            ] satisfies MenuProps['items'],
          }}
        >
          <Button icon={<ToolOutlined />} disabled={!hasSelected}>
            🛠️ 批量处理{hasSelected ? ` (${selectedRowKeys.length})` : ''} <DownOutlined />
          </Button>
        </Dropdown>

        {/* 店铺操作 Dropdown */}
        <Dropdown
          trigger={['click']}
          disabled={!shopId}
          menu={{
            items: [
              {
                key: 'syncUrls',
                icon: <LinkOutlined />,
                label: '🔗 同步链接',
                onClick: handleSyncUrls,
              },
              {
                key: 'pullProducts',
                icon: <DownloadOutlined />,
                label: '⬇️ 拉取平台产品',
                onClick: handleSyncProducts,
              },
            ] satisfies MenuProps['items'],
          }}
        >
          <Button icon={<SettingOutlined />} loading={syncUrlsLoading || syncProductsLoading} disabled={!shopId}>
            ⚙️ 店铺操作 <DownOutlined />
          </Button>
        </Dropdown>
        <Tooltip title="V1 仅开放单品手动抢车，暂不展示批量真实抢车入口">
          <Button
            icon={<ToolOutlined />}
            disabled
            onClick={() => setGrabCartBatchOpen(true)}
          >
            抢车候选池
          </Button>
        </Tooltip>
        <Select<BuyBoxGroupFilter>
          value={buyBoxGroup}
          onChange={(val) => {
            setBuyBoxGroup(val);
            setPage(1);
            fetchProducts(shopId, appliedKeyword, {
              page: 1,
              pageSize,
              sortBy,
              sortOrder,
              mappingStatus,
              productClass,
              buyBoxGroup: val,
              linkType: linkTypeFilter,
              stockGroup,
            });
          }}
          style={{ width: 120 }}
          labelRender={renderFilterEntryLabel('购物车状态')}
          options={BUY_BOX_FILTER_OPTIONS}
        />
        <Select<LinkTypeFilter>
          value={linkTypeFilter}
          onChange={(val) => {
            setLinkTypeFilter(val);
            setPage(1);
            fetchProducts(shopId, appliedKeyword, {
              page: 1,
              pageSize,
              sortBy,
              sortOrder,
              mappingStatus,
              productClass,
              buyBoxGroup,
              linkType: val,
              stockGroup,
            });
          }}
          style={{ width: 110 }}
          labelRender={renderFilterEntryLabel('链接属性')}
          options={LINK_TYPE_FILTER_OPTIONS}
        />
        <Select<StockGroupFilter>
          value={stockGroup}
          onChange={(val) => {
            setStockGroup(val);
            setPage(1);
            fetchProducts(shopId, appliedKeyword, {
              page: 1,
              pageSize,
              sortBy,
              sortOrder,
              mappingStatus,
              productClass,
              buyBoxGroup,
              linkType: linkTypeFilter,
              stockGroup: val,
            });
          }}
          style={{ width: 120 }}
          labelRender={renderFilterEntryLabel('库存状态')}
          options={STOCK_GROUP_FILTER_OPTIONS}
        />
        <Select
          value={mappingStatus}
          onChange={(val: 'all' | 'mapped' | 'unmapped') => {
            setMappingStatus(val);
            setPage(1);
            fetchProducts(shopId, appliedKeyword, {
              page: 1,
              pageSize,
              sortBy,
              sortOrder,
              mappingStatus: val,
              productClass,
              buyBoxGroup,
              linkType: linkTypeFilter,
              stockGroup,
            });
          }}
          style={{ width: 120 }}
          options={[
            { value: 'all',      label: '关联状态' },
            { value: 'mapped',   label: '✅ 已关联' },
            { value: 'unmapped', label: '⭕ 未关联' },
          ]}
        />
        <Input
          placeholder="输入 SKU / EAN / PNK 码搜索..."
          prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
          value={searchKeyword}
          onChange={(e) => {
            const next = e.target.value;
            setSearchKeyword(next);
            // 点击清空（X）或手动删光：同步清空已应用关键词并拉全量列表，避免列表仍停留在上次搜索结果
            if (next !== '') return;
            setAppliedKeyword('');
            setPage(1);
            if (shopId != null) {
              fetchProducts(shopId, '', {
                page: 1,
                pageSize,
                sortBy,
                sortOrder,
                mappingStatus,
                productClass,
                                  });
            }
          }}
          onPressEnter={() => {
            if (shopId == null) {
              message.warning('请先选择店铺');
              return;
            }
            setAppliedKeyword(searchKeyword);
            setPage(1);
            fetchProducts(shopId, searchKeyword, {
              page: 1,
              pageSize,
              sortBy,
              sortOrder,
              mappingStatus,
              productClass,
                            });
          }}
          allowClear
          style={{ width: 260 }}
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
            setPage(1);
            fetchProducts(shopId, searchKeyword, {
              page: 1,
              pageSize,
              sortBy,
              sortOrder,
              mappingStatus,
              productClass,
                            });
          }}
          loading={loading}
        >
          搜索
        </Button>
        <Button
          onClick={() => {
            setProductClass('all');
            setBuyBoxGroup('ALL');
            setLinkTypeFilter('ALL');
            setStockGroup('ALL');
            setMappingStatus('all');
            operationActionFilterRef.current = undefined;
            setOperationActionFilter(undefined);
            setSearchKeyword('');
            setAppliedKeyword('');
            setPage(1);
            fetchProducts(shopId, '', {
              page: 1,
              pageSize,
              sortBy,
              sortOrder,
              mappingStatus: 'all',
              productClass: 'all',
              buyBoxGroup: 'ALL',
              linkType: 'ALL',
              stockGroup: 'ALL',
              operationAction: undefined,
            });
            fetchClassificationSummary(shopId);
            fetchStoreOverview(shopId);
          }}
          loading={loading}
        >
          重置
        </Button>
      </div>
      {searchEanHint && (
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            <InfoCircleOutlined style={{ marginRight: 6, color: '#94a3b8' }} />
            {searchEanHint}
          </Text>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ fontWeight: 600, color: '#1e293b' }}>店铺结构概览</span>
          <span style={{ color: '#cbd5e1', fontSize: 12 }}>｜</span>
          <span style={{ color: '#94a3b8', fontSize: 12 }}>点击产品结构卡片可快速筛选对应产品</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 620px', minWidth: 0, maxWidth: '100%' }}>
            {renderOverviewCards<ProductClass>({
              cards: PRODUCT_STRUCTURE_CARDS,
              getCount: (value) => getProductClassCount(productStructureSummary, value),
              activeValue: productClass,
              onCardClick: handleProductStructureCardClick,
            })}
          </div>
          {renderProductClassActionTips({
            productClass,
            actionStats: operationActionStats,
            hasOperationActionStatsField,
            selectedAction: operationActionFilter,
            onActionClick: handleOperationActionClick,
            onClearActionFilter: handleClearOperationActionFilter,
          })}
        </div>
      </div>

      {pendingUpdateCount > 0 && (
        <Alert
          type="info"
          showIcon
          message={`后台已同步了 ${pendingUpdateCount} 个新产品（或数据有更新）`}
          action={
            <Button type="primary" size="small" onClick={handleRefreshFromPending}>
              👉 点击刷新列表
            </Button>
          }
          style={{ marginBottom: 16, borderRadius: 8 }}
        />
      )}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0' }}>
        <Table<StoreProduct>
          dataSource={products}
          columns={columns}
          rowKey="id"
          loading={loading}
          onChange={handleTableChange}
          scroll={{ x: 'max-content', y: 'calc(100vh - 340px)' }}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys, rows) => { setSelectedRowKeys(keys); setSelectedRows(rows); },
            preserveSelectedRowKeys: true,
          }}
          pagination={{
            current: page,
            pageSize,
            total: totalCount,
            showSizeChanger: true,
            showTotal: (total) => dedupeFilteredCount > 0
              ? `共 ${total} 条（本页已自动过滤 ${dedupeFilteredCount} 条冗余历史记录）`
              : `共 ${total} 条`,
          }}
          locale={{ emptyText: tableEmptyText }}
        />
      </div>

      {/* 批量创建采购计划弹窗 */}
      <RepeatPurchaseModal
        open={planModalOpen}
        rows={planRows}
        shopId={shopId}
        onCancel={() => setPlanModalOpen(false)}
        onSuccess={() => { setPlanModalOpen(false); setSelectedRowKeys([]); setSelectedRows([]); }}
      />

      {/* FBE 发货单弹窗 */}
      <CreateFbeShipmentModal
        open={fbeModalOpen}
        shopId={shopId}
        products={selectedRows}
        onCancel={() => setFbeModalOpen(false)}
        onSuccess={() => { setFbeModalOpen(false); setSelectedRowKeys([]); setSelectedRows([]); }}
      />

      {/* 手动改价弹窗 */}
      <PlatformProductPriceChangeModal
        open={priceModalOpen}
        product={priceTarget}
        currentShopId={shopId}
        onCancel={closePriceChangeModal}
        onSuccess={handlePriceChangeSuccess}
      />

      {/* 抢购物车只读预览弹窗 */}
      <PlatformProductGrabCartPreviewModal
        open={grabCartPreviewOpen}
        product={grabCartTarget}
        currentShopId={shopId}
        onCancel={closeGrabCartPreviewModal}
        onSuccess={handleGrabCartSuccess}
      />

      {/* 调价日志弹窗 */}
      <PlatformProductPriceActionLogModal
        open={priceActionLogOpen}
        product={priceActionLogTarget}
        currentShopId={shopId}
        onCancel={closePriceActionLogModal}
      />

      {/* 抢购物车候选池批量确认弹窗 */}
      <PlatformProductGrabCartBatchModal
        open={grabCartBatchOpen}
        shopId={shopId}
        currency={currency}
        onCancel={() => setGrabCartBatchOpen(false)}
      />

      {/* 手动贴图地址弹窗 */}
      <Modal
        title="贴图片地址"
        open={pasteModalOpen}
        onCancel={closePasteModal}
        footer={[
          <Button key="cancel" onClick={closePasteModal}>取消</Button>,
          <Button key="submit" type="primary" loading={pasteSubmitting} onClick={handlePasteSubmit}>
            保存
          </Button>,
        ]}
        width={420}
        destroyOnClose
      >
        {pasteTarget && (
          <div style={{ marginBottom: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 13, color: '#64748b' }}>
            产品：{String(pasteTarget.title ?? pasteTarget.name ?? pasteTarget.product_name ?? '').trim() || '—'}（PNK: {String(pasteTarget.pnk ?? '').trim() || '—'}）
          </div>
        )}
        <Input.TextArea
          placeholder="粘贴官网图片地址（如 https://...）"
          value={pasteUrl}
          onChange={(e) => setPasteUrl(e.target.value)}
          rows={3}
          style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
        />
      </Modal>

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
                        <img src={url} alt="" referrerPolicy="no-referrer" style={{ width: 48, height: 48, objectFit: 'contain' }} />
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

