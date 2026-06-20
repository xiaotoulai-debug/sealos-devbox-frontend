import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Divider,
  Input,
  InputNumber,
  Modal,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import request from '../lib/request';

const { Text } = Typography;

type PriceActionStatus = 'SUCCESS' | 'DRY_RUN_ONLY' | 'SKIPPED' | 'PENDING_VERIFY' | 'FAILED' | string;
type ReadBackStatus = 'CONFIRMED' | 'UNCONFIRMED' | 'READBACK_FAILED' | string;

interface PriceActionEligibility {
  canChangePrice?: boolean;
  code?: string | null;
  message?: string | null;
}

export interface StoreProductPriceTarget {
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

interface PricePreviewData {
  priceActionEligibility?: PriceActionEligibility | null;
  price_action_eligibility?: PriceActionEligibility | null;
  canChangePrice?: boolean;
  blockCode?: string | null;
  blockMessage?: string | null;
  currentSalePriceExVat?: number | null;
  newSalePriceExVat?: number | null;
  newSalePriceIncVat?: number | null;
  currency?: string | null;
  vatRate?: number | null;
  hardFloorPrice?: number | null;
  suggestedMinPrice?: number | null;
  manualMinPrice?: number | null;
  finalMinPrice?: number | null;
  estimatedProfitAfter?: number | null;
  profitMarginPctAfter?: number | null;
  costStatus?: string | null;
  costWarnings?: string[] | string | null;
  payloadPreview?: Record<string, unknown> | null;
  warnings?: string[] | string | null;
}

interface PriceExecuteData {
  code?: string | number | null;
  status?: PriceActionStatus | null;
  message?: string | null;
  errorMessage?: string | null;
  logId?: number | string | null;
  oldSalePriceExVat?: number | null;
  newSalePriceExVat?: number | null;
  readBackStatus?: ReadBackStatus | null;
  readBackPrice?: number | null;
  readBackWarning?: string | null;
  profitRecalculated?: boolean | null;
  profitRecalcWarning?: string | null;
  noEmagWriteExecuted?: boolean | null;
}

interface ApiResponse<T> {
  code: number | string;
  data?: T | null;
  message?: string;
}

interface PlatformProductPriceChangeModalProps {
  open: boolean;
  product: StoreProductPriceTarget | null;
  currentShopId: number | null;
  onCancel: () => void;
  onSuccess: () => void;
}

function normalizeEnumValue(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function toWarningList(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatMoney(value: number | null | undefined, currency?: string | null): string {
  if (value == null || Number.isNaN(Number(value))) return '-';
  const suffix = String(currency ?? '').trim();
  return suffix ? `${Number(value).toFixed(2)} ${suffix}` : Number(value).toFixed(2);
}

function formatPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '-';
  const n = Number(value);
  return `${(Math.abs(n) <= 1 ? n * 100 : n).toFixed(2)}%`;
}

function getProductName(product: StoreProductPriceTarget | null): string {
  return String(product?.title ?? product?.name ?? product?.product_name ?? product?.productName ?? '').trim() || '-';
}

function getProductSku(product: StoreProductPriceTarget | null): string {
  return String(product?.vendorSku ?? product?.vendor_sku ?? product?.sku ?? '').trim() || '-';
}

function getProductPnk(product: StoreProductPriceTarget | null): string {
  return String(product?.pnk ?? product?.part_number_key ?? product?.partNumber ?? product?.part_number ?? '').trim() || '-';
}

function getLinkTypeLabel(product: StoreProductPriceTarget | null): string {
  const explicit = String(product?.linkTypeLabel ?? product?.link_type_label ?? '').trim();
  if (explicit) return explicit;
  const linkType = normalizeEnumValue(product?.linkType ?? product?.link_type);
  const map: Record<string, string> = {
    SELF_BUILT: '自建链接',
    RESELL: '普通跟卖',
    OWN_BRAND_RESELL: '自有品牌跟卖',
    UNKNOWN: '待确认',
  };
  return map[linkType] ?? (linkType || '-');
}

function resolveStoreProductId(product: StoreProductPriceTarget | null): number | null {
  return toNumber(product?.storeProductId ?? product?.store_product_id ?? product?.id);
}

function resolveShopId(product: StoreProductPriceTarget | null, currentShopId: number | null): number | null {
  return toNumber(product?.shopId ?? product?.shop_id ?? currentShopId);
}

function getPreviewEligibility(preview: PricePreviewData | null): PriceActionEligibility | null {
  if (!preview) return null;
  return preview.priceActionEligibility ?? preview.price_action_eligibility ?? null;
}

function isPreviewAllowed(preview: PricePreviewData | null): boolean {
  if (!preview) return false;
  const eligibility = getPreviewEligibility(preview);
  const canChangePrice = eligibility?.canChangePrice ?? preview.canChangePrice;
  if (canChangePrice !== true) return false;
  const newPrice = toNumber(preview.newSalePriceExVat);
  const finalMin = toNumber(preview.finalMinPrice);
  if (newPrice != null && finalMin != null && newPrice < finalMin) return false;
  return true;
}

function getBackendErrorMessage(err: unknown, fallback: string): { status?: number; message: string } {
  const e = err as { response?: { status?: number; data?: { message?: string; errorMessage?: string; code?: string } } };
  const status = e.response?.status;
  const data = e.response?.data;
  const msg = data?.message || data?.errorMessage || fallback;
  return { status, message: msg };
}

export default function PlatformProductPriceChangeModal({
  open,
  product,
  currentShopId,
  onCancel,
  onSuccess,
}: PlatformProductPriceChangeModalProps) {
  const [newSalePriceExVat, setNewSalePriceExVat] = useState<number | null>(null);
  const [reason, setReason] = useState('运营手动改价');
  const [preview, setPreview] = useState<PricePreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<PriceExecuteData | null>(null);
  const [dirtyAfterPreview, setDirtyAfterPreview] = useState(false);

  const storeProductId = useMemo(() => resolveStoreProductId(product), [product]);
  const resolvedShopId = useMemo(() => resolveShopId(product, currentShopId), [product, currentShopId]);
  const currency = preview?.currency ?? product?.currency ?? '';
  const currentPrice = product?.price ?? product?.sale_price ?? product?.salePrice ?? preview?.currentSalePriceExVat ?? null;
  const stock = product?.platformStock ?? product?.platform_stock ?? product?.stock ?? null;
  const eligibility = getPreviewEligibility(preview);
  const previewAllowed = isPreviewAllowed(preview);
  const reasonValid = reason.trim().length >= 5 && reason.trim().length <= 500;
  const priceValid = newSalePriceExVat != null && newSalePriceExVat > 0;
  const canExecute = !!preview && previewAllowed && !dirtyAfterPreview && reasonValid && priceValid && !executing;
  const costWarnings = toWarningList(preview?.costWarnings);
  const warnings = toWarningList(preview?.warnings);
  const finalMin = toNumber(preview?.finalMinPrice);
  const previewNewPrice = toNumber(preview?.newSalePriceExVat);
  const belowFinalMin = previewNewPrice != null && finalMin != null && previewNewPrice < finalMin;
  const costStatus = normalizeEnumValue(preview?.costStatus);
  const fbeEstimateHint = [...costWarnings, ...warnings].some((item) => {
    const text = item.toLowerCase();
    return text.includes('fbe') || item.includes('估算');
  }) || costStatus === 'ESTIMATED';

  useEffect(() => {
    if (!open) return;
    setNewSalePriceExVat(null);
    setReason('运营手动改价');
    setPreview(null);
    setExecuteResult(null);
    setDirtyAfterPreview(false);
    setPreviewLoading(false);
    setExecuting(false);
  }, [open, product?.id]);

  const markPreviewDirty = () => {
    if (preview) setDirtyAfterPreview(true);
    setExecuteResult(null);
  };

  const handlePreview = async () => {
    if (!storeProductId) {
      message.error('缺少平台产品ID');
      return;
    }
    if (!resolvedShopId) {
      message.error('缺少店铺ID');
      return;
    }
    if (!priceValid) {
      message.error('新售价必须大于 0');
      return;
    }

    const normalizedPrice = Number(newSalePriceExVat!.toFixed(2));
    setPreviewLoading(true);
    setExecuteResult(null);
    try {
      const { data: res } = await request.post<ApiResponse<PricePreviewData>>(
        `/store-products/${storeProductId}/price/preview`,
        {
          shopId: resolvedShopId,
          newSalePriceExVat: normalizedPrice,
        },
      );
      if (res.code === 200 && res.data) {
        setPreview(res.data);
        setDirtyAfterPreview(false);
      } else {
        setPreview(null);
        message.error(res.message || '改价预览失败');
      }
    } catch (err) {
      const parsed = getBackendErrorMessage(err, '改价预览失败');
      if (parsed.status === 403) {
        message.error('当前账号没有手动改价权限，请联系管理员分配 ACTION_STORE_PRODUCT_PRICE_CHANGE');
      } else {
        message.error(parsed.message);
      }
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const executePriceChange = async () => {
    if (!product || !storeProductId || !resolvedShopId || !newSalePriceExVat) return;
    const normalizedPrice = Number(newSalePriceExVat.toFixed(2));
    setExecuting(true);
    try {
      const { data: res } = await request.post<ApiResponse<PriceExecuteData>>(
        `/store-products/${storeProductId}/price/execute`,
        {
          shopId: resolvedShopId,
          newSalePriceExVat: normalizedPrice,
          reason: reason.trim(),
        },
      );
      const data = res.data ?? null;
      if (res.code === 200 && data) {
        setExecuteResult(data);
        const status = normalizeEnumValue(data.status ?? data.code);
        const noWrite = data.noEmagWriteExecuted === true || status === 'DRY_RUN_ONLY' || status === 'SKIPPED';
        if (status === 'SUCCESS' && !noWrite) {
          message.success('改价已提交成功');
          onSuccess();
        } else if (status === 'DRY_RUN_ONLY' || status === 'SKIPPED' || noWrite) {
          message.warning('后端当前处于安全模式，未发送 eMAG 写请求，未真实改价');
        } else if (status === 'PENDING_VERIFY') {
          message.warning('eMAG 状态不明，请人工核查');
        } else if (status === 'FAILED') {
          message.error(data.message || data.errorMessage || '改价失败');
        } else {
          message.info(res.message || data.message || '改价请求已返回');
        }
      } else {
        message.error(res.message || '改价失败');
      }
    } catch (err) {
      const parsed = getBackendErrorMessage(err, '改价失败');
      if (parsed.status === 403) {
        message.error('当前账号没有手动改价权限，请联系管理员分配 ACTION_STORE_PRODUCT_PRICE_CHANGE');
      } else {
        message.error(parsed.message);
      }
    } finally {
      setExecuting(false);
    }
  };

  const handleExecute = () => {
    if (!canExecute) return;
    Modal.confirm({
      title: '确认改价',
      content: `确认要将该 offer 售价调整为 ${formatMoney(newSalePriceExVat, currency)}（不含 VAT）吗？`,
      okText: '确认改价',
      cancelText: '取消',
      onOk: executePriceChange,
    });
  };

  const renderPreviewAlert = () => {
    if (!preview) return null;
    const canChange = eligibility?.canChangePrice ?? preview.canChangePrice;
    const backendMessage = eligibility?.message || preview.blockMessage;
    if (canChange === true && !belowFinalMin) {
      return <Alert type="success" showIcon message="允许改价" style={{ marginBottom: 12 }} />;
    }
    return (
      <Alert
        type="error"
        showIcon
        message={belowFinalMin ? '新售价低于最低保护价，禁止改价' : (backendMessage || '暂不能改价')}
        style={{ marginBottom: 12 }}
      />
    );
  };

  const renderCostStatus = () => {
    if (!costStatus) return <Tag>未知</Tag>;
    if (costStatus === 'COMPLETE') return <Tag color="success">COMPLETE</Tag>;
    if (costStatus === 'ESTIMATED') return <Tag color="warning">ESTIMATED</Tag>;
    if (costStatus.startsWith('MISSING')) return <Tag color="error">{costStatus}</Tag>;
    return <Tag color="default">{costStatus}</Tag>;
  };

  const renderExecuteResult = () => {
    if (!executeResult) return null;
    const status = normalizeEnumValue(executeResult.status ?? executeResult.code);
    const noWrite = executeResult.noEmagWriteExecuted === true || status === 'DRY_RUN_ONLY' || status === 'SKIPPED';
    let type: 'success' | 'info' | 'warning' | 'error' = 'info';
    let title = executeResult.message || '改价请求已返回';
    if (status === 'SUCCESS' && !noWrite) {
      type = executeResult.readBackStatus === 'UNCONFIRMED' ? 'warning' : 'success';
      title = executeResult.readBackStatus === 'UNCONFIRMED'
        ? '已提交 eMAG，等待平台回读确认'
        : '改价已确认';
    } else if (status === 'DRY_RUN_ONLY' || status === 'SKIPPED' || noWrite) {
      type = 'warning';
      title = '后端当前处于安全模式，未发送 eMAG 写请求，未真实改价';
    } else if (status === 'PENDING_VERIFY') {
      type = 'warning';
      title = '已提交 eMAG，等待平台回读确认';
    } else if (status === 'FAILED') {
      type = 'error';
      title = executeResult.message || executeResult.errorMessage || '改价失败';
    }

    return (
      <div style={{ marginTop: 14 }}>
        <Alert type={type} showIcon message={title} />
        <Descriptions size="small" column={2} style={{ marginTop: 12 }}>
          <Descriptions.Item label="状态">{status || '-'}</Descriptions.Item>
          <Descriptions.Item label="日志ID">{executeResult.logId ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="原售价">{formatMoney(executeResult.oldSalePriceExVat, currency)}</Descriptions.Item>
          <Descriptions.Item label="新售价">{formatMoney(executeResult.newSalePriceExVat, currency)}</Descriptions.Item>
          <Descriptions.Item label="readBackStatus">{executeResult.readBackStatus ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="readBackPrice">{formatMoney(executeResult.readBackPrice, currency)}</Descriptions.Item>
          <Descriptions.Item label="毛利重算">{executeResult.profitRecalculated == null ? '-' : (executeResult.profitRecalculated ? '是' : '否')}</Descriptions.Item>
          <Descriptions.Item label="是否真实写 eMAG">{noWrite ? '未真实改价' : '已发送写请求'}</Descriptions.Item>
        </Descriptions>
        {executeResult.readBackStatus === 'CONFIRMED' && (
          <Alert type="success" showIcon message="eMAG 对账已确认" style={{ marginTop: 8 }} />
        )}
        {executeResult.readBackStatus === 'UNCONFIRMED' && (
          <Alert type="warning" showIcon message="API 对账待确认" style={{ marginTop: 8 }} />
        )}
        {executeResult.readBackStatus === 'READBACK_FAILED' && (
          <Alert type="warning" showIcon message="API 回读失败，请稍后刷新或人工确认" style={{ marginTop: 8 }} />
        )}
        {executeResult.readBackWarning && (
          <Alert type="warning" showIcon message={executeResult.readBackWarning} style={{ marginTop: 8 }} />
        )}
        {executeResult.profitRecalcWarning && (
          <Alert type="warning" showIcon message={executeResult.profitRecalcWarning} style={{ marginTop: 8 }} />
        )}
      </div>
    );
  };

  const payload = preview?.payloadPreview;

  return (
    <Modal
      title="手动改价"
      open={open}
      onCancel={onCancel}
      width={820}
      destroyOnClose
      footer={[
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button key="preview" loading={previewLoading} onClick={handlePreview}>
          预览
        </Button>,
        <Button key="execute" type="primary" loading={executing} disabled={!canExecute} onClick={handleExecute}>
          确认改价
        </Button>,
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
              <Descriptions.Item label="链接类型">{getLinkTypeLabel(product)}</Descriptions.Item>
              <Descriptions.Item label="当前售价（不含 VAT）">{formatMoney(currentPrice, currency)}</Descriptions.Item>
              <Descriptions.Item label="币种">{String(currency || '-')}</Descriptions.Item>
              <Descriptions.Item label="库存">{stock ?? '-'}</Descriptions.Item>
            </Descriptions>
          </div>

          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Text strong>新售价（不含 VAT）</Text>
              <InputNumber
                min={0.01}
                precision={2}
                value={newSalePriceExVat}
                onChange={(value) => {
                  setNewSalePriceExVat(typeof value === 'number' ? value : toNumber(value));
                  markPreviewDirty();
                }}
                placeholder="请输入新售价"
                style={{ width: '100%', marginTop: 6 }}
              />
            </div>

            <div>
              <Text strong>调价原因</Text>
              <Input.TextArea
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  markPreviewDirty();
                }}
                rows={3}
                maxLength={500}
                showCount
                placeholder="请输入 5-500 字调价原因"
                style={{ marginTop: 6 }}
              />
              {!reasonValid && (
                <Text type="danger" style={{ fontSize: 12 }}>调价原因需填写 5-500 字</Text>
              )}
            </div>
          </Space>

          {dirtyAfterPreview && (
            <Alert type="warning" showIcon message="价格或原因已修改，请重新预览后再确认改价" style={{ marginTop: 12 }} />
          )}

          {preview && (
            <div style={{ marginTop: 16 }}>
              <Divider style={{ margin: '10px 0 14px' }} />
              {renderPreviewAlert()}
              <Descriptions size="small" column={2}>
                <Descriptions.Item label="当前价">{formatMoney(preview.currentSalePriceExVat, currency)}</Descriptions.Item>
                <Descriptions.Item label="新售价（不含 VAT）">{formatMoney(preview.newSalePriceExVat, currency)}</Descriptions.Item>
                <Descriptions.Item label="新售价（含 VAT）">{formatMoney(preview.newSalePriceIncVat, currency)}</Descriptions.Item>
                <Descriptions.Item label="VAT">{formatPct(preview.vatRate)}</Descriptions.Item>
                <Descriptions.Item label="最低保护价">{formatMoney(preview.finalMinPrice, currency)}</Descriptions.Item>
                <Descriptions.Item label="硬底价">{formatMoney(preview.hardFloorPrice, currency)}</Descriptions.Item>
                <Descriptions.Item label="建议最低价">{formatMoney(preview.suggestedMinPrice, currency)}</Descriptions.Item>
                <Descriptions.Item label="人工最低价">{formatMoney(preview.manualMinPrice, currency)}</Descriptions.Item>
                <Descriptions.Item label="改价后预估毛利">{formatMoney(preview.estimatedProfitAfter, currency)}</Descriptions.Item>
                <Descriptions.Item label="改价后毛利率">{formatPct(preview.profitMarginPctAfter)}</Descriptions.Item>
                <Descriptions.Item label="成本完整度">{renderCostStatus()}</Descriptions.Item>
                <Descriptions.Item label="资格码">{eligibility?.code ?? preview.blockCode ?? '-'}</Descriptions.Item>
              </Descriptions>
              {[...costWarnings, ...warnings].length > 0 && (
                <Alert
                  type={costStatus.startsWith('MISSING') ? 'error' : 'warning'}
                  showIcon
                  message="风险提示"
                  description={[...costWarnings, ...warnings].map((w) => <div key={w}>{w}</div>)}
                  style={{ marginTop: 12 }}
                />
              )}
              {fbeEstimateHint && (
                <Alert
                  type="warning"
                  showIcon
                  message="FBE 费用存在估算或成本资料非完整状态"
                  description="请以最终回读与财务成本为准，必要时先维护 FBE/履约成本后再执行真实改价。"
                  style={{ marginTop: 12 }}
                />
              )}
              {payload && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: 'pointer', color: '#2563eb' }}>payloadPreview 折叠区</summary>
                  <pre style={{ marginTop: 8, padding: 10, background: '#0f172a', color: '#e2e8f0', borderRadius: 6, overflowX: 'auto', fontSize: 12 }}>
                    {JSON.stringify(payload, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}

          {renderExecuteResult()}
        </>
      ) : (
        <Alert type="warning" showIcon message="未选择平台产品" />
      )}
    </Modal>
  );
}
