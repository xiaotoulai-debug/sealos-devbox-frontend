import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Modal,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import request from '../lib/request';

const { Text } = Typography;

export interface StoreProductGrabCartTarget {
  id: number;
  storeProductId?: number | null;
  store_product_id?: number | null;
  shopId?: number | null;
  shop_id?: number | null;
  title?: string | null;
  name?: string | null;
  product_name?: string | null;
  productName?: string | null;
  sku?: string | null;
  vendorSku?: string | null;
  vendor_sku?: string | null;
  ean?: string | null;
  pnk?: string | null;
  part_number_key?: string | null;
  part_number?: string | null;
  partNumber?: string | null;
  price?: number | null;
  sale_price?: number | null;
  salePrice?: number | null;
  currency?: string | null;
  stock?: number | null;
  platformStock?: number | null;
  platform_stock?: number | null;
  linkType?: string | null;
  link_type?: string | null;
  linkTypeLabel?: string | null;
  link_type_label?: string | null;
}

interface GrabCartPreviewData {
  canGrab?: boolean | null;
  code?: string | null;
  message?: string | null;
  cartPriceTaxMode?: string | null;
  cartPriceRaw?: number | null;
  cartPriceIncludesVat?: boolean | null;
  cartPriceExVat?: number | null;
  suggestedGrabPriceExVat?: number | null;
  currentSalePriceExVat?: number | null;
  finalMinPrice?: number | null;
  grabStep?: number | null;
  estimatedProfitAfter?: number | null;
  profitMarginPctAfter?: number | null;
  costStatus?: string | null;
  costWarnings?: string[] | string | null;
  warnings?: string[] | string | null;
  currency?: string | null;
}

interface GrabCartExecuteData {
  status?: string | null;
  code?: string | number | null;
  message?: string | null;
  errorMessage?: string | null;
  noEmagWriteExecuted?: boolean | null;
  logId?: number | string | null;
  oldSalePriceExVat?: number | null;
  newSalePriceExVat?: number | null;
  payloadPreview?: Record<string, unknown> | null;
}

interface ApiResponse<T> {
  code: number | string;
  data?: T | null;
  message?: string;
}

interface PlatformProductGrabCartPreviewModalProps {
  open: boolean;
  product: StoreProductGrabCartTarget | null;
  currentShopId: number | null;
  onCancel: () => void;
  onSuccess?: () => void;
}

const DEFAULT_GRAB_REASON = '运营手动抢购物车';

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

function getGrabCartEligibility(raw: Record<string, unknown>): Record<string, unknown> | null {
  const eligibility = raw.grabCartEligibility ?? raw.grab_cart_eligibility;
  return eligibility && typeof eligibility === 'object' ? (eligibility as Record<string, unknown>) : null;
}

/** 兼容顶层 / grabCartEligibility 嵌套，以及 camelCase / snake_case 字段名 */
function normalizeGrabCartPreview(raw: unknown): GrabCartPreviewData | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const eligibility = getGrabCartEligibility(data);

  return {
    canGrab: pickBool(data.canGrab, data.can_grab, eligibility?.canGrab, eligibility?.can_grab),
    code: pickString(
      data.code,
      data.blockCode,
      data.block_code,
      eligibility?.code,
      eligibility?.blockCode,
      eligibility?.block_code,
    ),
    message: pickString(
      data.message,
      data.blockMessage,
      data.block_message,
      eligibility?.message,
      eligibility?.blockMessage,
      eligibility?.block_message,
    ),
    cartPriceTaxMode: pickString(data.cartPriceTaxMode, data.cart_price_tax_mode),
    cartPriceRaw: toNumber(data.cartPriceRaw ?? data.cart_price_raw),
    cartPriceIncludesVat: pickBool(data.cartPriceIncludesVat, data.cart_price_includes_vat),
    cartPriceExVat: toNumber(data.cartPriceExVat ?? data.cart_price_ex_vat),
    suggestedGrabPriceExVat: toNumber(data.suggestedGrabPriceExVat ?? data.suggested_grab_price_ex_vat),
    currentSalePriceExVat: toNumber(data.currentSalePriceExVat ?? data.current_sale_price_ex_vat),
    finalMinPrice: toNumber(data.finalMinPrice ?? data.final_min_price),
    grabStep: toNumber(data.grabStep ?? data.grab_step),
    estimatedProfitAfter: toNumber(data.estimatedProfitAfter ?? data.estimated_profit_after),
    profitMarginPctAfter: toNumber(data.profitMarginPctAfter ?? data.profit_margin_pct_after),
    costStatus: pickString(data.costStatus, data.cost_status),
    costWarnings: (data.costWarnings ?? data.cost_warnings) as string[] | string | null | undefined,
    warnings: data.warnings as string[] | string | null | undefined,
    currency: pickString(data.currency),
  };
}

