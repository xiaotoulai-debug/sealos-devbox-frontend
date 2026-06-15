import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Table, Button, Tag, Space, Typography, Drawer, message, Modal,
  Tooltip, Empty, Input, Spin, Tabs, Badge, notification, InputNumber,
  Select, Form, Alert, Image, Popconfirm,
} from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import {
  ReloadOutlined, EyeOutlined, InboxOutlined,
  ExclamationCircleFilled, SendOutlined, CloseCircleOutlined,
  WarningOutlined, ClockCircleOutlined, SyncOutlined, StopOutlined,
  PlusOutlined, DollarOutlined,
} from '@ant-design/icons';
import request from '../lib/request';
import { isSuperAdminUser } from '../lib/auth';

const { Text } = Typography;
const { confirm } = Modal;

/** 金额格式化：¥1,234.56；空值返回 '-' */
function fmtMoney(v: number | null | undefined): string {
  if (v == null) return '-';
  return `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── 类型 ────────────────────────────────────────────────────────
interface WarehouseStockEntry {
  warehouseId:    number;
  warehouseName:  string;
  stockQuantity:  number;
  lockedQuantity?: number | null;
}

interface Warehouse {
  id:     number;
  name:   string;
  status: string;
}

interface FbeShipmentItemProduct {
  sku?: string | null;
  platformSku?: string | null;
  vendorSku?: string | null;
  vendor_sku?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  image?: string | null;
  images?: (string | { url?: string; image?: string } | null)[] | null;
  ean?: string | null;
  EAN?: string | null;
  barcode?: string | null;
  pnk?: string | null;
  PNK?: string | null;
  part_number_key?: string | null;
  emagOfferId?: string | null;
  offerId?: string | null;
  productUrl?: string | null;
  product_url?: string | null;
  platformProductUrl?: string | null;
  platform_product_url?: string | null;
  linkType?: string | null;
  link_type?: string | null;
  linkTypeLabel?: string | null;
  link_type_label?: string | null;
  emagLinkType?: string | null;
  emag_link_type?: string | null;
  brand?: string | null;
  product_brand?: string | null;
  platformBrand?: string | null;
  platform_brand?: string | null;
  warehouseStocks?: WarehouseStockEntry[] | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface FbeShipmentItem {
  id: number;
  productId?: number | null;
  storeProductId?: number | null;
  sku?: string | null;
  platformSku?: string | null;
  vendorSku?: string | null;
  vendor_sku?: string | null;
  name?: string | null;
  storeProductName?: string | null;
  imageUrl?: string | null;
  quantity: number;
  receivedQuantity?: number | null;
  ean?: string | null;
  pnk?: string | null;
  mappedInventorySku?: string | null;
  mapped_inventory_sku?: string | null;
  localProductId?: number | null;
  local_product_id?: number | null;
  storeProductAmbiguous?: boolean;
  productUrl?: string | null;
  product_url?: string | null;
  platformProductUrl?: string | null;
  platform_product_url?: string | null;
  linkType?: string | null;
  link_type?: string | null;
  linkTypeLabel?: string | null;
  link_type_label?: string | null;
  emagLinkType?: string | null;
  emag_link_type?: string | null;
  brand?: string | null;
  product_brand?: string | null;
  platformBrand?: string | null;
  platform_brand?: string | null;
  product?: FbeShipmentItemProduct | null;
  /** 后端直接在 item 层面返回库存数据时的兜底路径 */
  warehouseStocks?: WarehouseStockEntry[] | null;
}

type FieldSource = Record<string, unknown> | null | undefined;

function pickFirstField(sources: FieldSource[], keys: string[]): string | null {
  for (const src of sources) {
    if (!src || typeof src !== 'object') continue;
    for (const key of keys) {
      const val = src[key];
      if (val != null && String(val).trim()) return String(val).trim();
    }
  }
  return null;
}

function resolveFbeItemEan(item: FbeShipmentItem): string | null {
  return pickFirstField([item], ['ean', 'EAN']);
}

function resolveFbeItemPnk(item: FbeShipmentItem): string | null {
  const raw = pickFirstField(
    [item],
    ['pnk', 'PNK', 'part_number_key', 'partNumber', 'part_number', 'emagOfferId', 'offerId'],
  );
  // 旧版 API 可能仅 product 层返回 MAN- 占位 PNK；无真实 PNK 时显示 -
  if (raw && /^MAN-/i.test(raw)) {
    const itemPnk = pickFirstField([item], ['pnk', 'PNK', 'part_number_key']);
    if (itemPnk && !/^MAN-/i.test(itemPnk)) return itemPnk;
    return null;
  }
  return raw;
}

function resolveFbeItemPlatformUrl(item: FbeShipmentItem): string | null {
  return pickFirstField(
    [item, item.product ?? null],
    ['productUrl', 'product_url', 'platformProductUrl', 'platform_product_url'],
  );
}

function resolveFbeItemPlatformSku(item: FbeShipmentItem): string {
  return pickFirstField(
    [item, item.product ?? null],
    ['platformSku', 'platform_sku', 'vendorSku', 'vendor_sku', 'sku'],
  ) ?? '-';
}

function resolveFbeItemInventorySku(item: FbeShipmentItem): string | null {
  return pickFirstField([item], ['mappedInventorySku', 'mapped_inventory_sku', 'inventorySku', 'inventory_sku']);
}

function resolveFbeItemName(item: FbeShipmentItem): string {
  return pickFirstField(
    [item, item.product ?? null],
    ['storeProductName', 'store_product_name', 'name', 'title', 'product_name', 'productName'],
  ) ?? '-';
}

function resolveFbeItemImageUrl(item: FbeShipmentItem): string | null {
  return pickFirstField([item], ['imageUrl', 'image_url'])
    ?? pickImageUrl(item.product)
    ?? pickImageUrl(item);
}

type FbeLinkTypeKind = 'SELF_BUILT' | 'RESELL' | 'OWN_BRAND_RESELL' | 'UNKNOWN';

const FBE_LINK_TYPE_LABEL: Record<FbeLinkTypeKind, string> = {
  SELF_BUILT: '自建链接',
  RESELL: '跟卖链接',
  OWN_BRAND_RESELL: '自有品牌跟卖',
  UNKNOWN: '未知',
};

const FBE_LINK_TAG_STYLE = {
  selfBuilt: { color: '#0891b2', background: '#ecfeff', borderColor: '#a5f3fc' },
  resell: { color: '#d97706', background: '#fff7ed', borderColor: '#fed7aa' },
  ownBrandResell: { color: '#7c3aed', background: '#f5f3ff', borderColor: '#ddd6fe' },
  brand: { color: '#475569', background: '#f1f5f9', borderColor: '#cbd5e1' },
  default: { color: '#64748b', background: '#f8fafc', borderColor: '#e2e8f0' },
} as const satisfies Record<string, CSSProperties>;

function normalizeEnumValue(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function resolveFbeItemBrand(item: FbeShipmentItem): string | null {
  const brand = pickFirstField(
    [item, item.product ?? null],
    ['brand', 'product_brand', 'platformBrand', 'platform_brand'],
  );
  const normalized = normalizeEnumValue(brand);
  return normalized || null;
}

function getFbeLinkTypeTagStyle(kind: FbeLinkTypeKind): CSSProperties {
  if (kind === 'SELF_BUILT') return FBE_LINK_TAG_STYLE.selfBuilt;
  if (kind === 'RESELL') return FBE_LINK_TAG_STYLE.resell;
  if (kind === 'OWN_BRAND_RESELL') return FBE_LINK_TAG_STYLE.ownBrandResell;
  return FBE_LINK_TAG_STYLE.default;
}

function renderFbeCompactTag(label: string, style: CSSProperties) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0 6px',
        fontSize: 10,
        lineHeight: '18px',
        borderRadius: 4,
        border: '1px solid',
        borderColor: style.borderColor ?? '#e2e8f0',
        whiteSpace: 'nowrap',
        margin: 0,
        ...style,
      }}
    >
      {label}
    </span>
  );
}

function readTruthyFlag(sources: FieldSource[], keys: string[]): boolean | null {
  for (const src of sources) {
    if (!src || typeof src !== 'object') continue;
    for (const key of keys) {
      const val = src[key];
      if (val === true || val === 1 || val === '1' || val === 'true') return true;
      if (val === false || val === 0 || val === '0' || val === 'false') return false;
    }
  }
  return null;
}

function normalizeLinkTypeKind(raw: string | null): FbeLinkTypeKind | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (
    upper === 'SELF_BUILT' || upper === 'SELF_BUILD' || upper === 'SELF'
    || upper === 'OWN' || upper === 'DIRECT' || upper.includes('SELF_BUILT')
  ) {
    return 'SELF_BUILT';
  }
  if (
    upper === 'RESELL' || upper === 'FOLLOW_SELL' || upper === 'FOLLOWSELL'
    || upper === 'FOLLOW' || upper.includes('RESELL') || upper.includes('FOLLOW')
  ) {
    return 'RESELL';
  }
  if (
    upper === 'OWN_BRAND_RESELL' || upper.includes('OWN_BRAND')
    || raw.includes('自有品牌')
  ) {
    return 'OWN_BRAND_RESELL';
  }
  if (raw.includes('自建')) return 'SELF_BUILT';
  if (raw.includes('跟卖')) return 'RESELL';
  return null;
}

function resolveLinkTypeDisplay(sources: FieldSource[]): { label: string; style: CSSProperties } {
  const explicitLabel = pickFirstField(sources, ['linkTypeLabel', 'link_type_label']);
  const typeRaw = pickFirstField(
    sources,
    [
      'linkType', 'link_type', 'emagLinkType', 'emag_link_type',
      'listingType', 'listing_type',
      'offerType', 'offer_type', 'sourceType', 'source_type',
    ],
  );

  const isSelfBuilt = readTruthyFlag(sources, ['isSelfBuilt', 'is_self_built', 'selfBuilt', 'self_built']);
  const isFollowSell = readTruthyFlag(
    sources,
    ['isFollowSell', 'is_follow_sell', 'isResell', 'is_resell', 'followSell', 'follow_sell'],
  );

  let kind: FbeLinkTypeKind = 'UNKNOWN';
  if (isSelfBuilt === true) kind = 'SELF_BUILT';
  else if (isFollowSell === true) kind = 'RESELL';
  else {
    const normalized = normalizeLinkTypeKind(typeRaw) ?? normalizeLinkTypeKind(explicitLabel);
    if (normalized) kind = normalized;
  }

  const label = explicitLabel ?? FBE_LINK_TYPE_LABEL[kind];
  return { label, style: getFbeLinkTypeTagStyle(kind) };
}

function resolveFbeItemLinkTypeDisplay(item: FbeShipmentItem): { label: string; style: CSSProperties } {
  return resolveLinkTypeDisplay([item, item.product ?? null]);
}

function ShipmentItemInfoCell({
  sku,
  name,
  ean,
  pnk,
  inventorySku,
  ambiguous,
  platformUrl,
  linkTypeLabel,
  linkTypeStyle,
  brandLabel,
  maxNameWidth = 240,
}: {
  sku: string;
  name: string;
  ean: string | null;
  pnk: string | null;
  inventorySku?: string | null;
  ambiguous?: boolean;
  platformUrl: string | null;
  linkTypeLabel: string;
  linkTypeStyle?: CSSProperties;
  brandLabel?: string | null;
  maxNameWidth?: number;
}) {
  const linkTarget = platformUrl?.trim() || null;

  const renderMetaLine = (label: string, value: string | null) => {
    const display = value?.trim() ? value.trim() : '-';
    const canLink = display !== '-' && linkTarget != null;
    if (canLink) {
      return (
        <a
          href={linkTarget}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, color: '#64748b', lineHeight: 1.35, textDecoration: 'none' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#1890ff';
            e.currentTarget.style.textDecoration = 'underline';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#64748b';
            e.currentTarget.style.textDecoration = 'none';
          }}
        >
          {label}：{display}
        </a>
      );
    }
    return (
      <span style={{ fontSize: 11, color: display === '-' ? '#94a3b8' : '#64748b', lineHeight: 1.35 }}>
        {label}：{display}
      </span>
    );
  };

  return (
    <div style={{ minWidth: 0, lineHeight: 1.35 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 1 }}>
        <Text code type="secondary" style={{ fontSize: 12, margin: 0 }}>{sku}</Text>
        {renderFbeCompactTag(linkTypeLabel, linkTypeStyle ?? FBE_LINK_TAG_STYLE.default)}
        {brandLabel ? renderFbeCompactTag(`品牌：${brandLabel}`, FBE_LINK_TAG_STYLE.brand) : null}
        {ambiguous ? renderFbeCompactTag('来源不唯一', FBE_LINK_TAG_STYLE.resell) : null}
      </div>
      <Text ellipsis style={{ display: 'block', maxWidth: maxNameWidth, fontSize: 13, lineHeight: 1.35 }}>{name}</Text>
      <div>{renderMetaLine('EAN', ean)}</div>
      <div>{renderMetaLine('PNK', pnk)}</div>
      {inventorySku ? <div>{renderMetaLine('库存SKU', inventorySku)}</div> : null}
    </div>
  );
}

// 4 阶段状态机 + 已取消
type FbeStatus = 'PENDING' | 'ALLOCATING' | 'SHIPPED' | 'ARRIVED' | 'CANCELLED';

interface FbeShipment {
  id:              number;
  shipmentNo:      string;
  shipmentNumber?: string | null;
  status:          FbeStatus;
  remark?:         string | null;
  itemCount:       number;
  productCount?:   number;
  totalQuantity:   number;
  createdAt:       string;
  updatedAt?:      string | null;
  /** 平铺字段（旧版后端） */
  warehouseId?:    number | null;
  warehouseName?:  string | null;
  /** 嵌套对象（后端关联查询补充后返回） */
  warehouse?: { id: number; name: string } | null;
  shop?:      { id: number; shopName: string; platform?: string | null; region?: string | null } | null;
  /** 财务字段 */
  totalProductValue?: number | null;
  overseasFreight?:   number | null;
  domesticFreight?:   number | null;
  items?:          FbeShipmentItem[];
}


// ─── 状态元数据 ──────────────────────────────────────────────────
const STATUS_META: Record<FbeStatus, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING:    { label: '待处理',  color: 'default', icon: <ClockCircleOutlined /> },
  ALLOCATING: { label: '配货中',  color: 'processing', icon: <SyncOutlined spin /> },
  SHIPPED:    { label: '已发货',  color: 'blue',    icon: <SendOutlined /> },
  ARRIVED:    { label: '已入仓',  color: 'success', icon: <InboxOutlined /> },
  CANCELLED:  { label: '已取消',  color: 'error',   icon: <StopOutlined /> },
};

function StatusTag({ status }: { status: FbeStatus }) {
  const m = STATUS_META[status] ?? { label: status, color: 'default', icon: null };
  return <Tag color={m.color} icon={m.icon}>{m.label}</Tag>;
}

// ─── 主组件 ──────────────────────────────────────────────────────
export default function FbeShipments() {
  const [searchParams] = useSearchParams();
  const [allList, setAllList]     = useState<FbeShipment[]>([]);
  const [loading, setLoading]     = useState(false);
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(20);
  const [total, setTotal]         = useState(0);
  const [keyword, setKeyword]     = useState('');
  const [search, setSearch]       = useState('');
  const [activeTab, setActiveTab] = useState<FbeStatus | 'ALL'>('ALL');

  // 明细抽屉
  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail,        setDetail]        = useState<FbeShipment | null>(null);

  // 状态流转 loading
  const [transitingId, setTransitingId] = useState<number | null>(null);

  // 手动新建发货单
  const [manualCreateOpen, setManualCreateOpen] = useState(false);

  // 费用登记弹窗
  const [costsTarget, setCostsTarget] = useState<FbeShipment | null>(null);

  // 超级管理员权限（严格判定，不含老会话兼容）
  const isSuperAdmin = isSuperAdminUser();

  // ── 拉取列表（全量 + 分页均从后端拿） ──────────────────────────
  const fetchList = useCallback(async (p = page, ps = pageSize, kw = search, tab = activeTab) => {
    setLoading(true);
    try {
      const { data: res } = await request.get<{
        code: number;
        data: { list: FbeShipment[]; total: number };
        message?: string;
      }>('/fbe-shipments', {
        params: {
          page: p,
          pageSize: ps,
          keyword: kw || undefined,
          status: tab !== 'ALL' ? tab : undefined,
        },
      });
      if (res.code === 200) {
        setAllList(res.data.list ?? []);
        setTotal(res.data.total ?? 0);
      } else {
        message.error(res.message || '加载失败');
      }
    } catch {
      message.error('网络异常，请刷新重试');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, activeTab]);

  useEffect(() => { fetchList(page, pageSize, search, activeTab); }, [page, pageSize, search, activeTab]);

  // 各 Tab 计数（用 badge 显示，通过 GET /fbe-shipments/counts 或前端缓存第一次全量结果估算）
  const [counts, setCounts] = useState<Partial<Record<FbeStatus, number>>>({});
  const fetchCounts = useCallback(async () => {
    try {
      const { data: res } = await request.get<{
        code: number;
        data: Partial<Record<FbeStatus, number>>;
      }>('/fbe-shipments/counts');
      if (res.code === 200) setCounts(res.data ?? {});
    } catch { /* 静默失败，counts 只用于显示，不影响功能 */ }
  }, []);
  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  const refresh = useCallback(() => {
    fetchList(page, pageSize, search, activeTab);
    fetchCounts();
  }, [fetchList, fetchCounts, page, pageSize, search, activeTab]);

  // ── 删除发货单（超管专属；必须定义在 refresh 之后，避免 TDZ 引用 refresh 导致白屏）──
  const handleDelete = useCallback(async (id: number) => {
    try {
      const { data: res } = await request.delete<{ code: number; message: string }>(
        `/fbe-shipments/${id}`,
      );
      if (res.code === 200) {
        message.success(res.message || '发货单已删除，库存已自动返还');
        refresh();
      } else {
        message.error(res.message || '删除失败');
      }
    } catch {
      message.error('网络异常，删除失败，请重试');
    }
  }, [refresh]);

  // ── 行内编辑发货单号 ──────────────────────────────────────────
  const handleEditShipmentNo = useCallback(async (record: FbeShipment, newNo: string) => {
    const val = newNo.trim();
    const current = (record.shipmentNo || record.shipmentNumber || '').trim();
    if (!val || val === current) return;
    try {
      const { data: res } = await request.put<{ code: number; message: string }>(
        `/fbe-shipments/${record.id}`,
        { shipmentNumber: val },
      );
      if (res.code === 200) {
        message.success('发货单号已更新');
        refresh();
      } else {
        message.error(res.message || '更新失败');
      }
    } catch {
      message.error('网络异常，请重试');
    }
  }, [refresh]);

  // ── 切换 Tab ──────────────────────────────────────────────────
  const handleTabChange = useCallback((key: string) => {
    setActiveTab(key as FbeStatus | 'ALL');
    setPage(1);
  }, []);

  // ── 查看明细 ──────────────────────────────────────────────────
  const openDetail = useCallback(async (record: FbeShipment) => {
    setDrawerOpen(true);
    setDetailLoading(true);
    // 列表 row 的 items 未 enriched（无 ean/pnk/linkType），仅保留单头作 loading 占位，明细必须走详情接口
    setDetail({ ...record, items: undefined });
    try {
      const { data: res } = await request.get<{ code: number; data: FbeShipment; message?: string }>(
        `/fbe-shipments/${record.id}`,
      );
      if (res.code === 200) {
        console.debug('[FBE] detail items', res.data.items?.map((i) => ({
          id: i.id,
          productId: i.productId,
          storeProductId: i.storeProductId,
          ean: i.ean,
          pnk: i.pnk,
          platformSku: i.platformSku,
          vendorSku: i.vendorSku,
          mappedInventorySku: i.mappedInventorySku ?? i.mapped_inventory_sku,
          storeProductAmbiguous: i.storeProductAmbiguous,
        })));
        setDetail(res.data);
      } else {
        message.error(res.message || '加载明细失败');
        setDetail(null);
      }
    } catch {
      message.error('网络异常');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openedShipmentFromUrlRef = useRef<number | null>(null);
  useEffect(() => {
    const raw = searchParams.get('fbeShipmentId');
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isFinite(id) || openedShipmentFromUrlRef.current === id) return;
    openedShipmentFromUrlRef.current = id;
    openDetail({
      id,
      shipmentNo: '',
      status: 'PENDING',
      itemCount: 0,
      totalQuantity: 0,
      createdAt: new Date().toISOString(),
    });
  }, [searchParams, openDetail]);

  // ── 状态流转核心函数 ──────────────────────────────────────────
  const transit = useCallback(async (record: FbeShipment, targetStatus: FbeStatus) => {
    setTransitingId(record.id);
    try {
      const { data: res } = await request.put<{ code: number; message: string; data?: { shortages?: { sku: string; required: number; available: number }[] } }>(
        `/fbe-shipments/${record.id}/status`,
        { status: targetStatus },
      );

      if (res.code === 200) {
        message.success(res.message || '操作成功');
        refresh();
      } else {
        // ── 库存不足专项处理 ──────────────────────────────────
        const shortages = res.data?.shortages;
        if (shortages && shortages.length > 0) {
          notification.error({
            message: '⚠️ 库存不足，无法转入配货中',
            description: (
              <div>
                <p style={{ marginBottom: 8, color: '#64748b', fontSize: 13 }}>
                  以下 SKU 的现有库存不满足本次发货需求，请先补货或减少发货数量：
                </p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#fef2f2' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: '#dc2626' }}>SKU</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: '#dc2626' }}>需要</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: '#dc2626' }}>可用</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: '#dc2626' }}>缺口</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shortages.map((s, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #fee2e2' }}>
                        <td style={{ padding: '5px 10px', fontFamily: 'monospace' }}>{s.sku}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'center' }}>{s.required}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'center', color: s.available === 0 ? '#dc2626' : '#d97706' }}>{s.available}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'center', color: '#dc2626', fontWeight: 700 }}>-{s.required - s.available}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ),
            duration: 0, // 不自动关闭，让用户仔细查看
            placement: 'topRight',
            style: { width: 480 },
          });
        } else {
          message.error(res.message || '操作失败');
        }
      }
    } catch (err: unknown) {
      // axios 4xx/5xx 错误也可能携带库存不足信息
      const axiosData = (err as { response?: { data?: { message?: string; data?: { shortages?: { sku: string; required: number; available: number }[] } } } })?.response?.data;
      if (axiosData?.data?.shortages?.length) {
        notification.error({
          message: '⚠️ 库存不足，无法转入配货中',
          description: axiosData.message || '请检查库存后重试',
          duration: 0,
          placement: 'topRight',
        });
      } else {
        message.error(axiosData?.message || '网络异常，请重试');
      }
    } finally {
      setTransitingId(null);
    }
  }, [refresh]);

  // ── 带确认弹窗的流转 ──────────────────────────────────────────
  const handleTransit = useCallback((record: FbeShipment, targetStatus: FbeStatus) => {
    const META: Record<FbeStatus, { title: string; content: string; okText: string; iconColor: string }> = {
      ALLOCATING: {
        title:   `转入配货中 — ${record.shipmentNo || record.shipmentNumber || `#${record.id}`}`,
        content: '确认后状态将变更为「配货中」，仓库开始备货。',
        okText:  '转入配货中',
        iconColor: '#f59e0b',
      },
      SHIPPED: {
        title:   `标记发货 — ${record.shipmentNo || record.shipmentNumber || `#${record.id}`}`,
        content: '系统将校验当前库存是否满足发货数量。若库存不足，将返回详细缺口信息。确认继续？',
        okText:  '确认标记发货',
        iconColor: '#2563eb',
      },
      ARRIVED: {
        title:   `确认已入仓 — ${record.shipmentNo || record.shipmentNumber || `#${record.id}`}`,
        content: '入仓后系统将自动将发货数量计入平台库存，并扣减对应在途库存，此操作不可逆。',
        okText:  '确认入仓',
        iconColor: '#22c55e',
      },
      CANCELLED: {
        title:   `取消发货单`,
        content: '确认取消后，该单将无法再流转，所有在途库存预占将释放。',
        okText:  '确认取消',
        iconColor: '#ef4444',
      },
      PENDING: { title: '', content: '', okText: '', iconColor: '' },
    };
    const m = META[targetStatus];
    confirm({
      title: m.title,
      icon:  <ExclamationCircleFilled style={{ color: m.iconColor }} />,
      content: m.content,
      okText: m.okText,
      okType: targetStatus === 'CANCELLED' ? 'danger' : 'primary',
      cancelText: '取消',
      onOk: () => transit(record, targetStatus),
    });
  }, [transit]);

  // ── 列定义 ────────────────────────────────────────────────────
  const columns = useMemo<ColumnsType<FbeShipment>>(() => [
    {
      title: '发货单号',
      key: 'shipmentNo',
      width: 220,
      fixed: 'left' as const,
      render: (_: unknown, r: FbeShipment) => {
        const no = r.shipmentNo || r.shipmentNumber || `#${r.id}`;
        const canEdit = r.status === 'PENDING';
        if (canEdit) {
          return (
            <Text
              code
              style={{ fontSize: 13 }}
              editable={{
                tooltip: '点击编辑发货单号',
                maxLength: 80,
                text: no,
                onChange: (val) => handleEditShipmentNo(r, val),
              }}
            >
              {no}
            </Text>
          );
        }
        return <Text code style={{ fontSize: 13 }}>{no}</Text>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      align: 'center',
      render: (v: FbeStatus) => <StatusTag status={v} />,
    },
    {
      title: '发货店铺',
      key: 'shop',
      width: 160,
      ellipsis: true,
      render: (_: unknown, r: FbeShipment) => {
        const name = r.shop?.shopName;
        if (!name) return <Text type="secondary">-</Text>;
        const region = r.shop?.region;
        const platform = r.shop?.platform;
        const suffix = [platform, region].filter(Boolean).join(' · ');
        return (
          <Tooltip title={suffix ? `${name} (${suffix})` : name}>
            <span style={{ color: '#1e293b', fontSize: 13 }}>{name}</span>
            {suffix && (
              <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.3, marginTop: 1 }}>{suffix}</div>
            )}
          </Tooltip>
        );
      },
    },
    {
      title: '发货仓库',
      key: 'warehouse',
      width: 130,
      ellipsis: true,
      render: (_: unknown, r: FbeShipment) => {
        const name = r.warehouse?.name ?? r.warehouseName;
        if (!name) return <Text type="secondary">未指定</Text>;
        return (
          <Tag
            color="blue"
            bordered={false}
            style={{ borderRadius: 6, fontWeight: 500, fontSize: 12 }}
          >
            {name}
          </Tag>
        );
      },
    },
    {
      title: '产品款数',
      key: 'itemCount',
      width: 90,
      align: 'center',
      render: (_: unknown, r: FbeShipment) => {
        const v = r.productCount ?? r.itemCount;
        return <span>{v != null ? v : '-'}</span>;
      },
    },
    {
      title: '发货总量',
      dataIndex: 'totalQuantity',
      key: 'totalQuantity',
      width: 90,
      align: 'center',
      render: (v: number) => <span style={{ fontWeight: 600 }}>{v ?? '-'}</span>,
    },
    {
      title: '产品货值',
      dataIndex: 'totalProductValue',
      key: 'totalProductValue',
      width: 120,
      align: 'right' as const,
      render: (v: number | null) => (
        <span style={{ fontWeight: 700, color: '#1e293b', fontFeatureSettings: '"tnum"' }}>
          {fmtMoney(v)}
        </span>
      ),
    },
    {
      title: '海外头程',
      dataIndex: 'overseasFreight',
      key: 'overseasFreight',
      width: 110,
      align: 'right' as const,
      render: (v: number | null) => (
        <span style={{ color: v != null ? '#d97706' : '#d9d9d9', fontFeatureSettings: '"tnum"' }}>
          {fmtMoney(v)}
        </span>
      ),
    },
    {
      title: '国内运费',
      dataIndex: 'domesticFreight',
      key: 'domesticFreight',
      width: 110,
      align: 'right' as const,
      render: (v: number | null) => (
        <span style={{ color: v != null ? '#d97706' : '#d9d9d9', fontFeatureSettings: '"tnum"' }}>
          {fmtMoney(v)}
        </span>
      ),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      ellipsis: true,
      render: (v: string | null) => v
        ? <Tooltip title={v}><span style={{ color: '#475569' }}>{v}</span></Tooltip>
        : <Text type="secondary">-</Text>,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 165,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN', { hour12: false }) : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: isSuperAdmin ? 300 : 260,
      align: 'center',
      fixed: 'right' as const,
      render: (_: unknown, record: FbeShipment) => {
        const busy = transitingId === record.id;
        return (
          <Space size={4} wrap>
            {/* 查看明细 —— 所有状态均可 */}
            <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(record)}>
              明细
            </Button>

            {/* 费用登记 —— 所有状态均可 */}
            <Button
              size="small"
              icon={<DollarOutlined />}
              style={{ color: '#d97706', borderColor: '#fcd34d' }}
              onClick={() => setCostsTarget(record)}
            >
              费用登记
            </Button>

            {/* PENDING → ALLOCATING */}
            {record.status === 'PENDING' && (<>
              <Button
                size="small" type="primary"
                icon={<SyncOutlined />}
                loading={busy}
                onClick={() => handleTransit(record, 'ALLOCATING')}
              >
                转配货
              </Button>
              <Button
                size="small" danger
                icon={<CloseCircleOutlined />}
                loading={busy}
                onClick={() => handleTransit(record, 'CANCELLED')}
              >
                取消
              </Button>
            </>)}

            {/* ALLOCATING → SHIPPED */}
            {record.status === 'ALLOCATING' && (
              <Tooltip title="系统将自动校验库存是否充足">
                <Button
                  size="small" type="primary"
                  icon={<SendOutlined />}
                  loading={busy}
                  style={{ background: '#2563eb', borderColor: '#2563eb' }}
                  onClick={() => handleTransit(record, 'SHIPPED')}
                >
                  标记发货
                </Button>
              </Tooltip>
            )}

            {/* SHIPPED → ARRIVED */}
            {record.status === 'SHIPPED' && (
              <Button
                size="small"
                icon={<InboxOutlined />}
                loading={busy}
                style={{ background: '#22c55e', borderColor: '#22c55e', color: '#fff' }}
                onClick={() => handleTransit(record, 'ARRIVED')}
              >
                确认入仓
              </Button>
            )}

            {/* 超管专属删除（带库存回滚） */}
            {isSuperAdmin && (
              <Popconfirm
                title="确认删除该发货单？"
                description="删除后，占用的库存将自动返还至对应仓库。"
                okText="确认删除"
                okType="danger"
                cancelText="取消"
                placement="topRight"
                onConfirm={() => handleDelete(record.id)}
              >
                <Button type="link" danger size="small" style={{ padding: '0 4px' }}>
                  删除
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ], [transitingId, openDetail, handleTransit, handleEditShipmentNo, isSuperAdmin, handleDelete, setCostsTarget]);

  // ── Tab 配置 ──────────────────────────────────────────────────
  const tabItems = useMemo(() => {
    const defs: { key: FbeStatus | 'ALL'; label: string }[] = [
      { key: 'ALL',        label: '全部' },
      { key: 'PENDING',    label: '待处理' },
      { key: 'ALLOCATING', label: '配货中' },
      { key: 'SHIPPED',    label: '已发货' },
      { key: 'ARRIVED',    label: '已入仓' },
    ];
    return defs.map(({ key, label }) => ({
      key,
      label: key === 'ALL' ? label : (
        <span>
          {label}
          {counts[key as FbeStatus] != null && counts[key as FbeStatus]! > 0 && (
            <Badge
              count={counts[key as FbeStatus]}
              size="small"
              style={{ marginLeft: 6, background: key === 'PENDING' ? '#f59e0b' : undefined }}
            />
          )}
        </span>
      ),
    }));
  }, [counts]);

  return (
    <div>
      {/* 页头 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
            <InboxOutlined style={{ color: '#2563eb' }} /> FBE发货
          </h2>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>
            管理 4 阶段发货流程：待处理 → 配货中 → 已发货 → 已入仓
          </p>
        </div>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setManualCreateOpen(true)}>
            新建发货单
          </Button>
          <Input.Search
            placeholder="搜索发货单号 / 备注"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={(v) => { setSearch(v); setPage(1); }}
            allowClear
            style={{ width: 220 }}
          />
          <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
        </Space>
      </div>

      {/* Tabs 看板 */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0' }}>
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          items={tabItems}
          style={{ padding: '0 16px' }}
          tabBarStyle={{ marginBottom: 0 }}
        />
        <div style={{ padding: '0 0 8px' }}>
          <Table
            rowKey="id"
            loading={loading}
            dataSource={allList}
            columns={columns}
            scroll={{ x: 'max-content', y: 'calc(100vh - 310px)' }}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (p, ps) => { setPage(p); setPageSize(ps); },
            }}
            locale={{ emptyText: <Empty description="该状态下暂无发货单" style={{ padding: 48 }} /> }}
          />
        </div>
      </div>

      {/* 明细抽屉 */}
      <DetailDrawer
        open={drawerOpen}
        loading={detailLoading}
        detail={detail}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => {
          // 保存数量后重新拉取 enriched 明细，同时刷新列表
          if (detail) openDetail(detail);
          refresh();
        }}
      />

      <ManualCreateFbeShipmentModal
        open={manualCreateOpen}
        onCancel={() => setManualCreateOpen(false)}
        onSuccess={() => {
          setManualCreateOpen(false);
          refresh();
        }}
      />

      <CostsModal
        record={costsTarget}
        onCancel={() => setCostsTarget(null)}
        onSuccess={() => {
          setCostsTarget(null);
          refresh();
        }}
      />
    </div>
  );
}

