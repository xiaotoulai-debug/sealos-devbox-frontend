import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Descriptions, Drawer, Modal, Row, Col, Space, Spin, Table, Tag, Typography, message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import { EyeOutlined } from '@ant-design/icons';
import request from '../lib/request';

const { Text, Title } = Typography;

interface ApiResponse<T> {
  code: number | string;
  data?: T | null;
  message?: string;
}

interface GrabCartCandidateDrawerProps {
  open: boolean;
  shopId: number | null;
  currency?: string | null;
  onCancel: () => void;
}

interface CandidateRow {
  key: string;
  storeProductId: number | null;
  shopName: string;
  sku: string;
  pnk: string;
  productName: string;
  currentSalePriceExVat: number | null;
  cartPriceExVat: number | null;
  suggestedGrabPriceExVat: number | null;
  finalMinPrice: number | null;
  profitMarginPctAfter: number | null;
  fbeFeeCny: number | null;
  fbeSource: string;
  costStatus: string;
  isCandidate: boolean;
  blockReason: string;
  currency: string;
  rawProduct: Record<string, unknown>;
}

interface ReadinessBlocker {
  code: string;
  count: number | null;
  message: string | null;
}

interface ReadinessData {
  candidateCount: number | null;
  fbeCostCompleteRate: number | null;
  fbeEstimatedBlockedCount: number | null;
  blockers: ReadinessBlocker[];
}

interface PreviewData {
  cartPriceExVat: number | null;
  suggestedGrabPriceExVat: number | null;
  currentSalePriceExVat: number | null;
  finalMinPrice: number | null;
  profitMarginPctAfter: number | null;
  costStatus: string;
  costWarnings: string[];
  warnings: string[];
  code: string;
  message: string;
  currency: string;
}

