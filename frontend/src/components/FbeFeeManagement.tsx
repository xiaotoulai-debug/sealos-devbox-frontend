import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Col, Descriptions, Form, Input, InputNumber, Modal,
  Row, Select, Space, Statistic, Table, Tag, Typography, message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import { DownloadOutlined, EditOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons';
import request from '../lib/request';
import { downloadXlsxTemplate } from '../utils/excelImport';
import FbeFeeBatchImportModal from './FbeFeeBatchImportModal';

const { Text } = Typography;

type FeeStatusFilter = 'ALL' | 'ACTUAL' | 'ESTIMATED' | 'UNMAPPED';
type FeeScopeType = 'SKU_DEFAULT' | 'SHOP_OVERRIDE' | string;

interface ApiResponse<T> {
  code: number | string;
  data?: T | null;
  message?: string;
}

interface ShopOption {
  id: number;
  shopName: string;
  region?: string | null;
  site?: string | null;
}

interface FbeFeeSummary {
  actualCoverageRate: number | null;
  skuDefaultFeeCount: number | null;
  shopOverrideFeeCount: number | null;
  estimated7RmbCount: number | null;
  grabCartBlockedByFbeCount: number | null;
}

interface FbeFeeRecord {
  key: string;
  storeProductId: number | null;
  productId: number | null;
  shopId: number | null;
  shopName: string;
  region: string;
  sku: string;
  pnk: string;
  productName: string;
  effectiveFbeFeeCny: number | null;
  feeScope: string;
  feeScopeLabel: string;
  source: string;
  updatedAt: string | null;
  profitMarginPct: number | null;
  grabCartCostStatus: string;
}

interface BatchPreviewRow {
  key: string;
  scope: string;
  shopId: number | null;
  sku: string;
  pnk: string;
  oldFeeCny: number | null;
  newFeeCny: number | null;
  matchStatus: string;
  affectedStoreProductCount: number | null;
  message: string;
  status: string;
}

interface BatchPreviewSummary {
  success: number;
  unchanged: number;
  errors: number;
  ambiguous: number;
  unmapped: number;
}

interface BatchPreviewResult {
  rows: BatchPreviewRow[];
  summary: BatchPreviewSummary;
  executePayload: Record<string, unknown>;
}

interface EditFormValues {
  scope: 'SKU_DEFAULT' | 'SHOP_OVERRIDE';
  feeCny: number;
  note?: string;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
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

function fmtMoneyCny(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '-';
  return `¥${Number(value).toFixed(2)}`;
}

function fmtPct(value: number | null | undefined): string {
  const pct = normalizePercent(value ?? null);
  if (pct == null) return '-';
  return `${pct.toFixed(2)}%`;
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function getFeeScopeLabel(scope: string): string {
  const s = normalizeEnum(scope);
  if (s === 'SHOP_OVERRIDE' || s === 'SHOP') return '店铺覆盖';
  if (s === 'SKU_DEFAULT' || s === 'SKU') return 'SKU默认';
  if (s.includes('ESTIMATED') || s === 'DEFAULT_7RMB' || s === '7_RMB') return '7 RMB估算';
  return scope || '-';
}

function getListPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;
  return Array.isArray(obj.list) ? obj.list
    : Array.isArray(obj.items) ? obj.items
      : Array.isArray(obj.records) ? obj.records
        : Array.isArray(obj.rows) ? obj.rows
          : [];
}

function normalizeSummary(raw: unknown): FbeFeeSummary {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const rate = toNumber(data.actualCoverageRate ?? data.actual_coverage_rate ?? data.coverageRate ?? data.coverage_rate);
  return {
    actualCoverageRate: rate,
    skuDefaultFeeCount: toNumber(data.skuDefaultFeeCount ?? data.sku_default_fee_count),
    shopOverrideFeeCount: toNumber(data.shopOverrideFeeCount ?? data.shop_override_fee_count),
    estimated7RmbCount: toNumber(
      data.estimated7RmbCount ?? data.estimated_7_rmb_count ?? data.estimatedCount ?? data.estimated_count,
    ),
    grabCartBlockedByFbeCount: toNumber(
      data.grabCartBlockedByFbeCount ?? data.grab_cart_blocked_by_fbe_count ?? data.grabCartBlockedCount,
    ),
  };
}

function normalizeRecord(raw: unknown, index: number): FbeFeeRecord {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const shop = data.shop && typeof data.shop === 'object' ? data.shop as Record<string, unknown> : {};
  const feeScope = pickString(data.feeScope, data.fee_scope, data.scope, data.effectiveScope, data.effective_scope);
  return {
    key: String(data.id ?? data.storeProductId ?? data.store_product_id ?? `row-${index}`),
    storeProductId: toNumber(data.storeProductId ?? data.store_product_id),
    productId: toNumber(data.productId ?? data.product_id),
    shopId: toNumber(data.shopId ?? data.shop_id ?? shop.id),
    shopName: pickString(data.shopName, data.shop_name, shop.shopName, shop.shop_name, shop.name),
    region: pickString(data.region, data.site, shop.region, shop.site),
    sku: pickString(data.sku, data.vendorSku, data.vendor_sku),
    pnk: pickString(data.pnk, data.partNumberKey, data.part_number_key, data.partNumber, data.part_number),
    productName: pickString(data.productName, data.product_name, data.title, data.name),
    effectiveFbeFeeCny: toNumber(
      data.effectiveFbeFeeCny ?? data.effective_fbe_fee_cny ?? data.fbeFeeCny ?? data.fbe_fee_cny ?? data.fbeFee ?? data.fbe_fee,
    ),
    feeScope,
    feeScopeLabel: getFeeScopeLabel(feeScope),
    source: pickString(data.source, data.feeSource, data.fee_source),
    updatedAt: pickString(data.updatedAt, data.updated_at),
    profitMarginPct: toNumber(data.profitMarginPct ?? data.profit_margin_pct ?? data.grossMarginPct ?? data.gross_margin_pct),
    grabCartCostStatus: pickString(data.grabCartCostStatus, data.grab_cart_cost_status, data.costStatus, data.cost_status),
  };
}

function normalizePreviewRow(raw: unknown, index: number): BatchPreviewRow {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const status = pickString(data.status, data.result, data.matchStatus, data.match_status) || 'UNKNOWN';
  return {
    key: String(data.id ?? data.sku ?? data.pnk ?? `preview-${index}`),
    scope: pickString(data.scope),
    shopId: toNumber(data.shopId ?? data.shop_id),
    sku: pickString(data.sku, data.vendorSku, data.vendor_sku),
    pnk: pickString(data.pnk, data.partNumberKey, data.part_number_key),
    oldFeeCny: toNumber(data.oldFeeCny ?? data.old_fee_cny ?? data.oldFee ?? data.old_fee),
    newFeeCny: toNumber(data.newFeeCny ?? data.new_fee_cny ?? data.newFee ?? data.new_fee ?? data.feeCny ?? data.fee_cny),
    matchStatus: pickString(data.matchStatus, data.match_status, data.status),
    affectedStoreProductCount: toNumber(data.affectedStoreProductCount ?? data.affected_store_product_count ?? data.affectedCount),
    message: pickString(data.message, data.errorMessage, data.error_message, data.reason),
    status,
  };
}

function normalizePreviewSummary(raw: unknown): BatchPreviewSummary {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    success: toNumber(data.success ?? data.successCount ?? data.success_count) ?? 0,
    unchanged: toNumber(data.unchanged ?? data.unchangedCount ?? data.unchanged_count) ?? 0,
    errors: toNumber(data.errors ?? data.errorCount ?? data.error_count ?? data.failed) ?? 0,
    ambiguous: toNumber(data.ambiguous ?? data.ambiguousCount ?? data.ambiguous_count) ?? 0,
    unmapped: toNumber(data.unmapped ?? data.unmappedCount ?? data.unmapped_count) ?? 0,
  };
}

function getApiError(err: unknown, fallback: string): { status?: number; message: string } {
  const e = err as { response?: { status?: number; data?: { message?: string; errorMessage?: string } }; message?: string };
  return {
    status: e.response?.status,
    message: e.response?.data?.message || e.response?.data?.errorMessage || e.message || fallback,
  };
}

function handleFeeApiError(err: unknown, fallback: string) {
  const parsed = getApiError(err, fallback);
  if (parsed.status === 403) {
    message.error('无权限修改 FBE');
  } else if (parsed.status === 422 || parsed.status === 400) {
    message.error(parsed.message || '导入行校验失败');
  } else if (parsed.status === 500) {
    message.error(parsed.message || '保存失败');
  } else {
    message.error(parsed.message);
  }
}

function renderCostStatusTag(status: string) {
  const s = normalizeEnum(status);
  if (!s) return <Tag>-</Tag>;
  if (s === 'COMPLETE' || s === 'READY' || s === 'ACTUAL') return <Tag color="success">{status}</Tag>;
  if (s === 'ESTIMATED' || s.includes('7_RMB') || s.includes('ESTIMATE')) return <Tag color="warning">{status}</Tag>;
  if (s === 'MISSING' || s === 'UNMAPPED') return <Tag color="error">{status}</Tag>;
  return <Tag>{status}</Tag>;
}

export default function FbeFeeManagement() {
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [summary, setSummary] = useState<FbeFeeSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [records, setRecords] = useState<FbeFeeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [shopId, setShopId] = useState<number | null>(null);
  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [feeStatus, setFeeStatus] = useState<FeeStatusFilter>('ALL');

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FbeFeeRecord | null>(null);
  const [editForm] = Form.useForm<EditFormValues>();
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<BatchPreviewResult | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);

  const [importOpen, setImportOpen] = useState(false);

  const loadShops = useCallback(async () => {
    try {
      const { data: res } = await request.get<ApiResponse<ShopOption[]>>('/shops');
      if (res.code === 200 && Array.isArray(res.data)) setShops(res.data);
      else setShops([]);
    } catch {
      setShops([]);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const { data: res } = await request.get<ApiResponse<unknown>>('/fbe-fees/summary', {
        params: { shopId: shopId ?? undefined },
      });
      if (Number(res.code) === 200) setSummary(normalizeSummary(res.data));
      else setSummary(null);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [shopId]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await request.get<ApiResponse<unknown>>('/fbe-fees/records', {
        params: {
          shopId: shopId ?? undefined,
          keyword: appliedKeyword || undefined,
          search: appliedKeyword || undefined,
          feeStatus: feeStatus !== 'ALL' ? feeStatus : undefined,
          page,
          pageSize,
        },
      });
      if (Number(res.code) === 200) {
        const payload = res.data;
        const list = getListPayload(payload).map((item, index) => normalizeRecord(item, index));
        setRecords(list);
        const obj = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
        setTotal(toNumber(obj.total ?? obj.totalCount ?? obj.count) ?? list.length);
      } else {
        setRecords([]);
        setTotal(0);
        message.warning(res.message || '加载 FBE 费用列表失败');
      }
    } catch (err) {
      setRecords([]);
      setTotal(0);
      message.error(getApiError(err, '加载 FBE 费用列表失败').message);
    } finally {
      setLoading(false);
    }
  }, [shopId, appliedKeyword, feeStatus, page, pageSize]);

  const refreshAll = useCallback(() => {
    loadSummary();
    loadRecords();
  }, [loadSummary, loadRecords]);

  useEffect(() => { loadShops(); }, [loadShops]);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadRecords(); }, [loadRecords]);

  const openEdit = (record: FbeFeeRecord) => {
    setEditTarget(record);
    setPreviewResult(null);
    editForm.setFieldsValue({
      scope: record.shopId ? 'SHOP_OVERRIDE' : 'SKU_DEFAULT',
      feeCny: record.effectiveFbeFeeCny ?? undefined,
      note: '',
    });
    setEditOpen(true);
  };

  const buildSingleItemPayload = (values: EditFormValues): Record<string, unknown> => {
    const target = editTarget;
    const item: Record<string, unknown> = {
      scope: values.scope,
      feeCny: values.feeCny,
      note: values.note?.trim() || undefined,
    };
    if (values.scope === 'SHOP_OVERRIDE' && target?.shopId) item.shopId = target.shopId;
    if (target?.sku) item.sku = target.sku;
    if (target?.pnk) item.pnk = target.pnk;
    if (target?.productId) item.productId = target.productId;
    if (target?.storeProductId) item.storeProductId = target.storeProductId;
    return item;
  };

  const handlePreviewSubmit = async () => {
    let values: EditFormValues;
    try {
      values = await editForm.validateFields();
    } catch {
      return;
    }
    setPreviewLoading(true);
    try {
      const items = [buildSingleItemPayload(values)];
      const { data: res } = await request.post<ApiResponse<unknown>>('/fbe-fees/batch/preview', { items });
      if (Number(res.code) !== 200) {
        message.warning(res.message || '预览失败');
        return;
      }
      const data = res.data && typeof res.data === 'object' ? res.data as Record<string, unknown> : {};
      const rows = getListPayload(data.items ?? data.rows ?? data.results ?? data).map((item, index) => normalizePreviewRow(item, index));
      const summaryData = normalizePreviewSummary(data.summary ?? data.stats ?? data);
      setPreviewResult({
        rows,
        summary: summaryData,
        executePayload: { items },
      });
      setEditOpen(false);
      setPreviewOpen(true);
    } catch (err) {
      handleFeeApiError(err, '预览失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExecuteConfirm = async () => {
    if (!previewResult) return;
    setExecuteLoading(true);
    try {
      const { data: res } = await request.post<ApiResponse<unknown>>(
        '/fbe-fees/batch/execute',
        previewResult.executePayload,
      );
      if (Number(res.code) === 200) {
        const data = res.data && typeof res.data === 'object' ? res.data as Record<string, unknown> : {};
        const updated = toNumber(data.updatedCount ?? data.updated_count ?? data.updated);
        const recalc = toNumber(data.profitRecalcCount ?? data.profit_recalc_count ?? data.recalculatedCount);
        message.success(`FBE 费用已更新${updated != null ? `：${updated} 条` : ''}${recalc != null ? `，利润重算 ${recalc} 条` : ''}`);
        setPreviewOpen(false);
        setPreviewResult(null);
        setEditTarget(null);
        refreshAll();
      } else {
        message.warning(res.message || '保存失败');
      }
    } catch (err) {
      handleFeeApiError(err, '保存失败');
    } finally {
      setExecuteLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    downloadXlsxTemplate({
      headers: ['scope', 'shopId', 'SKU', 'PNK', 'feeCny', 'note'],
      sampleRows: [
        ['SKU_DEFAULT', '', 'ABC-001', 'PNK123', 12.5, 'SKU 默认费用示例'],
        ['SHOP_OVERRIDE', 1, 'ABC-001', 'PNK123', 15, '店铺覆盖示例'],
      ],
      colWidths: [16, 10, 16, 16, 10, 24],
      filename: 'FBE费用批量导入模板.xlsx',
      sheetName: 'FBE费用',
    });
  };

  const coveragePct = useMemo(() => {
    const rate = summary?.actualCoverageRate;
    if (rate == null) return '-';
    return `${(Math.abs(rate) <= 1 ? rate * 100 : rate).toFixed(1)}%`;
  }, [summary]);

  const columns: ColumnsType<FbeFeeRecord> = [
    {
      title: '店铺 / 站点',
      width: 140,
      render: (_: unknown, record) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ fontSize: 13 }}>{record.shopName || '-'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.region || '-'}</Text>
        </Space>
      ),
    },
    { title: 'SKU', dataIndex: 'sku', width: 120 },
    { title: 'PNK', dataIndex: 'pnk', width: 120 },
    { title: '产品名', dataIndex: 'productName', width: 180, ellipsis: true },
    {
      title: '有效 FBE 费用',
      width: 120,
      align: 'right',
      render: (_: unknown, record) => fmtMoneyCny(record.effectiveFbeFeeCny),
    },
    {
      title: '费用范围',
      dataIndex: 'feeScopeLabel',
      width: 110,
      render: (value: string) => {
        const color = value.includes('店铺') ? 'blue' : value.includes('SKU') ? 'purple' : 'default';
        return <Tag color={color}>{value}</Tag>;
      },
    },
    { title: '来源', dataIndex: 'source', width: 100, render: (v: string) => v || '-' },
    { title: '更新时间', dataIndex: 'updatedAt', width: 160, render: fmtDateTime },
    {
      title: '毛利率',
      width: 90,
      align: 'right',
      render: (_: unknown, record) => fmtPct(record.profitMarginPct),
    },
    {
      title: '抢车成本状态',
      dataIndex: 'grabCartCostStatus',
      width: 120,
      render: (value: string) => renderCostStatusTag(value),
    },
    {
      title: '操作',
      width: 100,
      fixed: 'right',
      render: (_: unknown, record) => (
        <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>
          录入 / 修改
        </Button>
      ),
    },
  ];

  const previewColumns: ColumnsType<BatchPreviewRow> = [
    { title: 'scope', dataIndex: 'scope', width: 120 },
    { title: 'SKU', dataIndex: 'sku', width: 120 },
    { title: 'PNK', dataIndex: 'pnk', width: 120 },
    { title: '旧费用', width: 90, render: (_: unknown, r) => fmtMoneyCny(r.oldFeeCny) },
    { title: '新费用', width: 90, render: (_: unknown, r) => fmtMoneyCny(r.newFeeCny) },
    { title: '匹配', dataIndex: 'matchStatus', width: 100 },
    { title: '影响店铺商品数', width: 120, render: (_: unknown, r) => r.affectedStoreProductCount ?? '-' },
    { title: '说明', dataIndex: 'message', width: 200, ellipsis: true },
  ];

  return (
    <div>
      <Alert
        type="info"
        showIcon
        message="费用币种：CNY"
        description="优先级：店铺覆盖 > SKU默认 > 7 RMB估算。前端不直接改成本/利润，全部以后端返回为准。"
        style={{ marginBottom: 16 }}
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: '实际 FBE 覆盖率', value: coveragePct },
          { title: '已录入 SKU 默认费用', value: summary?.skuDefaultFeeCount ?? '-' },
          { title: '已录入店铺覆盖费用', value: summary?.shopOverrideFeeCount ?? '-' },
          { title: '仍使用 7 RMB 估算', value: summary?.estimated7RmbCount ?? '-' },
          { title: '受 FBE 缺失影响抢车', value: summary?.grabCartBlockedByFbeCount ?? '-' },
        ].map((item) => (
          <Col key={item.title} xs={24} sm={12} md={8} lg={24 / 5}>
            <Card size="small" loading={summaryLoading}>
              <Statistic title={item.title} value={item.value} />
            </Card>
          </Col>
        ))}
      </Row>

      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <Space wrap>
          <Select
            allowClear
            placeholder="店铺"
            style={{ width: 180 }}
            value={shopId ?? undefined}
            onChange={(val) => { setShopId(val ?? null); setPage(1); }}
            options={shops.map((s) => ({ value: s.id, label: s.shopName }))}
          />
          <Input.Search
            allowClear
            placeholder="SKU / PNK / 产品名"
            style={{ width: 240 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={(v) => { setAppliedKeyword(v.trim()); setPage(1); }}
          />
          <Select<FeeStatusFilter>
            value={feeStatus}
            style={{ width: 140 }}
            onChange={(val) => { setFeeStatus(val); setPage(1); }}
            options={[
              { value: 'ALL', label: '费用状态：全部' },
              { value: 'ACTUAL', label: '实际费用' },
              { value: 'ESTIMATED', label: '估算费用' },
              { value: 'UNMAPPED', label: '缺映射' },
            ]}
          />
        </Space>
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>下载模板</Button>
          <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>批量导入</Button>
          <Button icon={<ReloadOutlined />} onClick={refreshAll}>刷新</Button>
        </Space>
      </div>

      <Table<FbeFeeRecord>
        rowKey="key"
        loading={loading}
        dataSource={records}
        columns={columns}
        scroll={{ x: 'max-content', y: 'calc(100vh - 420px)' }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
        }}
      />

      <Modal
        title="录入 / 修改 FBE 费用"
        open={editOpen}
        onCancel={() => { setEditOpen(false); setEditTarget(null); }}
        onOk={handlePreviewSubmit}
        okText="预览变更"
        confirmLoading={previewLoading}
        destroyOnClose
        width={520}
      >
        {editTarget && (
          <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="SKU">{editTarget.sku || '-'}</Descriptions.Item>
            <Descriptions.Item label="PNK">{editTarget.pnk || '-'}</Descriptions.Item>
            <Descriptions.Item label="产品名" span={2}>{editTarget.productName || '-'}</Descriptions.Item>
            <Descriptions.Item label="当前有效费用">{fmtMoneyCny(editTarget.effectiveFbeFeeCny)}</Descriptions.Item>
            <Descriptions.Item label="当前范围">{editTarget.feeScopeLabel}</Descriptions.Item>
          </Descriptions>
        )}
        <Form form={editForm} layout="vertical">
          <Form.Item name="scope" label="适用范围" rules={[{ required: true, message: '请选择适用范围' }]}>
            <Select options={[
              { value: 'SKU_DEFAULT', label: 'SKU 默认费用' },
              { value: 'SHOP_OVERRIDE', label: '当前店铺覆盖费用', disabled: !editTarget?.shopId },
            ]} />
          </Form.Item>
          <Form.Item name="feeCny" label="FBE 费用（CNY）" rules={[{ required: true, message: '请输入 FBE 费用' }]}>
            <InputNumber min={0} precision={2} prefix="¥" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={2} maxLength={200} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="确认 FBE 费用变更"
        open={previewOpen}
        onCancel={() => { setPreviewOpen(false); setPreviewResult(null); }}
        onOk={handleExecuteConfirm}
        okText="确认保存"
        confirmLoading={executeLoading}
        width={900}
        destroyOnClose
      >
        {previewResult && (
          <>
            <Space wrap style={{ marginBottom: 12 }}>
              <Tag color="success">成功 {previewResult.summary.success}</Tag>
              <Tag>未变化 {previewResult.summary.unchanged}</Tag>
              <Tag color="error">错误 {previewResult.summary.errors}</Tag>
              <Tag color="warning">歧义 {previewResult.summary.ambiguous}</Tag>
              <Tag color="default">缺映射 {previewResult.summary.unmapped}</Tag>
            </Space>
            <Table<BatchPreviewRow>
              size="small"
              rowKey="key"
              dataSource={previewResult.rows}
              columns={previewColumns}
              pagination={false}
              scroll={{ x: 'max-content', y: 280 }}
            />
          </>
        )}
      </Modal>

      <FbeFeeBatchImportModal
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onSuccess={() => {
          setImportOpen(false);
          refreshAll();
        }}
      />
    </div>
  );
}
