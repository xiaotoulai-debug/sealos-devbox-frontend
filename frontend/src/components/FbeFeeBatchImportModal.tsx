import { useMemo, useState } from 'react';
import {
  Alert, Button, Modal, Space, Table, Tag, Upload, message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import type { UploadFile } from 'antd/es/upload/interface';
import { InboxOutlined } from '@ant-design/icons';
import request from '../lib/request';
import { downloadXlsxTemplate, getString, readExcelAsJsonRows } from '../utils/excelImport';

const { Dragger } = Upload;

interface ApiResponse<T> {
  code: number | string;
  data?: T | null;
  message?: string;
}

interface ImportRow {
  scope: string;
  shopId: number | null;
  sku: string;
  pnk: string;
  feeCny: number | null;
  note: string;
}

interface PreviewRow {
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

interface PreviewSummary {
  success: number;
  unchanged: number;
  errors: number;
  ambiguous: number;
  unmapped: number;
}

interface FbeFeeBatchImportModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
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

function getListPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;
  return Array.isArray(obj.list) ? obj.list
    : Array.isArray(obj.items) ? obj.items
      : Array.isArray(obj.rows) ? obj.rows
        : Array.isArray(obj.results) ? obj.results
          : [];
}

function normalizePreviewRow(raw: unknown, index: number): PreviewRow {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    key: String(data.id ?? data.sku ?? data.pnk ?? `row-${index}`),
    scope: pickString(data.scope),
    shopId: toNumber(data.shopId ?? data.shop_id),
    sku: pickString(data.sku, data.SKU),
    pnk: pickString(data.pnk, data.PNK),
    oldFeeCny: toNumber(data.oldFeeCny ?? data.old_fee_cny ?? data.oldFee),
    newFeeCny: toNumber(data.newFeeCny ?? data.new_fee_cny ?? data.newFee ?? data.feeCny ?? data.fee_cny),
    matchStatus: pickString(data.matchStatus, data.match_status, data.status),
    affectedStoreProductCount: toNumber(data.affectedStoreProductCount ?? data.affected_store_product_count),
    message: pickString(data.message, data.errorMessage, data.error_message, data.reason),
    status: pickString(data.status, data.result) || 'UNKNOWN',
  };
}

function normalizePreviewSummary(raw: unknown): PreviewSummary {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    success: toNumber(data.success ?? data.successCount) ?? 0,
    unchanged: toNumber(data.unchanged ?? data.unchangedCount) ?? 0,
    errors: toNumber(data.errors ?? data.errorCount ?? data.failed) ?? 0,
    ambiguous: toNumber(data.ambiguous ?? data.ambiguousCount) ?? 0,
    unmapped: toNumber(data.unmapped ?? data.unmappedCount) ?? 0,
  };
}

function fmtMoneyCny(value: number | null | undefined): string {
  if (value == null) return '-';
  return `¥${Number(value).toFixed(2)}`;
}

function getApiError(err: unknown, fallback: string): { status?: number; message: string } {
  const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
  return {
    status: e.response?.status,
    message: e.response?.data?.message || e.message || fallback,
  };
}

function handleFeeApiError(err: unknown, fallback: string) {
  const parsed = getApiError(err, fallback);
  if (parsed.status === 403) message.error('无权限修改 FBE');
  else if (parsed.status === 422 || parsed.status === 400) message.error(parsed.message || '导入行校验失败');
  else if (parsed.status === 500) message.error(parsed.message || '保存失败');
  else message.error(parsed.message);
}