function toWarningList(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function formatMoney(value: number | null | undefined, currency?: string | null): string {
  if (value == null || Number.isNaN(Number(value))) return '-';
  const suffix = String(currency ?? '').trim();
  return suffix ? `${Number(value).toFixed(4)} ${suffix}` : Number(value).toFixed(4);
}

function formatPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '-';
  const n = Number(value);
  return `${(Math.abs(n) <= 1 ? n * 100 : n).toFixed(2)}%`;
}

function getProductName(product: StoreProductGrabCartTarget | null): string {
  return String(product?.title ?? product?.name ?? product?.product_name ?? product?.productName ?? '').trim() || '-';
}

function getProductSku(product: StoreProductGrabCartTarget | null): string {
  return String(product?.vendorSku ?? product?.vendor_sku ?? product?.sku ?? '').trim() || '-';
}

function getProductPnk(product: StoreProductGrabCartTarget | null): string {
  return String(product?.pnk ?? product?.part_number_key ?? product?.partNumber ?? product?.part_number ?? '').trim() || '-';
}

function resolveStoreProductId(product: StoreProductGrabCartTarget | null): number | null {
  return toNumber(product?.storeProductId ?? product?.store_product_id ?? product?.id);
}

function resolveShopId(product: StoreProductGrabCartTarget | null, currentShopId: number | null): number | null {
  return toNumber(product?.shopId ?? product?.shop_id ?? currentShopId);
}

function renderCostStatus(costStatus?: string | null) {
  const value = String(costStatus ?? '').trim().toUpperCase();
  if (!value) return <Tag>未知</Tag>;
  if (value === 'COMPLETE') return <Tag color="success">COMPLETE</Tag>;
  if (value === 'ESTIMATED') return <Tag color="warning">ESTIMATED</Tag>;
  if (value.startsWith('MISSING')) return <Tag color="error">{value}</Tag>;
  return <Tag>{value}</Tag>;
}

function normalizeEnumValue(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function isGrabExecuteAllowed(preview: GrabCartPreviewData | null): boolean {
  if (!preview || preview.canGrab !== true) return false;
  if (normalizeEnumValue(preview.code) !== 'OK') return false;
  const price = preview.suggestedGrabPriceExVat;
  return price != null && Number(price) > 0;
}

function normalizeGrabCartExecute(raw: unknown): GrabCartExecuteData | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  return {
    status: pickString(data.status),
    code: pickString(data.code) ?? (data.code != null ? String(data.code) : null),
    message: pickString(data.message, data.errorMessage, data.error_message),
    errorMessage: pickString(data.errorMessage, data.error_message),
    noEmagWriteExecuted: pickBool(data.noEmagWriteExecuted, data.no_emag_write_executed),
    logId: (data.logId ?? data.log_id) as number | string | null | undefined,
    oldSalePriceExVat: toNumber(data.oldSalePriceExVat ?? data.old_sale_price_ex_vat),
    newSalePriceExVat: toNumber(data.newSalePriceExVat ?? data.new_sale_price_ex_vat),
    payloadPreview: (data.payloadPreview ?? data.payload_preview) as Record<string, unknown> | null | undefined,
  };
}

function getBackendErrorMessage(err: unknown, fallback: string): { status?: number; message: string; data?: Record<string, unknown> | null } {
  const e = err as {
    response?: { status?: number; data?: Record<string, unknown> & { message?: string; errorMessage?: string } };
    message?: string;
  };
  const status = e.response?.status;
  const data = e.response?.data ?? null;
  const msg = data?.message || data?.errorMessage || e.message || fallback;
  return { status, message: msg, data };
}

