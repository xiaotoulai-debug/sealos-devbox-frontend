import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Descriptions, Modal, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import request from '../lib/request';

const { Text } = Typography;

type PriceActionMode = 'MANUAL_PRICE_CHANGE' | 'MANUAL_GRAB_CART' | string;
type PriceActionStatus = 'SUCCESS' | 'PENDING_VERIFY' | 'FAILED' | 'SKIPPED' | 'DRY_RUN_ONLY' | string;

interface StoreProductPriceActionLogTarget {
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
  currency?: string | null;
}

interface RawPriceActionLog {
  id?: number | string | null;
  logId?: number | string | null;
  log_id?: number | string | null;
  mode?: PriceActionMode | null;
  actionMode?: PriceActionMode | null;
  action_mode?: PriceActionMode | null;
  type?: PriceActionMode | null;
  status?: PriceActionStatus | null;
  code?: string | number | null;
  oldPrice?: number | null;
  old_price?: number | null;
  oldSalePriceExVat?: number | null;
  old_sale_price_ex_vat?: number | null;
  newPrice?: number | null;
  new_price?: number | null;
  newSalePriceExVat?: number | null;
  new_sale_price_ex_vat?: number | null;
  currency?: string | null;
  reason?: string | null;
  executedAt?: string | null;
  executed_at?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  readBackStatus?: string | null;
  read_back_status?: string | null;
  readBackPrice?: number | null;
  read_back_price?: number | null;
  readBackWarning?: string | null;
  read_back_warning?: string | null;
  message?: string | null;
  errorMessage?: string | null;
  error_message?: string | null;
  canReconcile?: boolean | null;
  can_reconcile?: boolean | null;
}

interface ApiResponse<T> {
  code: number | string;
  data?: T | null;
  message?: string;
}

interface PriceActionLogRecord {
  key: string;
  id: number | string | null;
  mode: string;
  status: string;
  oldPrice: number | null;
  newPrice: number | null;
  currency: string | null;
  executedAt: string | null;
  reason: string | null;
  readBackStatus: string | null;
  readBackPrice: number | null;
  readBackWarning: string | null;
  message: string | null;
  canReconcile: boolean;
}