const BLOCKER_LABEL_MAP: Record<string, string> = {
  MISSING_FBE_FEE: '缺少 FBE 费用',
  FBE_ESTIMATED_7RMB: 'FBE 仍为 7 RMB 估算',
  FBE_ESTIMATED: 'FBE 仍为估算值',
  OUT_OF_STOCK: '库存不足',
  ALREADY_WON: '已赢购物车',
  NOT_RESELL: '非 RESELL',
  MISSING_COMMISSION: '缺佣金',
  MISSING_VAT: '缺 VAT',
  CART_PRICE_TAX_MODE_UNKNOWN: '购物车税口径未配置',
  MISSING_COST: '成本资料不完整',
};

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function normalizeEnum(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function normalizePercent(value: number | null): number | null {
  if (value == null) return null;
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function formatMoney(value: number | null | undefined, currency?: string | null): string {
  if (value == null) return '-';
  const suffix = String(currency ?? '').trim();
  return suffix ? `${Number(value).toFixed(2)} ${suffix}` : Number(value).toFixed(2);
}

function formatPct(value: number | null | undefined): string {
  const pct = normalizePercent(value ?? null);
  if (pct == null) return '-';
  return `${pct.toFixed(2)}%`;
}

function formatRate(value: number | null | undefined): string {
  if (value == null) return '-';
  return `${(Math.abs(value) <= 1 ? value * 100 : value).toFixed(1)}%`;
}

function getBlockerLabel(code: string): string {
  const normalized = normalizeEnum(code);
  return BLOCKER_LABEL_MAP[normalized] || code;
}

function getCandidateList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const data = payload as Record<string, unknown>;
  const merged = [
    ...(Array.isArray(data.list) ? data.list : []),
    ...(Array.isArray(data.items) ? data.items : []),
    ...(Array.isArray(data.candidates) ? data.candidates : []),
    ...(Array.isArray(data.blocked) ? data.blocked : []),
    ...(Array.isArray(data.blockedItems) ? data.blockedItems : []),
  ];
  if (merged.length > 0) return merged;
  return Array.isArray(data.rows) ? data.rows : [];
}

function normalizeCandidate(raw: unknown, index: number): CandidateRow {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const shop = data.shop && typeof data.shop === 'object' ? data.shop as Record<string, unknown> : {};
  const selectable = data.selectable === true || data.isCandidate === true || data.is_candidate === true;
  const blockReason = pickString(
    data.blockReason,
    data.block_reason,
    data.unselectableReason,
    data.unselectable_reason,
    data.blockMessage,
    data.block_message,
    data.message,
  );
  const costStatus = pickString(data.costStatus, data.cost_status, data.grabCartCostStatus, data.grab_cart_cost_status);
  const fbeSource = pickString(data.fbeSource, data.fbe_source, data.feeSource, data.fee_source, data.fbeScope, data.fbe_scope);
  return {
    key: String(data.storeProductId ?? data.store_product_id ?? data.id ?? `row-${index}`),
    storeProductId: toNumber(data.storeProductId ?? data.store_product_id ?? data.id),
    shopName: pickString(data.shopName, data.shop_name, shop.shopName, shop.shop_name, shop.name),
    sku: pickString(data.sku, data.vendorSku, data.vendor_sku),
    pnk: pickString(data.pnk, data.partNumberKey, data.part_number_key, data.partNumber, data.part_number),
    productName: pickString(data.productName, data.product_name, data.title, data.name),
    currentSalePriceExVat: toNumber(data.currentSalePriceExVat ?? data.current_sale_price_ex_vat),
    cartPriceExVat: toNumber(data.cartPriceExVat ?? data.cart_price_ex_vat),
    suggestedGrabPriceExVat: toNumber(data.suggestedGrabPriceExVat ?? data.suggested_grab_price_ex_vat),
    finalMinPrice: toNumber(data.finalMinPrice ?? data.final_min_price),
    profitMarginPctAfter: toNumber(data.profitMarginPctAfter ?? data.profit_margin_pct_after),
    fbeFeeCny: toNumber(data.fbeFeeCny ?? data.fbe_fee_cny ?? data.fbeFee ?? data.fbe_fee),
    fbeSource,
    costStatus,
    isCandidate: selectable && !blockReason,
    blockReason,
    currency: pickString(data.currency),
    rawProduct: data,
  };
}

function normalizeReadiness(raw: unknown): ReadinessData {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const summary = data.summary && typeof data.summary === 'object' ? data.summary as Record<string, unknown> : data;
  const display = data.displaySummary && typeof data.displaySummary === 'object'
    ? data.displaySummary as Record<string, unknown>
    : {};
  const blockersRaw = Array.isArray(data.topBlockers) ? data.topBlockers
    : Array.isArray(data.blockers) ? data.blockers
      : [];
  const blockers = blockersRaw.map((item, index) => {
    if (typeof item === 'string') return { code: item, count: null, message: null };
    const obj = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      code: pickString(obj.code, obj.blockCode, obj.block_code) || `BLOCKER_${index + 1}`,
      count: toNumber(obj.count ?? obj.total),
      message: pickString(obj.message, obj.description),
    };
  });
  return {
    candidateCount: toNumber(
      display.candidateReadyCount ?? display.candidate_ready_count
      ?? summary.candidateCount ?? summary.candidate_count,
    ),
    fbeCostCompleteRate: toNumber(
      data.fbeCostCompleteRate ?? data.fbe_cost_complete_rate
      ?? summary.fbeCostCompleteRate ?? summary.fbe_cost_complete_rate
      ?? summary.fbeFeeReadyRate ?? summary.fbe_fee_ready_rate,
    ),
    fbeEstimatedBlockedCount: toNumber(
      data.fbeEstimatedBlockedCount ?? data.fbe_estimated_blocked_count
      ?? summary.fbeEstimatedBlockedCount ?? summary.fbe_estimated_blocked_count
      ?? summary.blockedByFbeEstimateCount,
    ),
    blockers,
  };
}

function normalizePreview(raw: unknown): PreviewData {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const warnings = Array.isArray(data.warnings) ? data.warnings.map(String)
    : typeof data.warnings === 'string' ? [data.warnings] : [];
  const costWarnings = Array.isArray(data.costWarnings ?? data.cost_warnings)
    ? (data.costWarnings ?? data.cost_warnings as string[]).map(String)
    : [];
  return {
    cartPriceExVat: toNumber(data.cartPriceExVat ?? data.cart_price_ex_vat),
    suggestedGrabPriceExVat: toNumber(data.suggestedGrabPriceExVat ?? data.suggested_grab_price_ex_vat),
    currentSalePriceExVat: toNumber(data.currentSalePriceExVat ?? data.current_sale_price_ex_vat),
    finalMinPrice: toNumber(data.finalMinPrice ?? data.final_min_price),
    profitMarginPctAfter: toNumber(data.profitMarginPctAfter ?? data.profit_margin_pct_after),
    costStatus: pickString(data.costStatus, data.cost_status),
    costWarnings,
    warnings,
    code: pickString(data.code),
    message: pickString(data.message),
    currency: pickString(data.currency),
  };
}

function toWarningList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
  return [];
}