function formatPayloadPreview(payload: Record<string, unknown> | null | undefined): string {
  if (!payload || typeof payload !== 'object') return '-';
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

export default function PlatformProductGrabCartPreviewModal({
  open,
  product,
  currentShopId,
  onCancel,
  onSuccess,
}: PlatformProductGrabCartPreviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [preview, setPreview] = useState<GrabCartPreviewData | null>(null);
  const [executeResult, setExecuteResult] = useState<GrabCartExecuteData | null>(null);
  const [executeBlocked, setExecuteBlocked] = useState<GrabCartExecuteData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const storeProductId = useMemo(() => resolveStoreProductId(product), [product]);
  const resolvedShopId = useMemo(() => resolveShopId(product, currentShopId), [product, currentShopId]);
  const currency = preview?.currency ?? product?.currency ?? '';
  const stock = product?.platformStock ?? product?.platform_stock ?? product?.stock ?? null;
  const currentPrice = product?.price ?? product?.sale_price ?? product?.salePrice ?? preview?.currentSalePriceExVat ?? null;
  const warnings = [...toWarningList(preview?.costWarnings), ...toWarningList(preview?.warnings)];
  const blockCode = preview?.code ?? null;
  const blockMessage = preview?.message ?? null;
  const canExecuteGrab = isGrabExecuteAllowed(preview);
  const confirmedPriceExVat = preview?.suggestedGrabPriceExVat ?? null;

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setExecuteResult(null);
    setExecuteBlocked(null);
    setExecuting(false);
    setErrorMessage(null);

    if (!storeProductId) {
      setErrorMessage('缺少平台产品ID，无法抢车预览');
      return;
    }
    if (!resolvedShopId) {
      setErrorMessage('缺少店铺ID，无法抢车预览');
      return;
    }

    let cancelled = false;
    const loadPreview = async () => {
      setLoading(true);
      try {
        const { data: res } = await request.post<ApiResponse<Record<string, unknown>>>(
          `/store-products/${storeProductId}/grab-cart/preview`,
          { shopId: resolvedShopId },
        );
        if (cancelled) return;
        if (res.code === 200 && res.data) {
          setPreview(normalizeGrabCartPreview(res.data));
        } else {
          setErrorMessage(res.message || '抢车预览失败');
          setPreview(null);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(getBackendErrorMessage(err, '抢车预览失败').message);
          setPreview(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [open, resolvedShopId, storeProductId]);

  const executeGrabCart = async () => {
    if (!storeProductId || !resolvedShopId || !preview || confirmedPriceExVat == null) return;
    setExecuting(true);
    setExecuteResult(null);
    setExecuteBlocked(null);
    try {
      const { data: res } = await request.post<ApiResponse<Record<string, unknown>>>(
        `/store-products/${storeProductId}/grab-cart/execute`,
        {
          shopId: resolvedShopId,
          confirmedPriceExVat,
          reason: DEFAULT_GRAB_REASON,
        },
      );
      const data = normalizeGrabCartExecute(res.data);
      const status = normalizeEnumValue(data?.status ?? data?.code);
      const blocked = res.code === 409 || status === 'BLOCKED' || normalizeEnumValue(data?.code) === 'BLOCKED';

      if (blocked && data) {
        setExecuteBlocked(data);
        message.error(data.message || data.errorMessage || '执行被阻断');
        return;
      }

      if (res.code === 200 && data) {
        setExecuteResult(data);
        const noWrite = data.noEmagWriteExecuted === true || status === 'DRY_RUN_ONLY' || status === 'SKIPPED';
        if (status === 'SUCCESS' && !noWrite) {
          message.success('抢车改价已提交成功');
          onSuccess?.();
        } else if (status === 'DRY_RUN_ONLY' || status === 'SKIPPED' || noWrite) {
          message.warning('安全模式：已模拟执行，未真实改价，未写入 eMAG');
        } else if (status === 'FAILED') {
          message.error(data.message || data.errorMessage || '抢车执行失败');
        }
        return;
      }

      message.error(res.message || '抢车执行失败');
    } catch (err) {
      const parsed = getBackendErrorMessage(err, '抢车执行失败');
      const errorData = normalizeGrabCartExecute(parsed.data);
      if (parsed.status === 409 || normalizeEnumValue(errorData?.code) === 'BLOCKED') {
        setExecuteBlocked(errorData ?? {
          code: errorData?.code ?? 'BLOCKED',
          message: parsed.message,
          noEmagWriteExecuted: errorData?.noEmagWriteExecuted ?? true,
        });
        message.error(errorData?.message || parsed.message || '执行被阻断');
      } else if (parsed.status === 403) {
        message.error('当前账号没有抢购物车权限，请联系管理员');
      } else {
        message.error(parsed.message);
      }
    } finally {
      setExecuting(false);
    }
  };

  const handleExecuteConfirm = () => {
    if (!canExecuteGrab || confirmedPriceExVat == null) return;
    Modal.confirm({
      title: '确认抢车',
      content: (
        <div>
          <p>当前将尝试把售价调整为：{formatMoney(confirmedPriceExVat, currency)}（不含 VAT）</p>
          <p>最低保护价：{formatMoney(preview?.finalMinPrice, currency)}</p>
          <p style={{ marginBottom: 0, color: '#64748b' }}>
            当前后端仍处于安全模式时，不会真实写入 eMAG。
          </p>
        </div>
      ),
      okText: '确认抢车',
      cancelText: '取消',
      onOk: executeGrabCart,
    });
  };

  const renderPreviewAlert = () => {
    if (errorMessage) {
      return <Alert type="error" showIcon message={errorMessage} style={{ marginBottom: 12 }} />;
    }
    if (!preview) return null;
    if (canExecuteGrab) {
      return (
        <Alert
          type="success"
          showIcon
          message="允许按建议价参与抢购物车报价"
          description={`建议抢车价：${formatMoney(preview.suggestedGrabPriceExVat, currency)}（不含 VAT）`}
          style={{ marginBottom: 12 }}
        />
      );
    }
    return (
      <Alert
        type="warning"
        showIcon
        message={blockMessage || '暂不能抢购物车'}
        description={blockCode ? `阻断码：${blockCode}` : undefined}
        style={{ marginBottom: 12 }}
      />
    );
  };

  const renderExecuteBlocked = () => {
    if (!executeBlocked) return null;
    const code = executeBlocked.code ?? '-';
    const noWrite = executeBlocked.noEmagWriteExecuted;
    return (
      <Alert
        type="error"
        showIcon
        message="执行被阻断"
        description={
          <>
            <div>code：{String(code)}</div>
            <div>{executeBlocked.message || executeBlocked.errorMessage || '-'}</div>
            {noWrite != null && <div>noEmagWriteExecuted：{noWrite ? 'true' : 'false'}</div>}
          </>
        }
        style={{ marginTop: 12 }}
      />
    );
  };

  const renderExecuteResult = () => {
    if (!executeResult) return null;
    const status = normalizeEnumValue(executeResult.status ?? executeResult.code);
    const noWrite = executeResult.noEmagWriteExecuted === true || status === 'DRY_RUN_ONLY' || status === 'SKIPPED';
    let type: 'success' | 'warning' | 'error' | 'info' = 'info';
    let title = executeResult.message || '抢车请求已返回';

    if (status === 'SUCCESS' && !noWrite) {
      type = 'success';
      title = '抢车改价已提交成功';
    } else if (status === 'DRY_RUN_ONLY' || status === 'SKIPPED' || noWrite) {
      type = 'warning';
      title = '安全模式：已模拟执行，未真实改价，未写入 eMAG。';
    } else if (status === 'FAILED' || status === 'BLOCKED') {
      type = 'error';
      title = executeResult.message || executeResult.errorMessage || '抢车执行失败';
    }

    return (
      <div style={{ marginTop: 14 }}>
        <Alert type={type} showIcon message={title} />
        <Descriptions size="small" column={2} style={{ marginTop: 12 }}>
          <Descriptions.Item label="status">{status || '-'}</Descriptions.Item>
          <Descriptions.Item label="code">{executeResult.code ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="message" span={2}>{executeResult.message || executeResult.errorMessage || '-'}</Descriptions.Item>
          <Descriptions.Item label="noEmagWriteExecuted">
            {executeResult.noEmagWriteExecuted == null ? '-' : (executeResult.noEmagWriteExecuted ? 'true' : 'false')}
          </Descriptions.Item>
          <Descriptions.Item label="logId">{executeResult.logId ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="oldSalePriceExVat">{formatMoney(executeResult.oldSalePriceExVat, currency)}</Descriptions.Item>
          <Descriptions.Item label="newSalePriceExVat">{formatMoney(executeResult.newSalePriceExVat, currency)}</Descriptions.Item>
          <Descriptions.Item label="payloadPreview" span={2}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12 }}>
              {formatPayloadPreview(executeResult.payloadPreview)}
            </pre>
          </Descriptions.Item>
        </Descriptions>
      </div>
    );
  };

  return (
    <Modal
      title="抢车预览"
      open={open}
      onCancel={onCancel}
      width={820}
      destroyOnClose
      footer={[
        <Button key="close" onClick={onCancel}>关闭</Button>,
        ...(canExecuteGrab ? [
          <Button
            key="execute"
            type="primary"
            loading={executing}
            disabled={executing}
            onClick={handleExecuteConfirm}
          >
            确认抢车
          </Button>,
        ] : []),
      ]}
    >
      {product ? (
        <>
          <div style={{ padding: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 14 }}>
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="产品名" span={2}>{getProductName(product)}</Descriptions.Item>
              <Descriptions.Item label="SKU">{getProductSku(product)}</Descriptions.Item>
              <Descriptions.Item label="EAN">{String(product.ean ?? '').trim() || '-'}</Descriptions.Item>
              <Descriptions.Item label="PNK">{getProductPnk(product)}</Descriptions.Item>
              <Descriptions.Item label="当前售价（不含 VAT）">{formatMoney(currentPrice, currency)}</Descriptions.Item>
              <Descriptions.Item label="库存">{stock ?? '-'}</Descriptions.Item>
            </Descriptions>
          </div>

          <Spin spinning={loading}>
            {renderPreviewAlert()}

            {preview && (
              <>
                <Descriptions size="small" column={2}>
                  <Descriptions.Item label="canGrab">{preview.canGrab == null ? '-' : (preview.canGrab ? 'true' : 'false')}</Descriptions.Item>
                  <Descriptions.Item label="code">{blockCode ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="message" span={2}>{blockMessage ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="税口径">{preview.cartPriceTaxMode ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="购物车原始价">{formatMoney(preview.cartPriceRaw, currency)}</Descriptions.Item>
                  <Descriptions.Item label="购物车含 VAT">{preview.cartPriceIncludesVat == null ? '-' : (preview.cartPriceIncludesVat ? '是' : '否')}</Descriptions.Item>
                  <Descriptions.Item label="购物车价（不含 VAT）">{formatMoney(preview.cartPriceExVat, currency)}</Descriptions.Item>
                  <Descriptions.Item label="建议抢车价（不含 VAT）">{formatMoney(preview.suggestedGrabPriceExVat, currency)}</Descriptions.Item>
                  <Descriptions.Item label="当前我方售价（不含 VAT）">{formatMoney(preview.currentSalePriceExVat, currency)}</Descriptions.Item>
                  <Descriptions.Item label="最终最低保护价">{formatMoney(preview.finalMinPrice, currency)}</Descriptions.Item>
                  <Descriptions.Item label="抢车步进">{formatMoney(preview.grabStep, currency)}</Descriptions.Item>
                  <Descriptions.Item label="改价后预估毛利">{formatMoney(preview.estimatedProfitAfter, currency)}</Descriptions.Item>
                  <Descriptions.Item label="改价后毛利率">{formatPct(preview.profitMarginPctAfter)}</Descriptions.Item>
                  <Descriptions.Item label="成本状态">{renderCostStatus(preview.costStatus)}</Descriptions.Item>
                </Descriptions>

                {warnings.length > 0 && (
                  <Alert
                    type={String(preview.costStatus ?? '').toUpperCase().startsWith('MISSING') ? 'error' : 'warning'}
                    showIcon
                    message="风险提示"
                    description={warnings.map((w) => <div key={w}>{w}</div>)}
                    style={{ marginTop: 12 }}
                  />
                )}

                {blockCode === 'MISSING_COST' && (
                  <Alert
                    type="warning"
                    showIcon
                    message="成本资料不完整，当前店铺策略不允许抢购物车"
                    description={<Text type="secondary">这是后端业务阻断，不是接口失败；请先补齐成本资料后再评估抢车。</Text>}
                    style={{ marginTop: 12 }}
                  />
                )}

                {renderExecuteBlocked()}
                {renderExecuteResult()}
              </>
            )}
          </Spin>
        </>
      ) : (
        <Alert type="warning" showIcon message="未选择平台产品" />
      )}
    </Modal>
  );
}