interface PlatformProductPriceActionLogModalProps {
  open: boolean;
  product: StoreProductPriceActionLogTarget | null;
  currentShopId: number | null;
  onCancel: () => void;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function normalizeEnumValue(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function resolveStoreProductId(product: StoreProductPriceActionLogTarget | null): number | null {
  return toNumber(product?.storeProductId ?? product?.store_product_id ?? product?.id);
}

function resolveShopId(product: StoreProductPriceActionLogTarget | null, currentShopId: number | null): number | null {
  return toNumber(product?.shopId ?? product?.shop_id ?? currentShopId);
}

function getProductName(product: StoreProductPriceActionLogTarget | null): string {
  return String(product?.title ?? product?.name ?? product?.product_name ?? product?.productName ?? '').trim() || '-';
}

function getProductSku(product: StoreProductPriceActionLogTarget | null): string {
  return String(product?.vendorSku ?? product?.vendor_sku ?? product?.sku ?? '').trim() || '-';
}

function getProductPnk(product: StoreProductPriceActionLogTarget | null): string {
  return String(product?.pnk ?? product?.part_number_key ?? product?.partNumber ?? product?.part_number ?? '').trim() || '-';
}

function formatMoney(value: number | null | undefined, currency?: string | null): string {
  if (value == null || Number.isNaN(Number(value))) return '-';
  const suffix = String(currency ?? '').trim();
  return suffix ? `${Number(value).toFixed(2)} ${suffix}` : Number(value).toFixed(2);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const text = String(value);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function normalizeMode(value: unknown): string {
  const mode = normalizeEnumValue(value);
  if (mode === 'MANUAL_PRICE_CHANGE' || mode === 'PRICE_CHANGE') return '手动改价';
  if (mode === 'MANUAL_GRAB_CART' || mode === 'GRAB_CART') return '手动抢车';
  return mode || '-';
}

function renderStatusTag(status: string) {
  const normalized = normalizeEnumValue(status);
  if (normalized === 'SUCCESS') return <Tag color="success">SUCCESS</Tag>;
  if (normalized === 'PENDING_VERIFY') return <Tag color="warning">PENDING_VERIFY · 等待平台确认</Tag>;
  if (normalized === 'FAILED') return <Tag color="error">FAILED</Tag>;
  if (normalized === 'SKIPPED' || normalized === 'DRY_RUN_ONLY') return <Tag color="default">{normalized} · 安全模式</Tag>;
  return <Tag>{normalized || '-'}</Tag>;
}

function normalizeLog(raw: RawPriceActionLog, index: number, fallbackCurrency?: string | null): PriceActionLogRecord {
  const id = raw.id ?? raw.logId ?? raw.log_id ?? null;
  const status = pickString(raw.status, raw.code) ?? '';
  const currency = pickString(raw.currency, fallbackCurrency);
  return {
    key: String(id ?? index),
    id,
    mode: normalizeMode(raw.mode ?? raw.actionMode ?? raw.action_mode ?? raw.type),
    status,
    oldPrice: toNumber(raw.oldSalePriceExVat ?? raw.old_sale_price_ex_vat ?? raw.oldPrice ?? raw.old_price),
    newPrice: toNumber(raw.newSalePriceExVat ?? raw.new_sale_price_ex_vat ?? raw.newPrice ?? raw.new_price),
    currency,
    executedAt: pickString(raw.executedAt, raw.executed_at, raw.createdAt, raw.created_at),
    reason: pickString(raw.reason),
    readBackStatus: pickString(raw.readBackStatus, raw.read_back_status),
    readBackPrice: toNumber(raw.readBackPrice ?? raw.read_back_price),
    readBackWarning: pickString(raw.readBackWarning, raw.read_back_warning),
    message: pickString(raw.message, raw.errorMessage, raw.error_message),
    canReconcile: raw.canReconcile === true || raw.can_reconcile === true || normalizeEnumValue(status) === 'PENDING_VERIFY',
  };
}

function getLogListPayload(payload: unknown): RawPriceActionLog[] {
  if (Array.isArray(payload)) return payload as RawPriceActionLog[];
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as { list?: unknown; items?: unknown; logs?: unknown; records?: unknown };
  const candidate = obj.list ?? obj.items ?? obj.logs ?? obj.records;
  return Array.isArray(candidate) ? candidate as RawPriceActionLog[] : [];
}

function getBackendErrorMessage(err: unknown, fallback: string): { status?: number; message: string } {
  const e = err as { response?: { status?: number; data?: { message?: string; errorMessage?: string } }; message?: string };
  return {
    status: e.response?.status,
    message: e.response?.data?.message || e.response?.data?.errorMessage || e.message || fallback,
  };
}

export default function PlatformProductPriceActionLogModal({
  open,
  product,
  currentShopId,
  onCancel,
}: PlatformProductPriceActionLogModalProps) {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<PriceActionLogRecord[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reconcileLoadingId, setReconcileLoadingId] = useState<string | null>(null);

  const storeProductId = useMemo(() => resolveStoreProductId(product), [product]);
  const resolvedShopId = useMemo(() => resolveShopId(product, currentShopId), [product, currentShopId]);
  const currency = product?.currency ?? logs.find((item) => item.currency)?.currency ?? '';

  const loadLogs = async () => {
    if (!storeProductId) {
      setErrorMessage('缺少平台产品ID，无法加载调价日志');
      setLogs([]);
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const { data: res } = await request.get<ApiResponse<unknown>>(
        `/store-products/${storeProductId}/price-action-logs`,
        { params: { shopId: resolvedShopId ?? undefined } },
      );
      if (Number(res.code) === 200) {
        setLogs(getLogListPayload(res.data).map((item, index) => normalizeLog(item, index, currency)));
      } else {
        setLogs([]);
        setErrorMessage(res.message || '加载调价日志失败');
      }
    } catch (err) {
      const parsed = getBackendErrorMessage(err, '加载调价日志失败');
      setLogs([]);
      setErrorMessage(parsed.status === 404 ? '后端暂未提供调价日志接口' : parsed.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setLogs([]);
    setErrorMessage(null);
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, storeProductId, resolvedShopId]);

  const handleReconcile = async (record: PriceActionLogRecord) => {
    if (!record.id) return;
    const id = String(record.id);
    setReconcileLoadingId(id);
    try {
      const { data: res } = await request.post<ApiResponse<unknown>>(
        `/store-products/price-action-logs/${encodeURIComponent(id)}/reconcile`,
        { shopId: resolvedShopId ?? undefined },
      );
      if (Number(res.code) === 200) {
        message.success('已触发重新核验');
        await loadLogs();
      } else {
        message.warning(res.message || '后端暂未完成重新核验');
      }
    } catch (err) {
      const parsed = getBackendErrorMessage(err, '重新核验失败');
      message.warning(parsed.status === 404 ? '后端暂未提供重新核验接口' : parsed.message);
    } finally {
      setReconcileLoadingId(null);
    }
  };

  const columns: ColumnsType<PriceActionLogRecord> = [
    {
      title: '模式',
      dataIndex: 'mode',
      width: 100,
      render: (value: string) => <Tag color={value === '手动抢车' ? 'blue' : 'purple'}>{value}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 170,
      render: renderStatusTag,
    },
    {
      title: '旧价',
      dataIndex: 'oldPrice',
      width: 110,
      align: 'right',
      render: (value: number | null, record) => formatMoney(value, record.currency),
    },
    {
      title: '新价',
      dataIndex: 'newPrice',
      width: 110,
      align: 'right',
      render: (value: number | null, record) => formatMoney(value, record.currency),
    },
    {
      title: '执行时间',
      dataIndex: 'executedAt',
      width: 170,
      render: formatDateTime,
    },
    {
      title: '原因',
      dataIndex: 'reason',
      width: 220,
      render: (value: string | null) => value || '-',
    },
    {
      title: 'readBack',
      key: 'readBack',
      width: 180,
      render: (_: unknown, record) => (
        <Space direction="vertical" size={2}>
          <Text>{record.readBackStatus || '-'}</Text>
          <Text>{formatMoney(record.readBackPrice, record.currency)}</Text>
          {record.readBackWarning && <Text type="warning">{record.readBackWarning}</Text>}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 110,
      fixed: 'right',
      render: (_: unknown, record) => (
        record.canReconcile ? (
          <Button
            size="small"
            loading={reconcileLoadingId === String(record.id)}
            onClick={() => handleReconcile(record)}
          >
            重新核验
          </Button>
        ) : '-'
      ),
    },
  ];

  return (
    <Modal
      title="调价日志"
      open={open}
      onCancel={onCancel}
      width={1100}
      destroyOnClose
      footer={[
        <Button key="refresh" loading={loading} onClick={loadLogs}>刷新</Button>,
        <Button key="close" type="primary" onClick={onCancel}>关闭</Button>,
      ]}
    >
      {product ? (
        <>
          <div style={{ padding: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 12 }}>
            <Descriptions size="small" column={3}>
              <Descriptions.Item label="产品名" span={3}>{getProductName(product)}</Descriptions.Item>
              <Descriptions.Item label="SKU">{getProductSku(product)}</Descriptions.Item>
              <Descriptions.Item label="EAN">{String(product.ean ?? '').trim() || '-'}</Descriptions.Item>
              <Descriptions.Item label="PNK">{getProductPnk(product)}</Descriptions.Item>
            </Descriptions>
          </div>
          {errorMessage && <Alert type="warning" showIcon message={errorMessage} style={{ marginBottom: 12 }} />}
          <Table<PriceActionLogRecord>
            rowKey="key"
            loading={loading}
            dataSource={logs}
            columns={columns}
            size="small"
            pagination={{ pageSize: 8, showSizeChanger: false }}
            scroll={{ x: 'max-content', y: 360 }}
            locale={{ emptyText: errorMessage ? '暂无可展示日志' : '暂无调价日志' }}
          />
        </>
      ) : (
        <Alert type="warning" showIcon message="未选择平台产品" />
      )}
    </Modal>
  );
}
