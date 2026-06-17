import { useEffect, useMemo, useState } from 'react';
import type { Key } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Empty,
  Input,
  Modal,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import request from '../lib/request';

const { Text } = Typography;
const MAX_BATCH_ITEMS = 5;
const DEFAULT_REASON = '批量抢车：运营确认执行';

interface ApiResponse<T> {
  code: number | string;
  data?: T | null;
  message?: string;
}

interface GrabCartCandidate {
  key: string;
  storeProductId: number | null;
  sku: string;
  pnk: string;
  productName: string;
  currentSalePriceExVat: number | null;
  cartPriceExVat: number | null;
  suggestedGrabPriceExVat: number | null;
  finalMinPrice: number | null;
  estimatedProfitAfter: number | null;
  profitMarginPctAfter: number | null;
  stock: number | null;
  buyButtonRank: number | null;
  buyBoxStatus: string | null;
  riskLevel: string | null;
  selectable: boolean;
  unselectableReason: string | null;
  currency: string | null;
}

interface BatchExecuteItemResult {
  key: string;
  storeProductId: number | null;
  sku: string;
  status: string | null;
  code: string | number | null;
  oldSalePriceExVat: number | null;
  newSalePriceExVat: number | null;
  readBackStatus: string | null;
  readBackPrice: number | null;
  readBackWarning: string | null;
  message: string | null;
}

interface BatchExecuteResult {
  batchId: string | number | null;
  total: number | null;
  success: number | null;
  skipped: number | null;
  blocked: number | null;
  failed: number | null;
  pendingConfirm: number | null;
  items: BatchExecuteItemResult[];
}

interface ReadinessSummary {
  totalStoreProducts: number | null;
  resellCount: number | null;
  resellWithStockCount: number | null;
  mappedProductCount: number | null;
  fbeFeeReadyCount: number | null;
  commissionReadyCount: number | null;
  cartPriceTaxModeReady: boolean | null;
  previewOkCount: number | null;
  candidateCount: number | null;
}

interface ReadinessBlocker {
  code: string;
  count: number | null;
  message: string | null;
}

interface GrabCartReadiness {
  autoIntegrationMessage: string | null;
  summary: ReadinessSummary;
  blockers: ReadinessBlocker[];
  nextActions: string[];
}

interface PlatformProductGrabCartBatchModalProps {
  open: boolean;
  shopId: number | null;
  currency?: string | null;
  onCancel: () => void;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function pickBool(...values: unknown[]): boolean | null {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
  }
  return null;
}

function normalizeEnumValue(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function normalizePercentValue(value: number | null): number | null {
  if (value == null) return null;
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function formatMoney(value: number | null | undefined, currency?: string | null): string {
  if (value == null || Number.isNaN(Number(value))) return '-';
  const suffix = String(currency ?? '').trim();
  return suffix ? `${Number(value).toFixed(4)} ${suffix}` : Number(value).toFixed(4);
}

function formatMoneyCompact(value: number | null | undefined, currency?: string | null): string {
  if (value == null || Number.isNaN(Number(value))) return '-';
  const suffix = String(currency ?? '').trim();
  return suffix ? `${Number(value).toFixed(2)} ${suffix}` : Number(value).toFixed(2);
}

function formatPct(value: number | null | undefined): string {
  const normalized = normalizePercentValue(value ?? null);
  if (normalized == null) return '-';
  return `${normalized.toFixed(2)}%`;
}

function getCandidateTotal(payload: unknown): number | null {
  if (Array.isArray(payload)) return payload.length;
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, unknown>;
  return toNumber(data.total ?? data.totalCount ?? data.count ?? data.candidateCount ?? data.candidate_count);
}

function isCandidatesEmpty(payload: unknown, list: GrabCartCandidate[]): boolean {
  const total = getCandidateTotal(payload);
  if (total != null) return total === 0;
  return list.length === 0;
}

function normalizeNextActions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === 'string') return item.trim();
    if (item && typeof item === 'object') {
      const data = item as Record<string, unknown>;
      return pickString(data.message, data.label, data.text, data.action, data.title) ?? '';
    }
    return '';
  }).filter(Boolean);
}

function normalizeReadinessBlocker(raw: unknown, index: number): ReadinessBlocker {
  if (typeof raw === 'string') {
    return { code: raw, count: null, message: null };
  }
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    code: pickString(data.code, data.blockCode, data.block_code) ?? `BLOCKER_${index + 1}`,
    count: toNumber(data.count ?? data.total ?? data.quantity),
    message: pickString(data.message, data.description, data.reason),
  };
}