function parseImportRows(rawRows: Record<string, unknown>[]): { rows: ImportRow[]; errors: string[] } {
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  rawRows.forEach((row, index) => {
    const line = index + 2;
    const scope = getString(row, ['scope', 'Scope', '适用范围']).toUpperCase();
    const sku = getString(row, ['SKU', 'sku', 'Sku']);
    const pnk = getString(row, ['PNK', 'pnk', 'Pnk']);
    const note = getString(row, ['note', 'Note', '备注']);
    const shopRaw = getString(row, ['shopId', 'shop_id', 'ShopId', '店铺ID']);
    const feeRaw = getString(row, ['feeCny', 'fee_cny', 'fee', 'FeeCny', 'FBE费用']);
    if (!scope) {
      errors.push(`第 ${line} 行：缺少 scope`);
      return;
    }
    if (!sku && !pnk) {
      errors.push(`第 ${line} 行：SKU 与 PNK 至少填一项`);
      return;
    }
    if (!feeRaw) {
      errors.push(`第 ${line} 行：缺少 feeCny`);
      return;
    }
    if (!/^\d+(\.\d+)?$/.test(feeRaw)) {
      errors.push(`第 ${line} 行：feeCny 必须为纯数字`);
      return;
    }
    const shopId = shopRaw ? Number(shopRaw) : null;
    if (shopRaw && !Number.isFinite(shopId)) {
      errors.push(`第 ${line} 行：shopId 无效`);
      return;
    }
    if (scope === 'SHOP_OVERRIDE' && !shopId) {
      errors.push(`第 ${line} 行：SHOP_OVERRIDE 必须填写 shopId`);
      return;
    }
    rows.push({
      scope,
      shopId,
      sku,
      pnk,
      feeCny: Number(feeRaw),
      note,
    });
  });
  return { rows, errors };
}

