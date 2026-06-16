import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Modal,
  Spin,
  Tag,
  Typography,
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

function getBackendErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string; errorMessage?: string } }; message?: string };
  return e.response?.data?.message || e.response?.data?.errorMessage || e.message || fallback;
}

export default function PlatformProductGrabCartPreviewModal({
  open,
  product,
  currentShopId,
  onCancel,
}: PlatformProductGrabCartPreviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<GrabCartPreviewData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const storeProductId = useMemo(() => resolveStoreProductId(product), [product]);
  const resolvedShopId = useMemo(() => resolveShopId(product, currentShopId), [product, currentShopId]);
  const currency = preview?.currency ?? product?.currency ?? '';
  const stock = product?.platformStock ?? product?.platform_stock ?? product?.stock ?? null;
  const currentPrice = product?.price ?? product?.sale_price ?? product?.salePrice ?? preview?.currentSalePriceExVat ?? null;
  const warnings = [...toWarningList(preview?.costWarnings), ...toWarningList(preview?.warnings)];
  const blockCode = preview?.code ?? null;
  const blockMessage = preview?.message ?? null;

  useEffect(() => {
    if (!open) return;
    setPreview(null);
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
          setErrorMessage(getBackendErrorMessage(err, '抢车预览失败'));
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

  const renderPreviewAlert = () => {
    if (errorMessage) {
      return <Alert type="error" showIcon message={errorMessage} style={{ marginBottom: 12 }} />;
    }
    if (!preview) return null;
    if (preview.canGrab === true) {
      return <Alert type="success" showIcon message="允许按建议价参与抢购物车报价" style={{ marginBottom: 12 }} />;
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

  return (
    <Modal
      title="抢车预览"
      open={open}
      onCancel={onCancel}
      width={820}
      destroyOnClose
      footer={<Button onClick={onCancel}>关闭</Button>}
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