function normalizeReadinessSummary(raw: unknown): ReadinessSummary {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    totalStoreProducts: toNumber(data.totalStoreProducts ?? data.total_store_products),
    resellCount: toNumber(data.resellCount ?? data.resell_count),
    resellWithStockCount: toNumber(data.resellWithStockCount ?? data.resell_with_stock_count),
    mappedProductCount: toNumber(data.mappedProductCount ?? data.mapped_product_count),
    fbeFeeReadyCount: toNumber(data.fbeFeeReadyCount ?? data.fbe_fee_ready_count),
    commissionReadyCount: toNumber(data.commissionReadyCount ?? data.commission_ready_count),
    cartPriceTaxModeReady: pickBool(data.cartPriceTaxModeReady, data.cart_price_tax_mode_ready),
    previewOkCount: toNumber(data.previewOkCount ?? data.preview_ok_count),
    candidateCount: toNumber(data.candidateCount ?? data.candidate_count),
  };
}

function normalizeReadiness(raw: unknown): GrabCartReadiness | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const autoIntegration = data.autoIntegration ?? data.auto_integration;
  const autoIntegrationObj = autoIntegration && typeof autoIntegration === 'object'
    ? autoIntegration as Record<string, unknown>
    : null;
  const blockersRaw = data.blockers ?? data.blockerList ?? data.blocker_list;
  return {
    autoIntegrationMessage: pickString(
      autoIntegrationObj?.message,
      typeof autoIntegration === 'string' ? autoIntegration : null,
      data.autoIntegrationMessage,
      data.auto_integration_message,
    ),
    summary: normalizeReadinessSummary(data.summary),
    blockers: Array.isArray(blockersRaw)
      ? blockersRaw.map((item, index) => normalizeReadinessBlocker(item, index))
      : [],
    nextActions: normalizeNextActions(data.nextActions ?? data.next_actions),
  };
}

function formatReadyFlag(value: boolean | null): string {
  if (value == null) return '-';
  return value ? '是' : '否';
}

function getCandidateList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const data = payload as Record<string, unknown>;
  if (Array.isArray(data.list)) return data.list;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.rows)) return data.rows;
  return [];
}

function normalizeCandidate(raw: unknown, index: number): GrabCartCandidate {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const storeProductId = toNumber(data.storeProductId ?? data.store_product_id ?? data.id);
  return {
    key: String(storeProductId ?? `candidate-${index}`),
    storeProductId,
    sku: pickString(data.sku, data.vendorSku, data.vendor_sku) ?? '-',
    pnk: pickString(data.pnk, data.partNumberKey, data.part_number_key, data.partNumber, data.part_number) ?? '-',
    productName: pickString(data.productName, data.product_name, data.title, data.name) ?? '-',
    currentSalePriceExVat: toNumber(data.currentSalePriceExVat ?? data.current_sale_price_ex_vat),
    cartPriceExVat: toNumber(data.cartPriceExVat ?? data.cart_price_ex_vat),
    suggestedGrabPriceExVat: toNumber(data.suggestedGrabPriceExVat ?? data.suggested_grab_price_ex_vat),
    finalMinPrice: toNumber(data.finalMinPrice ?? data.final_min_price),
    estimatedProfitAfter: toNumber(data.estimatedProfitAfter ?? data.estimated_profit_after),
    profitMarginPctAfter: toNumber(data.profitMarginPctAfter ?? data.profit_margin_pct_after),
    stock: toNumber(data.stock ?? data.platformStock ?? data.platform_stock),
    buyButtonRank: toNumber(data.buyButtonRank ?? data.buy_button_rank ?? data.buyBoxRank ?? data.buy_box_rank),
    buyBoxStatus: pickString(data.buyBoxStatus, data.buy_box_status),
    riskLevel: pickString(data.riskLevel, data.risk_level),
    selectable: data.selectable === true,
    unselectableReason: pickString(data.unselectableReason, data.unselectable_reason),
    currency: pickString(data.currency),
  };
}

function getCandidateDisabledReason(candidate: GrabCartCandidate): string | null {
  if (!candidate.storeProductId) return '缺少平台产品ID';
  if (candidate.selectable !== true) return candidate.unselectableReason || '后端判定不可勾选';
  if (candidate.suggestedGrabPriceExVat == null) return '缺少建议抢车价';
  if (candidate.finalMinPrice == null) return '缺少最低保护价';
  if (candidate.suggestedGrabPriceExVat < candidate.finalMinPrice) return '建议抢车价低于最低保护价';
  const profitPct = normalizePercentValue(candidate.profitMarginPctAfter);
  if (profitPct == null) return '缺少毛利率';
  if (profitPct < 10) return '毛利率低于 10%';
  return null;
}

