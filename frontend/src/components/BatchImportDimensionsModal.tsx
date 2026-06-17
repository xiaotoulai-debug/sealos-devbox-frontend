/**
 * BatchImportDimensionsModal
 * ─────────────────────────────────────────────────────────────────
 * 批量导入尺寸/重量弹窗
 *
 * 流程：
 *  1. 用户下载标准模板（SKU / 长 / 宽 / 高 / 实重 / 采购价）
 *  2. 上传填写好的 Excel，前端严格解析并逐行校验
 *  3. 预览表格：错误行红底 + Tooltip；提交按钮在有错误时置灰
 *  4. 确认提交 → POST /products/inventory-bulk-import
 *  5. 弹结果弹窗（成功/失败条数 + 具体 errors）→ 关闭 + 刷新列表
 */
import React, { useRef, useState, useCallback } from 'react';
import {
  Modal, Button, Table, Tag, Tooltip, Space, Typography, Alert,
  Statistic, Row, Col, Divider, message,
} from 'antd';
import {
  DownloadOutlined, UploadOutlined, CheckCircleOutlined, CloseCircleOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table/interface';
import request from '../lib/request';
import {
  readExcelAsJsonRows,
  getString,
  parseStrictNumber,
  downloadXlsxTemplate,
  ExcelRowLimitExceededError,
  mergeDefinedPayloadFields,
} from '../utils/excelImport';

const { Text } = Typography;

// ─── 类型定义 ──────────────────────────────────────────────────────────────────

interface DimImportRow {
  key: string;
  sku: string;
  length: number | null;
  width: number | null;
  height: number | null;
  actualWeight: number | null;
  purchasePrice: number | null;
  _errors?: string[];
}

interface BulkImportResponse {
  total: number;
  success: number;
  failed: number;
  errors: string[];
}

interface Props {
  open: boolean;
  onCancel: () => void;
  onDone: () => void;
}

// ─── 模板配置 ──────────────────────────────────────────────────────────────────

const TEMPLATE_HEADERS = ['SKU*', '长(cm)', '宽(cm)', '高(cm)', '实重(kg)', '采购价(¥)'];
const TEMPLATE_SAMPLE_ROWS = [
  ['KFB-001', '20', '15', '10', '0.35', '25.50'],
  ['KFB-002', '30', '20', '12', '0.80', '18.00'],
];
const TEMPLATE_COL_WIDTHS = [18, 10, 10, 10, 10, 12];

// ─── 行解析 ───────────────────────────────────────────────────────────────────

function parseRawRow(raw: Record<string, unknown>): DimImportRow {
  const errors: string[] = [];

  const sku = getString(raw, ['SKU*', 'SKU', 'sku', 'Sku']);

  const toNum = (keys: string[], label: string) => {
    const { value, error } = parseStrictNumber(
      getString(raw, keys) || raw[keys[0]],
      label,
    );
    if (error) errors.push(error);
    return value;
  };

  const length        = toNum(['长(cm)', '长', 'length'],           '长(cm)');
  const width         = toNum(['宽(cm)', '宽', 'width'],             '宽(cm)');
  const height        = toNum(['高(cm)', '高', 'height'],            '高(cm)');
  const actualWeight  = toNum(['实重(kg)', '实重', '重量', 'actualWeight', 'weight'], '实重(kg)');
  const purchasePrice = toNum(['采购价(¥)', '采购价', '价格', 'purchasePrice', 'price'], '采购价(¥)');

  if (!sku.trim()) errors.push('SKU 不能为空');

  return {
    key: crypto.randomUUID(),
    sku,
    length,
    width,
    height,
    actualWeight,
    purchasePrice,
    _errors: errors.length > 0 ? errors : undefined,
  };
}

function validateForDuplicates(rows: DimImportRow[]): DimImportRow[] {
  const skuCount = new Map<string, number>();
  rows.forEach((r) => {
    const k = r.sku.trim().toUpperCase();
    if (k) skuCount.set(k, (skuCount.get(k) ?? 0) + 1);
  });
  return rows.map((r) => {
    const k = r.sku.trim().toUpperCase();
    if (k && (skuCount.get(k) ?? 0) > 1) {
      return {
        ...r,
        _errors: [...(r._errors ?? []), 'SKU 在文件中重复'],
      };
    }
    return r;
  });
}

// ─── 组件 ─────────────────────────────────────────────────────────────────────

const BatchImportDimensionsModal: React.FC<Props> = ({ open, onCancel, onDone }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<DimImportRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const hasErrors = rows.some((r) => (r._errors?.length ?? 0) > 0);
  const errorCount = rows.filter((r) => (r._errors?.length ?? 0) > 0).length;
  const validCount = rows.length - errorCount;

  // ── 下载模板 ────────────────────────────────────────────────────────────────

  const handleDownloadTemplate = useCallback(() => {
    downloadXlsxTemplate({
      headers: TEMPLATE_HEADERS,
      sampleRows: TEMPLATE_SAMPLE_ROWS,
      colWidths: TEMPLATE_COL_WIDTHS,
      filename: '尺寸重量批量导入模板.xlsx',
      sheetName: '导入模板',
    });
  }, []);

  // ── 文件解析 ────────────────────────────────────────────────────────────────

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!e.target) return;
      // 重置，允许重复上传同一文件
      e.target.value = '';
      if (!file) return;

      setParsing(true);
      setFileName(file.name);
      try {
        const rawRows = await readExcelAsJsonRows(file);
        if (rawRows.length === 0) {
          message.warning('文件内容为空，请检查模板格式');
          setParsing(false);
          return;
        }
        const parsed = rawRows.map(parseRawRow);
        const validated = validateForDuplicates(parsed);
        setRows(validated);
      } catch (err) {
        if (err instanceof ExcelRowLimitExceededError) {
          setRows([]);
          setFileName('');
          Modal.error({ title: '行数超限', content: err.message });
        } else {
          message.error('文件解析失败，请检查文件格式');
        }
      } finally {
        setParsing(false);
      }
    },
    [],
  );

  // ── 提交 ────────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (rows.length === 0 || hasErrors) return;

    const items = rows.map((r) => {
      const item: Record<string, unknown> = { sku: r.sku.trim() };
      mergeDefinedPayloadFields(item, {
        length: r.length,
        width: r.width,
        height: r.height,
        actualWeight: r.actualWeight,
        purchasePrice: r.purchasePrice,
      });
      return item;
    });

    setSubmitting(true);
    try {
      const res = await request.post<{ code: number; data: BulkImportResponse; message: string }>(
        '/products/inventory-bulk-import',
        { items },
      );

      const result = res.data;
      if (result.code !== 200) {
        message.error(result.message || '导入失败，请联系管理员');
        return;
      }

      const { total, success, failed, errors } = result.data;
      const isAllSuccess = failed === 0;

      Modal[isAllSuccess ? 'success' : 'warning']({
        title: isAllSuccess ? '🎉 全部导入成功' : '⚠️ 导入完成（含失败项）',
        width: 560,
        content: (
          <div>
            <Row gutter={24} style={{ marginBottom: 16 }}>
              <Col span={8}>
                <Statistic title="总条数" value={total} />
              </Col>
              <Col span={8}>
                <Statistic
                  title="成功"
                  value={success}
                  valueStyle={{ color: '#3f8600' }}
                  prefix={<CheckCircleOutlined />}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="失败"
                  value={failed}
                  valueStyle={{ color: failed > 0 ? '#cf1322' : undefined }}
                  prefix={failed > 0 ? <CloseCircleOutlined /> : undefined}
                />
              </Col>
            </Row>
            {errors?.length > 0 && (
              <>
                <Divider style={{ margin: '12px 0' }} />
                <Text type="danger" strong>失败原因：</Text>
                <ul style={{ maxHeight: 200, overflowY: 'auto', paddingLeft: 20, marginTop: 8 }}>
                  {errors.map((e, i) => (
                    <li key={i} style={{ color: '#cf1322', marginBottom: 4 }}>
                      {e}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ),
        onOk() {
          onDone();
          onCancel();
        },
      });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg || '网络异常，请重试');
    } finally {
      setSubmitting(false);
    }
  }, [rows, hasErrors, onDone, onCancel]);

  // ── 关闭时重置 ───────────────────────────────────────────────────────────────

  const handleCancel = useCallback(() => {
    setRows([]);
    setFileName('');
    onCancel();
  }, [onCancel]);

  // ── 表格列定义 ───────────────────────────────────────────────────────────────

  const columns: ColumnsType<DimImportRow> = [
    {
      title: '#',
      width: 48,
      render: (_, __, idx) => (
        <Text type={(__ as DimImportRow)._errors?.length ? 'danger' : 'secondary'}>
          {idx + 1}
        </Text>
      ),
    },
    {
      title: 'SKU',
      dataIndex: 'sku',
      width: 140,
      render: (val, record) =>
        record._errors?.length ? (
          <Tooltip
            title={
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {record._errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            }
            color="red"
          >
            <Text type="danger" strong>{val || '(空)'}</Text>
          </Tooltip>
        ) : (
          <Text>{val}</Text>
        ),
    },
    {
      title: '长(cm)',
      dataIndex: 'length',
      width: 90,
      render: (v) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: '宽(cm)',
      dataIndex: 'width',
      width: 90,
      render: (v) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: '高(cm)',
      dataIndex: 'height',
      width: 90,
      render: (v) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: '实重(kg)',
      dataIndex: 'actualWeight',
      width: 90,
      render: (v) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: '采购价(¥)',
      dataIndex: 'purchasePrice',
      width: 100,
      render: (v) => (v !== null ? `¥${v}` : <Text type="secondary">—</Text>),
    },
    {
      title: '状态',
      width: 90,
      render: (_, record) =>
        record._errors?.length ? (
          <Tag color="red">错误</Tag>
        ) : (
          <Tag color="green">正常</Tag>
        ),
    },
  ];

  // ── 渲染 ─────────────────────────────────────────────────────────────────────

  return (
    <Modal
      open={open}
      onCancel={handleCancel}
      width={900}
      title={
        <Space>
          <UploadOutlined />
          <span>批量更新 SKU</span>
          {rows.length > 0 && (
            <Tag color="blue">{rows.length} 行</Tag>
          )}
        </Space>
      }
      footer={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          {/* 左侧统计 */}
          <Space>
            {rows.length > 0 && (
              <>
                <Text style={{ color: '#3f8600' }}>✓ 有效 {validCount} 条</Text>
                {errorCount > 0 && (
                  <Text type="danger">✗ 错误 {errorCount} 行（请修正后重新上传）</Text>
                )}
              </>
            )}
          </Space>
          {/* 右侧按钮 */}
          <Space>
            <Button onClick={handleCancel}>取消</Button>
            <Button
              type="primary"
              loading={submitting}
              disabled={rows.length === 0 || hasErrors}
              onClick={handleSubmit}
            >
              确认导入
            </Button>
          </Space>
        </Space>
      }
    >
      {/* 操作引导 */}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="操作说明"
        description="① 下载标准模板 → ② 填写 SKU 与对应尺寸数据 → ③ 上传文件 → ④ 检查预览无误后点击「确认导入」"
      />

      {/* 按钮行 */}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
          下载标准模板
        </Button>
        <Button
          icon={<UploadOutlined />}
          loading={parsing}
          onClick={() => fileInputRef.current?.click()}
        >
          {fileName ? `已选：${fileName}（重新上传）` : '上传 Excel 文件'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </Space>

      {/* 错误汇总提示 */}
      {hasErrors && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={`发现 ${errorCount} 行数据存在错误，已置灰"确认导入"按钮。请修正 Excel 后重新上传。`}
        />
      )}

      {/* 预览表格 */}
      {rows.length > 0 ? (
        <Table<DimImportRow>
          dataSource={rows}
          columns={columns}
          size="small"
          pagination={false}
          scroll={{ y: 360, x: 'max-content' }}
          rowKey="key"
          rowClassName={(record) =>
            (record._errors?.length ?? 0) > 0 ? 'import-error-row' : ''
          }
        />
      ) : (
        <div
          style={{
            height: 180,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#aaa',
            border: '1px dashed #d9d9d9',
            borderRadius: 8,
          }}
        >
          <InboxOutlined style={{ fontSize: 40, marginBottom: 8 }} />
          <span>请先下载模板并填写数据，再上传文件</span>
        </div>
      )}

      {/* 错误行高亮样式 */}
      <style>{`
        .import-error-row td {
          background-color: #fff2f0 !important;
        }
        .import-error-row:hover td {
          background-color: #ffebe8 !important;
        }
      `}</style>
    </Modal>
  );
};

export default BatchImportDimensionsModal;