// ─── 明细抽屉 ─────────────────────────────────────────────────
interface DetailDrawerProps {
  open:     boolean;
  loading:  boolean;
  detail:   FbeShipment | null;
  onClose:  () => void;
  onSaved?: () => void;   // 保存数量后通知父级刷新
}

const IMG_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'%3E%3Crect fill='%23f5f5f5' width='44' height='44' rx='4'/%3E%3Ctext x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='8'%3E无图%3C/text%3E%3C/svg%3E";

/** 本次编辑会话中新追加的产品行（尚未有后端 itemId） */
interface NewItemRow {
  storeProductId: number;
  productId?: number | null;
  platformSku:    string | null;
  inventorySku:   string | null;
  ean:            string | null;
  pnk:            string | null;
  storeProductName: string;
  imageUrl:       string | null;
  rawProduct:     StoreProductPick;
  quantity:       number;
}

function DetailDrawer({ open, loading, detail, onClose, onSaved }: DetailDrawerProps) {
  const no = detail ? (detail.shipmentNo || detail.shipmentNumber || `#${detail.id}`) : '';
  const canEdit = detail?.status === 'PENDING';

  // 兼容平铺字段（warehouseId/warehouseName）与嵌套对象（warehouse.id/name）两种后端结构
  const resolvedWarehouseId   = detail?.warehouse?.id   ?? detail?.warehouseId   ?? null;
  const resolvedWarehouseName = detail?.warehouse?.name ?? detail?.warehouseName ?? null;

  const shopId = detail?.shop?.id ?? null;

  // 数量编辑态（itemId → newQty），仅 PENDING 时启用
  const [qtyMap, setQtyMap] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);

  // 新追加的产品行（PENDING 下可追加）
  const [newItems,        setNewItems]        = useState<NewItemRow[]>([]);
  const [productOptions,  setProductOptions]  = useState<{ label: string; value: number; product: StoreProductPick }[]>([]);
  const [searching,       setSearching]       = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 打开或切换明细时重置编辑态
  useEffect(() => {
    if (open && detail?.items) {
      const init: Record<number, number> = {};
      detail.items.forEach((it) => { init[it.id] = it.quantity; });
      setQtyMap(init);
      setNewItems([]);
      setProductOptions([]);
    }
  }, [open, detail]);

  const hasChange =
    (detail?.items?.some((it) => qtyMap[it.id] !== undefined && qtyMap[it.id] !== it.quantity) ?? false)
    || newItems.length > 0;

  // ── 产品选择器：搜索 store-products ──────────────────────────
  const fetchProductsForPicker = useCallback(async (sid: number, kw: string) => {
    setSearching(true);
    try {
      const { data: res } = await request.get<{
        code: number;
        data?: StoreProductPick[] | { list?: StoreProductPick[] };
      }>('/store-products', {
        params: {
          shopId: sid,
          page: 1,
          pageSize: 50,
          ...(kw.trim() ? { keyword: kw.trim(), search: kw.trim() } : {}),
        },
      });
      if (res.code !== 200) { setProductOptions([]); return; }
      const raw = res.data;
      const list = Array.isArray(raw)
        ? raw
        : (raw && typeof raw === 'object' && Array.isArray((raw as { list?: StoreProductPick[] }).list))
          ? (raw as { list: StoreProductPick[] }).list
          : [];
      setProductOptions(
        list
          .map((p) => {
            const sid = resolveStoreProductPickId(p);
            if (!sid) return null;
            return { value: sid, label: buildSearchLabelPlain(p), product: p };
          })
          .filter((o): o is { value: number; label: string; product: StoreProductPick } => o != null),
      );
    } catch {
      setProductOptions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const onProductSearch = useCallback((kw: string) => {
    if (!shopId) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => { fetchProductsForPicker(shopId, kw); }, 400);
  }, [shopId, fetchProductsForPicker]);

  const addNewItem = useCallback((product: StoreProductPick) => {
    const pid = resolveStoreProductPickId(product);
    if (!pid) {
      message.error('所选产品缺少 storeProductId，请重新搜索选择');
      return;
    }
    const existingIds = new Set(detail?.items?.map((it) => it.storeProductId) ?? []);
    setNewItems((prev) => {
      if (prev.some((r) => r.storeProductId === pid) || existingIds.has(pid)) {
        message.warning('该产品已在发货单中，请勿重复添加');
        return prev;
      }
      return [...prev, {
        storeProductId: pid,
        productId:      product.localProductId ?? product.local_product_id ?? null,
        platformSku:    pickPlatformSku(product) || null,
        inventorySku:   pickMappedInventorySku(product) || null,
        ean:            pickFirstField([product], ['ean', 'EAN']) ?? null,
        pnk:            pickPnk(product) || null,
        storeProductName: product.title ?? product.name ?? product.product_name ?? product.productName ?? '-',
        imageUrl:       pickImageUrl(product),
        rawProduct:     product,
        quantity:       1,
      }];
    });
  }, [detail]);

  const removeNewItem = useCallback((storeProductId: number) => {
    setNewItems((prev) => prev.filter((r) => r.storeProductId !== storeProductId));
  }, []);

  const updateNewItemQty = useCallback((storeProductId: number, v: number | null) => {
    setNewItems((prev) => prev.map((r) => r.storeProductId === storeProductId ? { ...r, quantity: v ?? 1 } : r));
  }, []);

  // ── 保存：修改量的老行 + 新追加行，统一提交 ─────────────────
  const handleSaveQty = async () => {
    if (!detail) return;
    // 后端要求旧行主键为 "id"（非 "itemId"），新追加行用 "storeProductId"
    const changedOld = (detail.items ?? [])
      .filter((it) => qtyMap[it.id] !== undefined && qtyMap[it.id] !== it.quantity)
      .map((it) => ({ id: it.id, quantity: qtyMap[it.id] }));
    const newRows = newItems.map((r) => ({ storeProductId: Number(r.storeProductId), quantity: r.quantity }));
    const missingStoreProductId = newRows.some((r) => !Number.isFinite(r.storeProductId) || r.storeProductId <= 0);
    if (missingStoreProductId) {
      message.error('新增产品缺少 storeProductId，请删除后重新选择');
      return;
    }
    if (changedOld.length === 0 && newRows.length === 0) { message.info('没有数量变更或新增产品'); return; }

    // 运行时防御：后端详情接口有时以 shipmentId / fbeShipmentId 替代 id 字段
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = detail as any;
    const shipmentId: number | undefined = detail.id ?? raw.shipmentId ?? raw.fbeShipmentId;
    if (!shipmentId) {
      message.error('无法获取发货单 ID，请关闭抽屉后重新打开');
      return;
    }

    const payload = { items: [...changedOld, ...newRows] };
    console.debug('[FBE] submit payload', payload);

    setSaving(true);
    try {
      const { data: res } = await request.put<{ code: number; message: string }>(
        `/fbe-shipments/${shipmentId}`,
        payload,
      );
      if (res.code === 200) {
        message.success(res.message || '保存成功');
        onSaved?.();
      } else {
        message.error(res.message || '保存失败');
      }
    } catch {
      message.error('网络异常，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      title={detail
        ? `发货单明细 — ${no}${resolvedWarehouseName ? `（出库仓：${resolvedWarehouseName}）` : ''}`
        : '发货单明细'}
      open={open}
      onClose={onClose}
      width={620}
      destroyOnClose
      footer={canEdit && hasChange ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {newItems.length > 0 && (
            <Text type="secondary" style={{ fontSize: 12, lineHeight: '32px' }}>
              新增 {newItems.length} 个产品
            </Text>
          )}
          <Button type="primary" loading={saving} onClick={handleSaveQty}>
            保存修改
          </Button>
        </div>
      ) : null}
    >
      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 80 }}><Spin /></div>
      ) : detail ? (
        <div>
          <Space wrap style={{ marginBottom: 12 }}>
            <StatusTag status={detail.status} />
            <Text type="secondary">
              {detail.createdAt ? new Date(detail.createdAt).toLocaleString('zh-CN', { hour12: false }) : '-'}
            </Text>
            {detail.remark && <Text type="secondary">备注：{detail.remark}</Text>}
          </Space>
          {/* 出库仓库（标题已展示，此处作为正文标签兜底） */}
          {resolvedWarehouseName && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#eff6ff', border: '1px solid #bfdbfe',
              borderRadius: 6, padding: '4px 10px', marginBottom: 12, fontSize: 13,
            }}>
              <span style={{ color: '#2563eb', fontWeight: 600 }}>出库仓库：</span>
              <span style={{ color: '#1e293b', fontWeight: 500 }}>{resolvedWarehouseName}</span>
            </div>
          )}
          {canEdit && (
            <>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>
                待处理状态下可修改发货数量，或追加新产品，修改后点击"保存修改"生效。
              </Text>
              {/* ── 追加产品选择器 ── */}
              {shopId ? (
                <Select
                  showSearch
                  allowClear
                  placeholder="搜索并追加新产品（SKU / EAN / PNK / 名称）"
                  filterOption={(input, option) => {
                    const keyword = input.toLowerCase().trim();
                    if (!keyword) return true;
                    const p = productOptions.find((o) => o.value === option?.value)?.product;
                    if (!p) return false;
                    const sku  = (p.sku  ?? '').toLowerCase();
                    const ean  = (p.ean  ?? '').toLowerCase();
                    const pnk  = pickPnk(p).toLowerCase();
                    const name = (p.title ?? p.name ?? p.product_name ?? p.productName ?? '').toLowerCase();
                    const cn   = (p.local_chinese_name ?? p.localChineseName ?? '').toLowerCase();
                    return sku.includes(keyword) || ean.includes(keyword) || pnk.includes(keyword)
                      || name.includes(keyword) || cn.includes(keyword);
                  }}
                  loading={searching}
                  options={productOptions.map(({ label, value }) => ({ label, value }))}
                  optionRender={(oriOption) => {
                    const p = productOptions.find((o) => o.value === oriOption.value)?.product;
                    if (!p) return <span>{String(oriOption.label ?? '')}</span>;
                    return <ProductOptionRow product={p} />;
                  }}
                  onSearch={onProductSearch}
                  onOpenChange={(dropdownOpen) => {
                    if (dropdownOpen && shopId) fetchProductsForPicker(shopId, '');
                  }}
                  onSelect={(value: number | string) => {
                    const sid = Number(value);
                    const found = productOptions.find((o) => o.value === sid || Number(o.value) === sid);
                    if (found?.product) addNewItem(found.product);
                    else message.error('未能识别所选平台产品，请重新搜索选择');
                  }}
                  notFoundContent={searching ? <Spin size="small" /> : '无匹配产品'}
                  popupMatchSelectWidth
                  style={{ width: '100%', marginBottom: newItems.length > 0 ? 8 : 14 }}
                />
              ) : (
                <Alert type="warning" showIcon message="该发货单未关联店铺，无法追加产品" style={{ marginBottom: 12 }} />
              )}
              {/* ── 已追加的新产品明细 ── */}
              {newItems.length > 0 && (
                <Table<NewItemRow>
                  rowKey="storeProductId"
                  size="small"
                  dataSource={newItems}
                  pagination={false}
                  style={{ marginBottom: 14, background: '#f0fdf4', borderRadius: 6, overflow: 'hidden' }}
                  title={() => (
                    <Text style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                      <PlusOutlined style={{ marginRight: 4 }} />新追加产品（保存后入库）
                    </Text>
                  )}
                  columns={[
                    {
                      title: '图片',
                      key: 'img',
                      width: 56,
                      align: 'center' as const,
                      render: (_: unknown, r: NewItemRow) => {
                        const src = r.imageUrl ?? pickImageUrl(r.rawProduct) ?? '';
                        return (
                          <Image
                            src={src || undefined}
                            referrerPolicy="no-referrer"
                            width={40}
                            height={40}
                            style={{ objectFit: 'contain', borderRadius: 4, border: '1px solid #f0f0f0' }}
                            fallback={IMG_FALLBACK}
                            preview={false}
                          />
                        );
                      },
                    },
                    {
                      title: 'SKU / 产品名称',
                      key: 'info',
                      render: (_: unknown, r: NewItemRow) => {
                        const linkType = resolveLinkTypeDisplay([r.rawProduct]);
                        return (
                        <ShipmentItemInfoCell
                          sku={r.platformSku || '-'}
                          name={r.storeProductName}
                          ean={r.ean}
                          pnk={r.pnk}
                          inventorySku={r.inventorySku}
                          platformUrl={pickFirstField(
                            [r.rawProduct],
                            ['productUrl', 'product_url', 'platformProductUrl', 'platform_product_url'],
                          )}
                          linkTypeLabel={linkType.label}
                          linkTypeStyle={linkType.style}
                          brandLabel={pickFirstField(
                            [r.rawProduct],
                            ['brand', 'product_brand', 'platformBrand', 'platform_brand'],
                          )}
                          maxNameWidth={200}
                        />
                        );
                      },
                    },
                    {
                      title: '数量',
                      key: 'qty',
                      width: 110,
                      align: 'center' as const,
                      render: (_: unknown, r: NewItemRow) => (
                        <InputNumber
                          size="small"
                          min={1}
                          precision={0}
                          value={r.quantity}
                          style={{ width: 80 }}
                          onChange={(v) => updateNewItemQty(r.storeProductId, v)}
                        />
                      ),
                    },
                    {
                      title: '操作',
                      key: 'op',
                      width: 60,
                      align: 'center' as const,
                      render: (_: unknown, r: NewItemRow) => (
                        <Button type="link" danger size="small" onClick={() => removeNewItem(r.storeProductId)}>
                          删除
                        </Button>
                      ),
                    },
                  ]}
                />
              )}
            </>
          )}
          <Table
            rowKey="id"
            size="small"
            dataSource={detail.items ?? []}
            pagination={false}
            columns={[
              {
                title: '图片',
                key: 'img',
                width: 60,
                align: 'center' as const,
                render: (_: unknown, r: FbeShipmentItem) => {
                  const src = resolveFbeItemImageUrl(r) ?? '';
                  return (
                    <Image
                      src={src || undefined}
                      referrerPolicy="no-referrer"
                      width={44}
                      height={44}
                      style={{ objectFit: 'contain', borderRadius: 4, border: '1px solid #f0f0f0' }}
                      fallback={IMG_FALLBACK}
                      preview={false}
                    />
                  );
                },
              },
              {
                title: 'SKU / 产品名称',
                key: 'info',
                render: (_: unknown, r: FbeShipmentItem) => {
                  const linkType = resolveFbeItemLinkTypeDisplay(r);
                  return (
                  <ShipmentItemInfoCell
                    sku={resolveFbeItemPlatformSku(r)}
                    name={resolveFbeItemName(r)}
                    ean={resolveFbeItemEan(r)}
                    pnk={resolveFbeItemPnk(r)}
                    inventorySku={resolveFbeItemInventorySku(r)}
                    ambiguous={r.storeProductAmbiguous === true}
                    platformUrl={resolveFbeItemPlatformUrl(r)}
                    linkTypeLabel={linkType.label}
                    linkTypeStyle={linkType.style}
                    brandLabel={resolveFbeItemBrand(r)}
                  />
                  );
                },
              },
              {
                title: '发货数量',
                key: 'quantity',
                width: 120,
                align: 'center' as const,
                render: (_: unknown, r: FbeShipmentItem) => {
                  if (canEdit) {
                    return (
                      <InputNumber
                        size="small"
                        min={1}
                        precision={0}
                        value={qtyMap[r.id] ?? r.quantity}
                        style={{
                          width: 90,
                          borderColor: (qtyMap[r.id] ?? r.quantity) !== r.quantity ? '#f59e0b' : undefined,
                        }}
                        onChange={(v) => setQtyMap((prev) => ({ ...prev, [r.id]: v ?? 1 }))}
                      />
                    );
                  }
                  return <Text strong>{r.quantity}</Text>;
                },
              },
              {
                title: '该仓剩余可用',
                key: 'avail',
                width: 110,
                align: 'center' as const,
                render: (_: unknown, r: FbeShipmentItem) => {
                  // 兼容两种后端结构：product.warehouseStocks 或 item.warehouseStocks
                  const stocks = r.product?.warehouseStocks ?? r.warehouseStocks ?? null;
                  const avail = getAvailableStock(stocks, resolvedWarehouseId);
                  if (avail === null) return <Text type="secondary">-</Text>;
                  const color = avail <= 0 ? '#ef4444' : avail < 10 ? '#f59e0b' : '#22c55e';
                  return (
                    <span style={{ fontWeight: 700, color, fontFeatureSettings: '"tnum"' }}>
                      {avail}
                    </span>
                  );
                },
              },
            ]}
            locale={{ emptyText: '该单无明细' }}
          />
        </div>
      ) : (
        <Empty description="暂无数据" />
      )}
    </Drawer>
  );
}