function ReadOnlyGrabCartPreviewModal({
  open,
  storeProductId,
  shopId,
  productLabel,
  currency,
  onCancel,
}: {
  open: boolean;
  storeProductId: number | null;
  shopId: number | null;
  productLabel: string;
  currency?: string | null;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setErrorMessage(null);
    if (!storeProductId || !shopId) {
      setErrorMessage('缺少 storeProductId 或 shopId');
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data: res } = await request.post<ApiResponse<Record<string, unknown>>>(
          `/store-products/${storeProductId}/grab-cart/preview`,
          { shopId },
        );
        if (cancelled) return;
        if (Number(res.code) === 200 && res.data) {
          setPreview(normalizePreview(res.data));
        } else {
          setErrorMessage(res.message || '抢车预览失败');
        }
      } catch (err) {
        if (!cancelled) {
          const e = err as { response?: { data?: { message?: string } }; message?: string };
          setErrorMessage(e.response?.data?.message || e.message || '抢车预览失败');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open, storeProductId, shopId]);

  const modalCurrency = preview?.currency || currency || '';
  const warnings = [...toWarningList(preview?.costWarnings), ...toWarningList(preview?.warnings)];

  return (
    <Modal
      title="抢购物车预览（只读）"
      open={open}
      onCancel={onCancel}
      footer={[<Button key="close" type="primary" onClick={onCancel}>关闭</Button>]}
      width={720}
      destroyOnClose
    >
      <Alert
        type="warning"
        showIcon
        message="真实抢车当前未开放"
        description="本预览仅展示后端计算结果，不提供真实执行入口，也不会调用 grab-cart/execute。"
        style={{ marginBottom: 12 }}
      />
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>{productLabel}</Text>
      <Spin spinning={loading}>
        {errorMessage && <Alert type="error" showIcon message={errorMessage} />}
        {preview && (
          <>
            {preview.code && (
              <Alert
                type={preview.code ? 'warning' : 'info'}
                showIcon
                message={preview.message || '预览结果'}
                description={preview.code ? `阻断码：${preview.code}` : undefined}
                style={{ marginBottom: 12 }}
              />
            )}
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="当前价">{formatMoney(preview.currentSalePriceExVat, modalCurrency)}</Descriptions.Item>
              <Descriptions.Item label="购物车价">{formatMoney(preview.cartPriceExVat, modalCurrency)}</Descriptions.Item>
              <Descriptions.Item label="建议抢车价">{formatMoney(preview.suggestedGrabPriceExVat, modalCurrency)}</Descriptions.Item>
              <Descriptions.Item label="最低保护价">{formatMoney(preview.finalMinPrice, modalCurrency)}</Descriptions.Item>
              <Descriptions.Item label="预计毛利率">{formatPct(preview.profitMarginPctAfter)}</Descriptions.Item>
              <Descriptions.Item label="成本状态">{preview.costStatus || '-'}</Descriptions.Item>
            </Descriptions>
            {warnings.length > 0 && (
              <Alert
                type="warning"
                showIcon
                message="成本提示"
                description={warnings.join('；')}
                style={{ marginTop: 12 }}
              />
            )}
          </>
        )}
      </Spin>
    </Modal>
  );
}