function normalizeResultItem(raw: unknown, index: number): BatchExecuteItemResult {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const storeProductId = toNumber(data.storeProductId ?? data.store_product_id);
  return {
    key: String(storeProductId ?? data.sku ?? `result-${index}`),
    storeProductId,
    sku: pickString(data.sku, data.vendorSku, data.vendor_sku) ?? '-',
    status: pickString(data.status),
    code: pickString(data.code) ?? (data.code != null ? String(data.code) : null),
    oldSalePriceExVat: toNumber(data.oldSalePriceExVat ?? data.old_sale_price_ex_vat),
    newSalePriceExVat: toNumber(data.newSalePriceExVat ?? data.new_sale_price_ex_vat),
    readBackStatus: pickString(data.readBackStatus, data.read_back_status),
    readBackPrice: toNumber(data.readBackPrice ?? data.read_back_price),
    readBackWarning: pickString(data.readBackWarning, data.read_back_warning),
    message: pickString(data.message, data.errorMessage, data.error_message),
  };
}

function normalizeBatchResult(raw: unknown): BatchExecuteResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const rawItems = Array.isArray(data.items)
    ? data.items
    : Array.isArray(data.results)
      ? data.results
      : [];
  return {
    batchId: (data.batchId ?? data.batch_id) as string | number | null | undefined ?? null,
    total: toNumber(data.total),
    success: toNumber(data.success),
    skipped: toNumber(data.skipped),
    blocked: toNumber(data.blocked),
    failed: toNumber(data.failed),
    pendingConfirm: toNumber(data.pendingConfirm ?? data.pending_confirm),
    items: rawItems.map((item, index) => normalizeResultItem(item, index)),
  };
}

function renderStatusTag(record: BatchExecuteItemResult) {
  const status = normalizeEnumValue(record.status);
  const code = normalizeEnumValue(record.code);
  const readBackStatus = normalizeEnumValue(record.readBackStatus);

  if (status === 'SUCCESS' && readBackStatus === 'CONFIRMED') return <Tag color="success">已执行并确认</Tag>;
  if (status === 'SUCCESS' && readBackStatus === 'UNCONFIRMED') return <Tag color="warning">已发送改价，等待 eMAG 延迟确认</Tag>;
  if (status === 'SKIPPED' || code === 'DRY_RUN_ONLY') return <Tag color="warning">安全模式，未真实改价</Tag>;
  if (status === 'BLOCKED') return <Tag color="error">已阻断</Tag>;
  if (status === 'FAILED') return <Tag color="error">执行失败</Tag>;
  return <Tag>{status || code || '-'}</Tag>;
}