export default function FbeFeeBatchImportModal({ open, onCancel, onSuccess }: FbeFeeBatchImportModalProps) {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewSummary, setPreviewSummary] = useState<PreviewSummary | null>(null);
  const [executePayload, setExecutePayload] = useState<Record<string, unknown> | null>(null);
  const [step, setStep] = useState<'upload' | 'preview'>('upload');

  const resetState = () => {
    setFileList([]);
    setParseErrors([]);
    setImportRows([]);
    setPreviewRows([]);
    setPreviewSummary(null);
    setExecutePayload(null);
    setStep('upload');
  };

  const handleClose = () => {
    resetState();
    onCancel();
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

  const handleParseAndPreview = async () => {
    const file = fileList[0]?.originFileObj;
    if (!file) {
      message.warning('请先上传 .xlsx / .csv 文件');
      return;
    }
    setPreviewLoading(true);
    setParseErrors([]);
    try {
      const rawRows = await readExcelAsJsonRows(file);
      const { rows, errors } = parseImportRows(rawRows);
      if (errors.length > 0) {
        setParseErrors(errors);
        message.error('导入行校验失败，请修正后重试');
        return;
      }
      if (rows.length === 0) {
        message.warning('文件中没有有效数据行');
        return;
      }
      setImportRows(rows);
      const items = rows.map((row) => ({
        scope: row.scope,
        shopId: row.shopId ?? undefined,
        sku: row.sku || undefined,
        pnk: row.pnk || undefined,
        feeCny: row.feeCny,
        note: row.note || undefined,
      }));
      const { data: res } = await request.post<ApiResponse<unknown>>('/fbe-fees/batch/preview', { items });
      if (Number(res.code) !== 200) {
        message.warning(res.message || '预览失败');
        return;
      }
      const data = res.data && typeof res.data === 'object' ? res.data as Record<string, unknown> : {};
      const previewList = getListPayload(data.items ?? data.rows ?? data.results ?? data).map((item, index) => normalizePreviewRow(item, index));
      setPreviewRows(previewList);
      setPreviewSummary(normalizePreviewSummary(data.summary ?? data.stats ?? data));
      setExecutePayload({ items });
      setStep('preview');
    } catch (err) {
      handleFeeApiError(err, '预览失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!executePayload) return;
    setExecuteLoading(true);
    try {
      const { data: res } = await request.post<ApiResponse<unknown>>('/fbe-fees/batch/execute', executePayload);
      if (Number(res.code) === 200) {
        const data = res.data && typeof res.data === 'object' ? res.data as Record<string, unknown> : {};
        const updated = data.updatedCount ?? data.updated_count ?? data.updated;
        const recalc = data.profitRecalcCount ?? data.profit_recalc_count;
        message.success(`导入完成${updated != null ? `，更新 ${updated} 条` : ''}${recalc != null ? `，利润重算 ${recalc} 条` : ''}`);
        resetState();
        onSuccess();
      } else {
        message.warning(res.message || '保存失败');
      }
    } catch (err) {
      handleFeeApiError(err, '保存失败');
    } finally {
      setExecuteLoading(false);
    }
  };

  const previewColumns: ColumnsType<PreviewRow> = useMemo(() => [
    { title: 'scope', dataIndex: 'scope', width: 120 },
    { title: 'shopId', dataIndex: 'shopId', width: 80, render: (v) => v ?? '-' },
    { title: 'SKU', dataIndex: 'sku', width: 110 },
    { title: 'PNK', dataIndex: 'pnk', width: 110 },
    { title: '旧费用', width: 90, render: (_: unknown, r) => fmtMoneyCny(r.oldFeeCny) },
    { title: '新费用', width: 90, render: (_: unknown, r) => fmtMoneyCny(r.newFeeCny) },
    { title: '匹配', dataIndex: 'matchStatus', width: 90 },
    { title: '影响数', width: 80, render: (_: unknown, r) => r.affectedStoreProductCount ?? '-' },
    { title: '说明', dataIndex: 'message', width: 180, ellipsis: true },
  ], []);

  return (
    <Modal
      title="批量导入 FBE 费用"
      open={open}
      onCancel={handleClose}
      width={920}
      destroyOnClose
      footer={step === 'upload' ? [
        <Button key="template" onClick={handleDownloadTemplate}>下载模板</Button>,
        <Button key="cancel" onClick={handleClose}>取消</Button>,
        <Button key="preview" type="primary" loading={previewLoading} onClick={handleParseAndPreview}>解析并预览</Button>,
      ] : [
        <Button key="back" onClick={() => setStep('upload')}>返回上传</Button>,
        <Button key="cancel" onClick={handleClose}>取消</Button>,
        <Button key="execute" type="primary" loading={executeLoading} onClick={handleExecute}>确认导入</Button>,
      ]}
    >
      <Alert
        type="info"
        showIcon
        message="模板字段：scope / shopId / SKU / PNK / feeCny / note"
        description="导入流程：上传 → 前端解析 → batch/preview → 确认 → batch/execute。禁止前端直接改成本或利润。"
        style={{ marginBottom: 12 }}
      />

      {step === 'upload' ? (
        <>
          <Dragger
            accept=".xlsx,.xls,.csv"
            maxCount={1}
            fileList={fileList}
            beforeUpload={(file) => {
              setFileList([{ uid: file.uid, name: file.name, status: 'done', originFileObj: file }]);
              return false;
            }}
            onRemove={() => setFileList([])}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">点击或拖拽上传 .xlsx / .csv</p>
          </Dragger>
          {parseErrors.length > 0 && (
            <Alert
              type="error"
              showIcon
              message="导入行校验失败"
              description={(
                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  {parseErrors.map((err) => <li key={err}>{err}</li>)}
                </ul>
              )}
              style={{ marginTop: 12 }}
            />
          )}
          {importRows.length > 0 && (
            <TextHint count={importRows.length} />
          )}
        </>
      ) : (
        <>
          {previewSummary && (
            <Space wrap style={{ marginBottom: 12 }}>
              <Tag color="success">成功 {previewSummary.success}</Tag>
              <Tag>未变化 {previewSummary.unchanged}</Tag>
              <Tag color="error">错误 {previewSummary.errors}</Tag>
              <Tag color="warning">歧义 {previewSummary.ambiguous}</Tag>
              <Tag>缺映射 {previewSummary.unmapped}</Tag>
            </Space>
          )}
          <Table<PreviewRow>
            size="small"
            rowKey="key"
            dataSource={previewRows}
            columns={previewColumns}
            pagination={false}
            scroll={{ x: 'max-content', y: 320 }}
          />
        </>
      )}
    </Modal>
  );
}

function TextHint({ count }: { count: number }) {
  return (
    <Alert type="success" showIcon message={`已解析 ${count} 行，可点击「解析并预览」提交后端校验`} style={{ marginTop: 12 }} />
  );
}