export default function GrabCartCandidateDrawer({
  open,
  shopId,
  currency,
  onCancel,
}: GrabCartCandidateDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [readiness, setReadiness] = useState<ReadinessData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<CandidateRow | null>(null);

  useEffect(() => {
    if (!open) return;
    setRows([]);
    setReadiness(null);
    setErrorMessage(null);
    if (!shopId) {
      setErrorMessage('请先选择店铺');
      return;
    }
    let cancelled = false;

    const loadReadiness = async () => {
      setReadinessLoading(true);
      try {
        const { data: res } = await request.get<ApiResponse<unknown>>('/store-products/grab-cart/readiness', {
          params: { shopId },
        });
        if (!cancelled && Number(res.code) === 200) setReadiness(normalizeReadiness(res.data));
      } catch {
        if (!cancelled) setReadiness(null);
      } finally {
        if (!cancelled) setReadinessLoading(false);
      }
    };

    const loadCandidates = async () => {
      setLoading(true);
      try {
        const { data: res } = await request.get<ApiResponse<unknown>>('/store-products/grab-cart/candidates', {
          params: { shopId, page: 1, pageSize: 100, includeBlocked: true },
        });
        if (cancelled) return;
        if (Number(res.code) === 200) {
          setRows(getCandidateList(res.data).map((item, index) => normalizeCandidate(item, index)));
        } else {
          setRows([]);
          setErrorMessage(res.message || '加载抢车候选池失败');
        }
      } catch (err) {
        if (!cancelled) {
          const e = err as { response?: { data?: { message?: string } }; message?: string };
          setErrorMessage(e.response?.data?.message || e.message || '加载抢车候选池失败');
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadReadiness();
    loadCandidates();
    return () => { cancelled = true; };
  }, [open, shopId]);

  const modalCurrency = useMemo(
    () => rows.find((r) => r.currency)?.currency ?? currency ?? '',
    [rows, currency],
  );

  const candidateCount = readiness?.candidateCount ?? rows.filter((r) => r.isCandidate).length;

  const columns: ColumnsType<CandidateRow> = [
    { title: '店铺', dataIndex: 'shopName', width: 110, render: (v: string) => v || '-' },
    { title: 'SKU', dataIndex: 'sku', width: 110 },
    {
      title: '价格',
      width: 150,
      render: (_: unknown, record) => (
        <Space direction="vertical" size={0} style={{ fontSize: 12 }}>
          <Text>当前：{formatMoney(record.currentSalePriceExVat, modalCurrency)}</Text>
          <Text>购物车：{formatMoney(record.cartPriceExVat, modalCurrency)}</Text>
          <Text strong style={{ color: '#16a34a' }}>建议：{formatMoney(record.suggestedGrabPriceExVat, modalCurrency)}</Text>
        </Space>
      ),
    },
    { title: '最低保护价', width: 100, render: (_: unknown, r) => formatMoney(r.finalMinPrice, modalCurrency) },
    { title: '预计毛利率', width: 90, render: (_: unknown, r) => formatPct(r.profitMarginPctAfter) },
    { title: 'FBE费用', width: 90, render: (_: unknown, r) => (r.fbeFeeCny != null ? `¥${r.fbeFeeCny.toFixed(2)}` : '-') },
    { title: 'FBE来源', dataIndex: 'fbeSource', width: 100, render: (v: string) => v || '-' },
    { title: '成本状态', dataIndex: 'costStatus', width: 100, render: (v: string) => v || '-' },
    {
      title: '阻断原因',
      width: 160,
      render: (_: unknown, record) => (
        record.isCandidate
          ? <Tag color="success">可候选</Tag>
          : <Text type="danger" style={{ fontSize: 12 }}>{record.blockReason || getBlockerLabel(record.costStatus) || '未满足候选条件'}</Text>
      ),
    },
    {
      title: '操作',
      width: 90,
      fixed: 'right',
      render: (_: unknown, record) => (
        <Button
          size="small"
          type="link"
          icon={<EyeOutlined />}
          disabled={!record.storeProductId}
          onClick={() => { setPreviewTarget(record); setPreviewOpen(true); }}
        >
          预览
        </Button>
      ),
    },
  ];

  return (
    <>
      <Drawer
        title="抢车候选池（只读）"
        open={open}
        onClose={onCancel}
        width={1080}
        destroyOnClose
        extra={(
          <Tag color="blue">真实抢车未开放</Tag>
        )}
      >
        <Alert
          type="info"
          showIcon
          message="只读候选池：可查看候选与阻断原因，可打开单品预览，不提供批量执行或真实抢车。"
          style={{ marginBottom: 12 }}
        />
        {errorMessage && <Alert type="error" showIcon message={errorMessage} style={{ marginBottom: 12 }} />}

        <Spin spinning={readinessLoading}>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {[
              { label: '候选数', value: candidateCount ?? '-' },
              { label: 'FBE 成本完整率', value: formatRate(readiness?.fbeCostCompleteRate) },
              { label: 'FBE 估算拦截数', value: readiness?.fbeEstimatedBlockedCount ?? '-' },
              { label: '列表行数', value: rows.length },
            ].map((item) => (
              <Col key={item.label} xs={12} sm={6}>
                <div style={{ padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{item.label}</Text>
                  <Title level={4} style={{ margin: '6px 0 0' }}>{item.value}</Title>
                </div>
              </Col>
            ))}
          </Row>
        </Spin>

        {readiness && readiness.blockers.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>其他阻断原因统计</Text>
            <Space wrap>
              {readiness.blockers.map((blocker) => (
                <Tag key={blocker.code} color="volcano">
                  {getBlockerLabel(blocker.code)}
                  {blocker.count != null ? `：${blocker.count}` : ''}
                </Tag>
              ))}
            </Space>
          </div>
        )}

        <Spin spinning={loading}>
          <Table<CandidateRow>
            size="small"
            rowKey="key"
            dataSource={rows}
            columns={columns}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            scroll={{ x: 'max-content', y: 'calc(100vh - 320px)' }}
            locale={{ emptyText: '暂无候选或阻断数据' }}
          />
        </Spin>
      </Drawer>

      <ReadOnlyGrabCartPreviewModal
        open={previewOpen}
        storeProductId={previewTarget?.storeProductId ?? null}
        shopId={shopId}
        productLabel={`${previewTarget?.sku || '-'} / ${previewTarget?.pnk || '-'} / ${previewTarget?.productName || '-'}`}
        currency={modalCurrency}
        onCancel={() => { setPreviewOpen(false); setPreviewTarget(null); }}
      />
    </>
  );
}