// ─── 店铺 / 平台产品（手动建单搜索用）──────────────────────────
interface ShopOption {
  id: number;
  shopName: string;
  platform: string;
  region?: string | null;
  site?: string | null;
}

interface StoreProductPick {
  id?: number | null;
  storeProductId?: number | null;
  store_product_id?: number | null;
  sku?: string | null;
  platformSku?: string | null;
  vendorSku?: string | null;
  vendor_sku?: string | null;
  mapped_inventory_sku?: string | null;
  mappedInventorySku?: string | null;
  inventorySku?: string | null;
  inventory_sku?: string | null;
  localProductId?: number | null;
  local_product_id?: number | null;
  ean?: string | null;
  pnk?: string | null;
  part_number_key?: string | null;
  part_number?: string | null;
  partNumber?: string | null;
  title?: string | null;
  name?: string | null;
  product_name?: string | null;
  productName?: string | null;
  local_chinese_name?: string | null;
  localChineseName?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  // 平台产品页返回的其他图片字段名（防御性覆盖）
  image?: string | null;
  main_image?: string | null;
  mainImage?: string | null;
  img_url?: string | null;
  picture?: string | null;
  thumb?: string | null;
  // eMAG 等平台返回的图片数组格式
  images?: (string | { url?: string; image?: string } | null)[] | null;
  // 本地多仓库存明细（后端 /store-products 可关联返回）
  warehouseStocks?: WarehouseStockEntry[] | null;
}