export default function PlatformProductGrabCartBatchModal({
  open,
  shopId,
  currency,
  onCancel,
}: PlatformProductGrabCartBatchModalProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [candidates, setCandidates] = useState<GrabCartCandidate[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [reason, setReason] = useState(DEFAULT_REASON);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<BatchExecuteResult | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readiness, setReadiness] = useState<GrabCartReadiness | null>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);

  const selectedCandidates = useMemo(
    () => candidates.filter((item) => selectedRowKeys.includes(item.key)),
    [candidates, selectedRowKeys],
  );
  const modalCurrency = selectedCandidates[0]?.currency ?? candidates[0]?.currency ?? currency ?? '';
  const reasonValid = reason.trim().length >= 10 && reason.trim().length <= 500;
  const canSubmit = selectedCandidates.length >= 1 && selectedCandidates.length <= MAX_BATCH_ITEMS && reasonValid && !submitting;

  useEffect(() => {
    if (!open) return;
    setCandidates([]);
    setSelectedRowKeys([]);
    setReason(DEFAULT_REASON);
    setBatchResult(null);
    setErrorMessage(null);
    setReadiness(null);
    setReadinessError(null);
    setReadinessLoading(false);

    if (!shopId) {
      setErrorMessage('请先选择店铺后再打开抢车候选池');
      return;
    }

    let cancelled = false;

    const loadReadiness = async () => {
      setReadinessLoading(true);
      setReadinessError(null);
      setReadiness(null);
      try {
        const { data: res } = await request.get<ApiResponse<unknown>>('/store-products/grab-cart/readiness', {
          params: { shopId },
        });
        if (cancelled) return;
        if (res.code === 200 && res.data) {
          setReadiness(normalizeReadiness(res.data));
        } else {
          setReadinessError(res.message || '加载准备漏斗失败');
        }
      } catch (err) {
        if (!cancelled) {
          const e = err as { response?: { data?: { message?: string; errorMessage?: string } }; message?: string };
          setReadinessError(
            e.response?.data?.message || e.response?.data?.errorMessage || e.message || '加载准备漏斗失败',
          );
        }
      } finally {
        if (!cancelled) setReadinessLoading(false);
      }
    };

    const loadCandidates = async () => {
      setLoading(true);
      try {
        const { data: res } = await request.get<ApiResponse<unknown>>('/store-products/grab-cart/candidates', {
          params: { shopId, page: 1, pageSize: 50 },
        });
        if (cancelled) return;
        if (res.code === 200) {
          const list = getCandidateList(res.data).map((item, index) => normalizeCandidate(item, index));
          setCandidates(list);
          if (isCandidatesEmpty(res.data, list)) {
            await loadReadiness();
          }
        } else {
          setCandidates([]);
          setErrorMessage(res.message || '加载抢车候选池失败');
        }
      } catch (err) {
        if (!cancelled) {
          const e = err as { response?: { data?: { message?: string; errorMessage?: string } }; message?: string };
          setErrorMessage(e.response?.data?.message || e.response?.data?.errorMessage || e.message || '加载抢车候选池失败');
          setCandidates([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadCandidates();
    return () => {
      cancelled = true;
    };
  }, [open, shopId]);

  const handleSelectionChange = (keys: Key[]) => {
    if (keys.length > MAX_BATCH_ITEMS) {
      message.warning(`一次最多选择 ${MAX_BATCH_ITEMS} 个 SKU`);
      return;
    }
    setSelectedRowKeys(keys);
  };

  const executeBatch = async () => {
    if (!shopId || !canSubmit) return;
    setSubmitting(true);
    setBatchResult(null);
    try {
      const items = selectedCandidates.map((item) => ({
        storeProductId: item.storeProductId,
        confirmedPriceExVat: item.suggestedGrabPriceExVat,
      }));
      const { data: res } = await request.post<ApiResponse<unknown>>('/store-products/grab-cart/batch-execute', {
        shopId,
        reason: reason.trim(),
        items,
      });
      const result = normalizeBatchResult(res.data);
      if (res.code === 200 && result) {
        setBatchResult(result);
        message.success(`批量抢车请求已返回，batchId：${result.batchId ?? '-'}`);
      } else {
        message.error(res.message || '批量抢车失败');
      }
    } catch (err) {
      const e = err as { response?: { data?: { message?: string; errorMessage?: string } }; message?: string };
      message.error(e.response?.data?.message || e.response?.data?.errorMessage || e.message || '批量抢车失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBatchConfirm = () => {
    if (!canSubmit) {
      if (!reasonValid) message.warning('执行原因必须填写 10-500 字');
      return;
    }
    Modal.confirm({
      title: `确认批量抢车（${selectedCandidates.length} 个 SKU）`,
      width: 760,
      okText: '确认批量抢车',
      cancelText: '取消',
      content: (
        <div>
          <Alert
            type="warning"
            showIcon
            message="请确认以下建议价均来自后端候选池，前端不会自行计算抢车价。"
            style={{ marginBottom: 12 }}
          />
          <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
            {selectedCandidates.map((item) => (
              <div key={item.key} style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                <Text strong>{item.sku}</Text>
                <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>PNK: {item.pnk}</Text>
                <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
                  当前价：{formatMoneyCompact(item.currentSalePriceExVat, modalCurrency)} ｜ 建议价：{formatMoneyCompact(item.suggestedGrabPriceExVat, modalCurrency)}
                  {' '}｜ 最低保护价：{formatMoneyCompact(item.finalMinPrice, modalCurrency)} ｜ 毛利率：{formatPct(item.profitMarginPctAfter)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
      onOk: executeBatch,
    });
  };

  const columns: ColumnsType<GrabCartCandidate> = [
    {
      title: 'SKU / PNK',
      dataIndex: 'sku',
      width: 148,
      fixed: 'left',
      render: (_: unknown, record) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ fontSize: 13 }}>{record.sku}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.pnk}</Text>
        </Space>
      ),
    },
    {
      title: '价格（不含 VAT）',
      width: 168,
      render: (_: unknown, record) => (
        <Space direction="vertical" size={0} style={{ fontSize: 12, lineHeight: '20px' }}>
          <Text>当前：{formatMoneyCompact(record.currentSalePriceExVat, modalCurrency)}</Text>
          <Text>购物车：{formatMoneyCompact(record.cartPriceExVat, modalCurrency)}</Text>
          <Text strong style={{ color: '#16a34a' }}>建议：{formatMoneyCompact(record.suggestedGrabPriceExVat, modalCurrency)}</Text>
        </Space>
      ),
    },
    {
      title: '保护价 / 毛利率',
      width: 132,
      render: (_: unknown, record) => (
        <Space direction="vertical" size={0} style={{ fontSize: 12, lineHeight: '20px' }}>
          <Text>保护价：{formatMoneyCompact(record.finalMinPrice, modalCurrency)}</Text>
          <Text>毛利率：{formatPct(record.profitMarginPctAfter)}</Text>
        </Space>
      ),
    },
    {
      title: '库存 / BuyBox',
      width: 118,
      render: (_: unknown, record) => (
        <Space direction="vertical" size={2} style={{ fontSize: 12, lineHeight: '20px' }}>
          <Text>库存：{record.stock ?? '-'}</Text>
          <Text>排名：{record.buyButtonRank ?? '-'}</Text>
          <Tag style={{ margin: 0 }}>{record.buyBoxStatus || '-'}</Tag>
        </Space>
      ),
    },
    {
      title: '风险 / 状态',
      width: 148,
      render: (_: unknown, record) => {
        const disabledReason = getCandidateDisabledReason(record);
        return (
          <Space direction="vertical" size={4}>
            <Tag color={record.riskLevel === 'HIGH' ? 'error' : record.riskLevel === 'MEDIUM' ? 'warning' : 'success'} style={{ margin: 0 }}>
              {record.riskLevel || 'UNKNOWN'}
            </Tag>
            {disabledReason
              ? <Text type="danger" style={{ fontSize: 12, lineHeight: '18px' }}>{disabledReason}</Text>
              : <Text type="success" style={{ fontSize: 12 }}>可勾选</Text>}
          </Space>
        );
      },
    },
  ];

  const renderReadinessPanel = () => {
    if (!readiness) return null;
    const { summary } = readiness;
    const funnelRows = [
      { label: '总产品数', value: summary.totalStoreProducts },
      { label: 'RESELL 数', value: summary.resellCount },
      { label: 'RESELL 有库存数', value: summary.resellWithStockCount },
      { label: 'Product 映射数', value: summary.mappedProductCount },
      { label: 'FBE 费用已维护数', value: summary.fbeFeeReadyCount },
      { label: '佣金已同步数', value: summary.commissionReadyCount },
      { label: '税口径是否配置', value: formatReadyFlag(summary.cartPriceTaxModeReady) },
      { label: 'preview OK 数', value: summary.previewOkCount },
      { label: '最终候选数', value: summary.candidateCount },
    ];

    return (
      <div style={{ marginTop: 12 }}>
        {readiness.autoIntegrationMessage && (
          <Alert
            type="info"
            showIcon
            message="自动接入说明"
            description={readiness.autoIntegrationMessage}
            style={{ marginBottom: 12 }}
          />
        )}

        <Descriptions size="small" bordered column={3} title="准备漏斗" style={{ marginBottom: 12 }}>
          {funnelRows.map((row) => (
            <Descriptions.Item key={row.label} label={row.label}>
              {row.value ?? '-'}
            </Descriptions.Item>
          ))}
        </Descriptions>

        {readiness.blockers.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>阻塞原因</Text>
            <Space size={[8, 8]} wrap>
              {readiness.blockers.map((blocker) => (
                <Tag key={blocker.code} color="error">
                  {blocker.code}{blocker.count != null ? `：${blocker.count}` : ''}
                </Tag>
              ))}
            </Space>
            <div style={{ marginTop: 8 }}>
              {readiness.blockers.filter((b) => b.message).map((blocker) => (
                <div key={`${blocker.code}-msg`} style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                  {blocker.code}：{blocker.message}
                </div>
              ))}
            </div>
          </div>
        )}

        {readiness.nextActions.length > 0 && (
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>下一步建议</Text>
            <ul style={{ margin: 0, paddingLeft: 20, color: '#475569', fontSize: 13 }}>
              {readiness.nextActions.map((action) => (
                <li key={action} style={{ marginBottom: 4 }}>{action}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const resultColumns: ColumnsType<BatchExecuteItemResult> = [
    { title: 'SKU', dataIndex: 'sku', width: 140 },
    {
      title: '状态',
      width: 180,
      render: (_: unknown, record) => renderStatusTag(record),
    },
    { title: 'code', dataIndex: 'code', width: 130, render: (value) => value ?? '-' },
    {
      title: '价格',
      width: 190,
      render: (_: unknown, record) => (
        <Space direction="vertical" size={2}>
          <Text>原：{formatMoney(record.oldSalePriceExVat, modalCurrency)}</Text>
          <Text>新：{formatMoney(record.newSalePriceExVat, modalCurrency)}</Text>
        </Space>
      ),
    },
    {
      title: '回读',
      width: 200,
      render: (_: unknown, record) => (
        <Space direction="vertical" size={2}>
          <Text>{record.readBackStatus || '-'}</Text>
          <Text>{formatMoney(record.readBackPrice, modalCurrency)}</Text>
          {record.readBackWarning && <Text type="warning">{record.readBackWarning}</Text>}
        </Space>
      ),
    },
    { title: 'message', dataIndex: 'message', width: 260, render: (value) => value || '-' },
  ];

  return (
    <Modal
      title="抢车候选池"
      open={open}
      onCancel={onCancel}
      width={960}
      destroyOnClose
      footer={[
        <Button key="cancel" onClick={onCancel}>关闭</Button>,
        <Button key="execute" type="primary" loading={submitting} disabled={!canSubmit} onClick={handleBatchConfirm}>
          批量抢车
        </Button>,
      ]}
    >
      <Alert
        type="info"
        showIcon
        message="最多选择 5 个 SKU；确认价必须使用后端候选池返回的 suggestedGrabPriceExVat。"
        style={{ marginBottom: 12 }}
      />

      {errorMessage && <Alert type="error" showIcon message={errorMessage} style={{ marginBottom: 12 }} />}

      <Spin spinning={loading}>
        {candidates.length > 0 ? (
          <Table<GrabCartCandidate>
            size="small"
            rowKey="key"
            dataSource={candidates}
            columns={columns}
            pagination={false}
            scroll={{ x: 760, y: 360 }}
            rowSelection={{
              selectedRowKeys,
              onChange: handleSelectionChange,
              getCheckboxProps: (record) => ({
                disabled: !!getCandidateDisabledReason(record),
              }),
            }}
          />
        ) : (
          !loading && !errorMessage && (
            <div>
              <Alert
                type="warning"
                showIcon
                message="当前店铺暂无可执行抢车候选"
                description="这不是接口异常。下方展示准备漏斗、阻塞原因与下一步建议，便于排查数据/配置缺口。"
                style={{ marginBottom: 12 }}
              />
              <Spin spinning={readinessLoading}>
                {readinessError && (
                  <Alert type="warning" showIcon message={readinessError} style={{ marginBottom: 12 }} />
                )}
                {renderReadinessPanel()}
                {!readinessLoading && !readiness && !readinessError && (
                  <Empty description="准备漏斗数据加载中或暂不可用" />
                )}
              </Spin>
            </div>
          )
        )}
      </Spin>

      <div style={{ marginTop: 12, padding: 12, background: '#f8fafc', borderRadius: 8 }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text strong>已选择 {selectedCandidates.length} / {MAX_BATCH_ITEMS} 个 SKU</Text>
          <Input.TextArea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            showCount
            maxLength={500}
            placeholder="请输入批量抢车原因（10-500 字）"
          />
          {!reasonValid && <Text type="danger">reason 必填，长度需为 10-500 字。</Text>}
        </Space>
      </div>

      {batchResult && (
        <div style={{ marginTop: 16 }}>
          <Alert
            type="success"
            showIcon
            message={`批量执行已返回，batchId：${batchResult.batchId ?? '-'}`}
            style={{ marginBottom: 12 }}
          />
          <Descriptions size="small" column={6} bordered style={{ marginBottom: 12 }}>
            <Descriptions.Item label="total">{batchResult.total ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="success">{batchResult.success ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="skipped">{batchResult.skipped ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="blocked">{batchResult.blocked ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="failed">{batchResult.failed ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="pendingConfirm">{batchResult.pendingConfirm ?? '-'}</Descriptions.Item>
          </Descriptions>
          <Table<BatchExecuteItemResult>
            size="small"
            rowKey="key"
            dataSource={batchResult.items}
            columns={resultColumns}
            pagination={false}
            scroll={{ x: 'max-content', y: 260 }}
          />
        </div>
      )}
    </Modal>
  );
}