/**
 * 根据 warehouseId 计算该仓可用库存：stockQuantity - lockedQuantity。
 * 未选仓库或无匹配数据时返回 null。
 */
function getAvailableStock(
  warehouseStocks: WarehouseStockEntry[] | null | undefined,
  warehouseId: number | undefined | null,
): number | null {
  if (!warehouseId || !Array.isArray(warehouseStocks)) return null;
  const entry = warehouseStocks.find((s) => s.warehouseId === warehouseId);
  if (!entry) return null;
  return Math.max(0, entry.stockQuantity - (entry.lockedQuantity ?? 0));
}

/** 从 StoreProductPick 中提取图片 URL，兼容数组与平铺字段两种结构 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickImageUrl(p: any): string | null {
  if (!p) return null;

  // 1. 优先解析 images 数组（eMAG 格式：[{url:'...'}, ...]、['http...']）
  if (Array.isArray(p.images) && p.images.length > 0) {
    const first = p.images[0];
    if (typeof first === 'string' && first.trim()) return first.trim();
    if (first && typeof first.url === 'string' && first.url.trim()) return first.url.trim();
    if (first && typeof first.image === 'string' && first.image.trim()) return first.image.trim();
  }

  // 2. 兼容所有平铺 string 字段
  const candidates = [
    p.imageUrl, p.image_url, p.image,
    p.main_image, p.mainImage, p.img_url,
    p.picture, p.thumb,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }

  return null;
}

function pickPnk(p: StoreProductPick): string {
  return String(p.pnk ?? p.part_number_key ?? p.partNumber ?? p.part_number ?? '').trim();
}

function pickPlatformSku(p: Pick<StoreProductPick, 'platformSku' | 'vendorSku' | 'vendor_sku' | 'sku'>): string {
  return String(p.platformSku ?? p.vendorSku ?? p.vendor_sku ?? p.sku ?? '').trim();
}

function pickMappedInventorySku(p: Pick<StoreProductPick, 'mapped_inventory_sku' | 'mappedInventorySku' | 'inventorySku' | 'inventory_sku'>): string {
  return String(p.mapped_inventory_sku ?? p.mappedInventorySku ?? p.inventorySku ?? p.inventory_sku ?? '').trim();
}

/** 统一解析平台产品主键（兼容 id / storeProductId / store_product_id） */
function resolveStoreProductPickId(p: StoreProductPick | null | undefined): number | null {
  if (!p) return null;
  const raw = p.id ?? p.storeProductId ?? p.store_product_id;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 供 Select 搜索匹配的纯文本（与后端 keyword 检索维度对齐） */
function buildSearchLabelPlain(p: StoreProductPick): string {
  const sku = String(p.sku ?? '').trim();
  const localSku = pickMappedInventorySku(p);
  const ean = String(p.ean ?? '').trim();
  const pnk = pickPnk(p);
  const name = String(p.title ?? p.name ?? p.product_name ?? p.productName ?? '').trim();
  const cn = String(p.local_chinese_name ?? p.localChineseName ?? '').trim();
  return [localSku, sku, ean, pnk, name, cn].filter(Boolean).join(' ');
}

/** 下拉项极简展示：SKU | PNK — 中文/英文；EAN 小字 */
function ProductOptionRow({ product }: { product: StoreProductPick }) {
  const sku = pickPlatformSku(product) || '—';
  const pnk = pickPnk(product) || '—';
  const en = String(product.title ?? product.name ?? product.product_name ?? product.productName ?? '').trim() || '—';
  const cn = String(product.local_chinese_name ?? product.localChineseName ?? '').trim();
  const display = cn ? `${cn} / ${en}` : en;
  const ean = String(product.ean ?? '').trim();

  // 原生 title，鼠标悬停时显示完整信息
  const fullTitle = `[SKU: ${sku}] | [PNK: ${pnk}] — ${display}${ean ? ` (EAN: ${ean})` : ''}`;

  return (
    <div
      title={fullTitle}
      style={{ lineHeight: 1.45, padding: '4px 0', width: '100%', overflow: 'hidden' }}
    >
      {/* 主行：SKU | PNK — 名称；单行截断 */}
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: '0 6px',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      }}>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#0f172a', fontWeight: 600, flexShrink: 0 }}>
          [SKU: {sku}]
        </span>
        <span style={{ color: '#cbd5e1', flexShrink: 0 }}>|</span>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#334155', fontWeight: 600, flexShrink: 0 }}>
          [PNK: {pnk}]
        </span>
        <span style={{ color: '#475569', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
          — {display}
        </span>
      </div>
      {/* 副行：EAN 小字 */}
      {ean ? (
        <div style={{
          fontSize: 11, color: '#94a3b8', marginTop: 2,
          fontFamily: 'ui-monospace, monospace',
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>
          EAN: {ean}
        </div>
      ) : null}
    </div>
  );
}

interface ManualLineRow {
  storeProductId:  number;
  productId?:      number | null;
  platformSku:     string | null;
  inventorySku:    string | null;
  ean:             string | null;
  pnk:             string | null;
  storeProductName: string;
  imageUrl:        string | null;  // pickImageUrl 预提取结果（快速渲染用）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawProduct:      any;            // 完整原始对象，渲染时可二次兜底提取
  quantity:        number;
  warehouseStocks: WarehouseStockEntry[] | null;
}

/** 手动建单：店铺必选，产品仅能从所选店铺下搜索添加 */
function ManualCreateFbeShipmentModal({
  open,
  onCancel,
  onSuccess,
}: {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [form] = Form.useForm<{ shopId: number; warehouseId: number; shipmentNumber?: string; remark?: string }>();
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [lines, setLines] = useState<ManualLineRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [productOptions, setProductOptions] = useState<{ label: string; value: number; product: StoreProductPick }[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shopIdWatch      = Form.useWatch('shopId',      form);
  const warehouseIdWatch = Form.useWatch('warehouseId', form);

  // 打开时拉店铺、仓库列表，重置表单
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    form.resetFields();
    setLines([]);
    setProductOptions([]);

    request.get<{ code: number; data?: ShopOption[] }>('/shops').then(({ data: res }) => {
      if (cancelled) return;
      if (res.code === 200 && Array.isArray(res.data)) setShops(res.data);
      else setShops([]);
    }).catch(() => { if (!cancelled) setShops([]); });

    request.get<{ code: number; data?: Warehouse[] | { list?: Warehouse[] } }>('/warehouses').then(({ data: res }) => {
      if (cancelled) return;
      if (res.code === 200) {
        const raw = res.data;
        const list: Warehouse[] = Array.isArray(raw)
          ? raw
          : (raw && typeof raw === 'object' && Array.isArray((raw as { list?: Warehouse[] }).list))
            ? (raw as { list: Warehouse[] }).list
            : [];
        setWarehouses(list.filter((w) => w.status === 'ACTIVE'));
      }
    }).catch(() => { if (!cancelled) setWarehouses([]); });

    return () => { cancelled = true; };
  }, [open, form]);

  const fetchProductsByShop = useCallback(async (sid: number, kw: string) => {
    setSearching(true);
    try {
      const { data: res } = await request.get<{
        code: number;
        data?: StoreProductPick[] | { list?: StoreProductPick[] };
      }>('/store-products', {
        params: {
          shopId: sid,
          page: 1,
          pageSize: 50,
          // 多维混合搜索：后端优先读 keyword；兼容旧版 search
          ...(kw.trim()
            ? { keyword: kw.trim(), search: kw.trim() }
            : {}),
        },
      });
      if (res.code !== 200) {
        setProductOptions([]);
        return;
      }
      const raw = res.data;
      const list = Array.isArray(raw)
        ? raw
        : (raw && typeof raw === 'object' && Array.isArray((raw as { list?: StoreProductPick[] }).list))
          ? (raw as { list: StoreProductPick[] }).list
          : [];
      const opts = list
        .map((p) => {
          const sid = resolveStoreProductPickId(p);
          if (!sid) return null;
          return { value: sid, label: buildSearchLabelPlain(p), product: p };
        })
        .filter((o): o is { value: number; label: string; product: StoreProductPick } => o != null);
      setProductOptions(opts);
    } catch {
      setProductOptions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const onProductSearch = useCallback((kw: string) => {
    const sid = form.getFieldValue('shopId') as number | undefined;
    if (sid == null) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      fetchProductsByShop(sid, kw);
    }, 400);
  }, [form, fetchProductsByShop]);

  const addLine = useCallback((product: StoreProductPick) => {
    const pid = resolveStoreProductPickId(product);
    if (!pid) {
      message.error('所选产品缺少 storeProductId，请重新搜索选择');
      return;
    }
    const inventorySku = pickMappedInventorySku(product);
    setLines((prev) => {
      if (prev.some((r) => r.storeProductId === pid)) {
        message.warning('该产品已在列表中，请勿重复添加');
        return prev;
      }
      return [...prev, {
        storeProductId:  pid,
        productId:       product.localProductId ?? product.local_product_id ?? null,
        platformSku:     pickPlatformSku(product) || null,
        inventorySku:    inventorySku || null,
        ean:             pickFirstField([product], ['ean', 'EAN']) ?? null,
        pnk:             pickPnk(product) || null,
        storeProductName: product.title ?? product.name ?? product.product_name ?? product.productName ?? '-',
        imageUrl:        pickImageUrl(product),
        rawProduct:      product,
        quantity:        1,
        warehouseStocks: product.warehouseStocks ?? null,
      }];
    });
  }, []);

  const updateQty = useCallback((storeProductId: number, v: number | null) => {
    setLines((prev) => prev.map((r) => (r.storeProductId === storeProductId ? { ...r, quantity: v ?? 1 } : r)));
  }, []);

  const removeLine = useCallback((storeProductId: number) => {
    setLines((prev) => prev.filter((r) => r.storeProductId !== storeProductId));
  }, []);

  const handleShopChange = useCallback(() => {
    setLines([]);
    setProductOptions([]);
    form.setFieldValue('warehouseId', undefined);
  }, [form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const sid = values.shopId;
    if (lines.length === 0) {
      message.warning('请至少添加一个产品');
      return;
    }
    if (lines.some((r) => !r.quantity || r.quantity < 1)) {
      message.warning('每个产品的发货数量须大于 0');
      return;
    }
    if (lines.some((r) => !r.inventorySku)) {
      message.error('包含未关联本地 SKU 的商品，请先绑定后再发货');
      return;
    }
    if (lines.some((r) => !r.storeProductId || r.storeProductId <= 0)) {
      message.error('包含缺少 storeProductId 的商品，请重新选择后再提交');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        shopId:      sid,
        warehouseId: values.warehouseId,
        shipmentNumber: values.shipmentNumber?.trim() || undefined,
        remark:         values.remark?.trim() || undefined,
        items: lines.map((r) => ({
          storeProductId: r.storeProductId,
          quantity:       r.quantity,
        })),
      };
      console.debug('[FBE] submit payload', payload);
      const { data: res } = await request.post<{ code: number; message: string }>(
        '/fbe-shipments',
        payload,
      );
      if (res.code === 200) {
        message.success(res.message || '发货单创建成功');
        onSuccess();
      } else {
        message.error(res.message || '创建失败');
      }
    } catch (err: unknown) {
      // 透传后端返回的具体错误信息（包含 4xx/5xx 状态码场景）
      type AxiosErr = { response?: { status?: number; data?: { message?: string } }; message?: string };
      const e = err as AxiosErr;
      const status = e?.response?.status;
      const serverMsg = e?.response?.data?.message;
      if (status === 413) {
        message.error('请求体过大，请减少单次提交的产品数量（建议每次不超过 200 件）');
      } else if (serverMsg) {
        message.error(`提交失败：${serverMsg}`);
      } else {
        message.error('网络异常，请检查网络后重试');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={<span><PlusOutlined style={{ color: '#2563eb', marginRight: 8 }} />新建发货单</span>}
      width={800}
      centered
      open={open}
      onCancel={onCancel}
      destroyOnClose
      maskClosable={false}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" loading={submitting} onClick={handleSubmit}>
            提交创建
          </Button>
        </div>
      }
    >
      <Form form={form} layout="vertical">
        <div style={{ display: 'flex', gap: 12 }}>
          <Form.Item
            name="shopId"
            label="店铺"
            rules={[{ required: true, message: '请选择店铺' }]}
            style={{ flex: 1, marginBottom: 12 }}
          >
            <Select
              placeholder="请选择店铺"
              allowClear
              showSearch
              optionFilterProp="label"
              onChange={handleShopChange}
              options={shops.map((s) => {
                const region = s.region ?? s.site;
                return {
                  value: s.id,
                  label: region ? `${s.shopName} (${s.platform} · ${region})` : `${s.shopName} (${s.platform})`,
                };
              })}
            />
          </Form.Item>
          <Form.Item
            name="warehouseId"
            label="出库仓库"
            rules={[{ required: true, message: '请选择出库仓库' }]}
            style={{ flex: 1, marginBottom: 12 }}
          >
            <Select
              placeholder="请选择出库仓库"
              allowClear
              showSearch
              optionFilterProp="label"
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            />
          </Form.Item>
        </div>
        <Form.Item name="shipmentNumber" label="发货单号" style={{ marginBottom: 12 }}>
          <Input placeholder="留空则系统自动生成" maxLength={80} />
        </Form.Item>
        <Form.Item name="remark" label="备注" style={{ marginBottom: 4 }}>
          <Input.TextArea placeholder="选填" rows={2} maxLength={500} showCount />
        </Form.Item>
      </Form>

      <div style={{ marginTop: 8 }}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>发货明细</Text>
        {!shopIdWatch ? (
          <Alert type="info" showIcon message="请先选择店铺" description="选择店铺后，可搜索并添加该平台下的产品。" style={{ marginBottom: 12 }} />
        ) : (
          <>
            <Select
              key={`${shopIdWatch}-${lines.length}`}
              showSearch
              allowClear
              placeholder="输入 SKU / EAN / PNK / 名称搜索并选择添加"
              filterOption={(input, option) => {
                const keyword = input.toLowerCase().trim();
                if (!keyword) return true;
                const p = productOptions.find((o) => o.value === option?.value)?.product;
                if (!p) return false;
                const sku = (p.sku ?? '').toLowerCase();
                const ean = (p.ean ?? '').toLowerCase();
                const pnk = pickPnk(p).toLowerCase();
                const name = (p.title ?? p.name ?? p.product_name ?? p.productName ?? '').toLowerCase();
                const cn = (p.local_chinese_name ?? p.localChineseName ?? '').toLowerCase();
                return (
                  sku.includes(keyword)
                  || ean.includes(keyword)
                  || pnk.includes(keyword)
                  || name.includes(keyword)
                  || cn.includes(keyword)
                );
              }}
              loading={searching}
              options={productOptions.map(({ label, value }) => ({ label, value }))}
              optionRender={(oriOption) => {
                const p = productOptions.find((o) => o.value === oriOption.value)?.product;
                if (!p) return <span>{String(oriOption.label ?? '')}</span>;
                return <ProductOptionRow product={p} />;
              }}
              onSearch={onProductSearch}
              onOpenChange={(dropdownOpen) => {
                if (dropdownOpen && shopIdWatch) fetchProductsByShop(shopIdWatch, '');
              }}
              onSelect={(value: number | string) => {
                const sid = Number(value);
                const found = productOptions.find((o) => o.value === sid || Number(o.value) === sid);
                if (found?.product) addLine(found.product);
                else message.error('未能识别所选平台产品，请重新搜索选择');
              }}
              notFoundContent={searching ? <Spin size="small" /> : '无匹配产品'}
              popupMatchSelectWidth
              style={{ width: '100%', marginBottom: 12 }}
            />
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
              仅展示当前店铺下的平台产品；库存校验将在转入配货中时执行。
            </Text>
          </>
        )}
        <Table<ManualLineRow>
          size="small"
          rowKey="storeProductId"
          dataSource={lines}
          pagination={false}
          locale={{ emptyText: shopIdWatch ? '请点击上方搜索框添加产品' : '—' }}
          columns={[
            {
              title: '图片',
              key: 'img',
              width: 64,
              align: 'center' as const,
              render: (_: unknown, r: ManualLineRow) => {
                // 二次兜底：预提取失败时从完整原始对象再查一次
                const imgSrc = r.imageUrl ?? pickImageUrl(r.rawProduct) ?? '';
                // 调试：开发阶段可在控制台确认图片字段结构
                console.debug('[FBE建单] 行图片数据 →', {
                  storeProductId: r.storeProductId,
                  productId: r.productId,
                  platformSku: r.platformSku,
                  inventorySku: r.inventorySku,
                  imageUrl_cached: r.imageUrl,
                  imageUrl_refetch: pickImageUrl(r.rawProduct),
                  raw_keys: r.rawProduct ? Object.keys(r.rawProduct) : [],
                  raw_image: r.rawProduct?.image,
                  raw_images: r.rawProduct?.images,
                  raw_imageUrl: r.rawProduct?.imageUrl,
                  raw_main_image: r.rawProduct?.main_image,
                });
                return (
                  <Image
                    src={imgSrc}
                    referrerPolicy="no-referrer"
                    width={44}
                    height={44}
                    style={{ objectFit: 'contain', borderRadius: 6, border: '1px solid #f0f0f0' }}
                    fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'%3E%3Crect fill='%23f5f5f5' width='44' height='44' rx='6'/%3E%3Ctext x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='8'%3E无图%3C/text%3E%3C/svg%3E"
                    preview={false}
                  />
                );
              },
            },
            {
              title: '平台产品',
              key: 'platformInfo',
              render: (_: unknown, r: ManualLineRow) => (
                <ShipmentItemInfoCell
                  sku={r.platformSku || '-'}
                  name={r.storeProductName}
                  ean={r.ean}
                  pnk={r.pnk}
                  inventorySku={r.inventorySku}
                  platformUrl={pickFirstField(
                    [r.rawProduct],
                    ['productUrl', 'product_url', 'platformProductUrl', 'platform_product_url'],
                  )}
                  linkTypeLabel="待发货"
                  linkTypeStyle={FBE_LINK_TAG_STYLE.default}
                  maxNameWidth={220}
                />
              ),
            },
            {
              title: '该仓可用库存',
              key: 'avail',
              width: 110,
              align: 'center' as const,
              render: (_: unknown, r: ManualLineRow) => {
                const avail = getAvailableStock(r.warehouseStocks, warehouseIdWatch);
                if (avail === null) return <Text type="secondary" style={{ fontSize: 12 }}>-</Text>;
                const color = avail <= 0 ? '#ef4444' : avail < 10 ? '#f59e0b' : '#22c55e';
                return <span style={{ fontWeight: 700, color, fontFeatureSettings: '"tnum"' }}>{avail}</span>;
              },
            },
            {
              title: '本次发货数量',
              key: 'qty',
              width: 140,
              align: 'center',
              render: (_: unknown, r: ManualLineRow) => {
                return (
                  <InputNumber
                    min={1}
                    precision={0}
                    value={r.quantity}
                    style={{ width: 100 }}
                    onChange={(v) => updateQty(r.storeProductId, v)}
                  />
                );
              },
            },
            {
              title: '操作',
              key: 'op',
              width: 72,
              align: 'center',
              render: (_: unknown, r: ManualLineRow) => (
                <Button type="link" danger size="small" onClick={() => removeLine(r.storeProductId)}>删除</Button>
              ),
            },
          ]}
        />
      </div>
    </Modal>
  );
}

// ─── 创建 FBE 发货单弹窗（供 PlatformProducts 调用）─────────────
interface CreateShipmentRow {
  storeProductId:  number;
  productId?:      number | null;
  platformSku:     string | null;
  inventorySku:    string | null;
  ean:             string | null;
  pnk:             string | null;
  storeProductName: string;
  imageUrl:        string | null;
  quantity:        number;
  warehouseStocks: WarehouseStockEntry[] | null;
}

export interface CreateFbeShipmentModalProps {
  open:     boolean;
  shopId?:  number | null;
  products: {
    id: number;
    sku?: string | null;
    platformSku?: string | null;
    vendorSku?: string | null;
    vendor_sku?: string | null;
    mapped_inventory_sku?: string | null;
    mappedInventorySku?: string | null;
    inventorySku?: string | null;
    inventory_sku?: string | null;
    localProductId?: number | null;
    local_product_id?: number | null;
    ean?: string | null;
    pnk?: string | null;
    part_number_key?: string | null;
    part_number?: string | null;
    partNumber?: string | null;
    title?: string | null;
    name?: string | null;
    imageUrl?: string | null;
    image_url?: string | null;
    warehouseStocks?: WarehouseStockEntry[] | null;
  }[];
  onCancel:  () => void;
  onSuccess: () => void;
}

export function CreateFbeShipmentModal({ open, shopId, products, onCancel, onSuccess }: CreateFbeShipmentModalProps) {
  const [rows,        setRows]        = useState<CreateShipmentRow[]>([]);
  const [remark,      setRemark]      = useState('');
  const [shipmentNo,  setShipmentNo]  = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [warehouses,  setWarehouses]  = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setRemark('');
      setShipmentNo('');
      setWarehouseId(undefined);
      setRows(products.map((p) => ({
        storeProductId:  resolveStoreProductPickId(p) ?? p.id,
        productId:       p.localProductId ?? p.local_product_id ?? null,
        platformSku:     pickPlatformSku(p) || null,
        inventorySku:    pickMappedInventorySku(p) || null,
        ean:             pickFirstField([p], ['ean', 'EAN']) ?? null,
        pnk:             pickPnk(p) || null,
        storeProductName: p.title ?? p.name ?? '-',
        imageUrl:        p.imageUrl ?? p.image_url ?? null,
        quantity:        1,
        warehouseStocks: p.warehouseStocks ?? null,
      })));

      // 拉取 ACTIVE 仓库列表
      request.get<{ code: number; data?: Warehouse[] | { list?: Warehouse[] } }>('/warehouses')
        .then(({ data: res }) => {
          if (res.code === 200) {
            const raw = res.data;
            const list: Warehouse[] = Array.isArray(raw)
              ? raw
              : (raw && typeof raw === 'object' && Array.isArray((raw as { list?: Warehouse[] }).list))
                ? (raw as { list: Warehouse[] }).list
                : [];
            setWarehouses(list.filter((w) => w.status === 'ACTIVE'));
          }
        })
        .catch(() => setWarehouses([]));
    }
  }, [open, products]);

  const updateQty = useCallback((id: number, v: number | null) => {
    setRows((prev) => prev.map((r) => r.storeProductId === id ? { ...r, quantity: v ?? 1 } : r));
  }, []);

  const handleConfirm = async () => {
    if (shopId == null) {
      message.warning('缺少店铺信息，请先在页面上方选择店铺');
      return;
    }
    if (!warehouseId) { message.warning('请选择出库仓库'); return; }
    if (rows.some((r) => r.quantity < 1)) { message.warning('发货数量不能小于 1'); return; }
    if (rows.some((r) => !r.inventorySku)) {
      message.error('包含未关联本地 SKU 的商品，请先绑定后再发货');
      return;
    }
    if (rows.some((r) => !r.storeProductId || r.storeProductId <= 0)) {
      message.error('包含缺少 storeProductId 的商品，请重新选择后再提交');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        shopId,
        warehouseId,
        shipmentNumber: shipmentNo.trim() || undefined,
        remark: remark.trim() || undefined,
        items: rows.map((r) => ({
          storeProductId: r.storeProductId,
          quantity:       r.quantity,
        })),
      };
      console.debug('[FBE] submit payload', payload);
      const { data: res } = await request.post<{ code: number; message: string }>(
        '/fbe-shipments',
        payload,
      );
      if (res.code === 200) {
        message.success(res.message || '发货单创建成功');
        onSuccess();
      } else {
        message.error(res.message || '创建失败');
      }
    } catch (err: unknown) {
      type AxiosErr = { response?: { status?: number; data?: { message?: string } }; message?: string };
      const e = err as AxiosErr;
      const status = e?.response?.status;
      const serverMsg = e?.response?.data?.message;
      if (status === 413) {
        message.error('请求体过大，请减少单次提交的产品数量（建议每次不超过 200 件）');
      } else if (serverMsg) {
        message.error(`提交失败：${serverMsg}`);
      } else {
        message.error('网络异常，请检查网络后重试');
      }
    } finally { setSubmitting(false); }
  };

  return (
    <Modal
      title={<span><SendOutlined style={{ color: '#2563eb', marginRight: 8 }} />创建 FBE 发货单</span>}
      open={open}
      onCancel={onCancel}
      width={800}
      centered
      maskClosable={false}
      onOk={handleConfirm}
      confirmLoading={submitting}
      okText="确认创建"
      cancelText="取消"
      destroyOnClose
    >
      {/* 出库仓库（必填） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ flexShrink: 0, color: '#64748b', fontSize: 13, width: 72 }}>
          <span style={{ color: '#ef4444', marginRight: 3 }}>*</span>出库仓库：
        </span>
        <Select
          placeholder="请选择出库仓库"
          allowClear
          showSearch
          optionFilterProp="label"
          value={warehouseId}
          onChange={(v) => setWarehouseId(v)}
          options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
          style={{ flex: 1 }}
        />
      </div>

      <Table
        size="small"
        rowKey="storeProductId"
        dataSource={rows}
        pagination={false}
        style={{ marginBottom: 16 }}
        locale={{ emptyText: '无已选产品' }}
        columns={[
          {
            title: '产品',
            key: 'product',
            render: (_: unknown, r: CreateShipmentRow) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Image
                  src={r.imageUrl ?? ''}
                  referrerPolicy="no-referrer"
                  width={40}
                  height={40}
                  style={{ objectFit: 'contain', borderRadius: 4, border: '1px solid #f0f0f0', flexShrink: 0 }}
                  fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Crect fill='%23f5f5f5' width='40' height='40' rx='4'/%3E%3Ctext x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='8'%3E无图%3C/text%3E%3C/svg%3E"
                  preview={false}
                />
                <div style={{ minWidth: 0 }}>
                  <Text ellipsis style={{ display: 'block', maxWidth: 210 }}>{r.storeProductName}</Text>
                  <Text code type="secondary" style={{ fontSize: 12 }}>{r.platformSku || '-'}</Text>
                  <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.35 }}>
                    EAN：{r.ean || '-'} | PNK：{r.pnk || '-'}
                  </div>
                  {r.inventorySku ? (
                    <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.35 }}>
                      库存SKU：{r.inventorySku}
                    </div>
                  ) : null}
                </div>
              </div>
            ),
          },
          {
            title: '该仓可用库存',
            key: 'avail',
            width: 105,
            align: 'center' as const,
            render: (_: unknown, r: CreateShipmentRow) => {
              const avail = getAvailableStock(r.warehouseStocks, warehouseId);
              if (avail === null) return <Text type="secondary" style={{ fontSize: 12 }}>-</Text>;
              const color = avail <= 0 ? '#ef4444' : avail < 10 ? '#f59e0b' : '#22c55e';
              return <span style={{ fontWeight: 700, color, fontFeatureSettings: '"tnum"' }}>{avail}</span>;
            },
          },
          {
            title: '本次发货量',
            key: 'qty',
            width: 130,
            align: 'center' as const,
            render: (_: unknown, r: CreateShipmentRow) => {
              return (
                <InputNumber
                  value={r.quantity}
                  min={1}
                  precision={0}
                  size="small"
                  style={{ width: 90 }}
                  suffix="件"
                  onChange={(v) => updateQty(r.storeProductId, v)}
                />
              );
            },
          },
        ]}
      />
      <Text type="secondary" style={{ display: 'block', fontSize: 12, margin: '-8px 0 12px' }}>
        库存校验将在转入配货中时执行。
      </Text>
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flexShrink: 0, color: '#64748b', fontSize: 13, width: 72 }}>发货单号：</span>
          <Input
            placeholder="不填则系统自动生成"
            value={shipmentNo}
            onChange={(e) => setShipmentNo(e.target.value)}
            maxLength={60}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flexShrink: 0, color: '#64748b', fontSize: 13, width: 72 }}>备注：</span>
          <Input
            placeholder="可填写本批次发货说明（选填）"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            maxLength={200}
          />
        </div>
      </Space>
    </Modal>
  );
}

// ─── 费用登记弹窗 ────────────────────────────────────────────────
interface CostsModalProps {
  record:    FbeShipment | null;
  onCancel:  () => void;
  onSuccess: () => void;
}

function CostsModal({ record, onCancel, onSuccess }: CostsModalProps) {
  const [form]       = Form.useForm<{ overseasFreight: number | null; domesticFreight: number | null }>();
  const [submitting, setSubmitting] = useState(false);

  // 每次打开时将已有费用回显到表单
  useEffect(() => {
    if (record) {
      form.setFieldsValue({
        overseasFreight: record.overseasFreight ?? null,
        domesticFreight: record.domesticFreight ?? null,
      });
    } else {
      form.resetFields();
    }
  }, [record, form]);

  const handleOk = async () => {
    let values: { overseasFreight: number | null; domesticFreight: number | null };
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    if (!record) return;
    setSubmitting(true);
    try {
      const { data: res } = await request.patch<{ code: number; message: string }>(
        `/fbe-shipments/${record.id}/costs`,
        {
          overseasFreight: values.overseasFreight ?? null,
          domesticFreight: values.domesticFreight ?? null,
        },
      );
      if (res.code === 200) {
        message.success(res.message || '费用已保存');
        onSuccess();
      } else {
        message.error(res.message || '保存失败，请重试');
      }
    } catch {
      message.error('网络异常，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const no = record ? (record.shipmentNo || record.shipmentNumber || `#${record.id}`) : '';

  return (
    <Modal
      title={
        <span>
          <DollarOutlined style={{ color: '#d97706', marginRight: 8 }} />
          费用登记
        </span>
      }
      open={!!record}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={submitting}
      okText="保存"
      cancelText="取消"
      width={420}
      destroyOnClose
      maskClosable={false}
    >
      {/* 发货单号标题区 */}
      <div style={{
        background: '#f8fafc', border: '1px solid #e2e8f0',
        borderRadius: 8, padding: '8px 12px', marginBottom: 20,
        fontSize: 13, color: '#64748b',
      }}>
        发货单：<Text code style={{ fontSize: 13 }}>{no}</Text>
      </div>

      <Form form={form} layout="vertical">
        <Form.Item
          name="overseasFreight"
          label="海外头程费用"
          rules={[{ type: 'number', min: 0, message: '请输入有效金额' }]}
        >
          <InputNumber
            prefix="¥"
            min={0}
            precision={2}
            placeholder="请输入海外头程费用"
            style={{ width: '100%' }}
          />
        </Form.Item>
        <Form.Item
          name="domesticFreight"
          label="国内运输费用"
          rules={[{ type: 'number', min: 0, message: '请输入有效金额' }]}
          style={{ marginBottom: 0 }}
        >
          <InputNumber
            prefix="¥"
            min={0}
            precision={2}
            placeholder="请输入国内运输费用"
            style={{ width: '100%' }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ─── 库存不足图标（供外部引用）──────────────────────────────────
export { WarningOutlined as InsufficientStockIcon };
