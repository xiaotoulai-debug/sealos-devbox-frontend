import { useEffect, useState } from 'react';
import { Alert, Card, Drawer, Empty, message, Space, Spin, Table, Tag, Tooltip, Typography } from 'antd';
import { CheckCircleOutlined, SearchOutlined, TruckOutlined, UploadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { fetchUserDailyReport, getBackendMessage, isForbiddenError } from './api';
import type { DailyReport, DailyReportItem, DailyReportTaskType, HeatmapDetailTarget } from './types';
import { FIXED_REPORT_ITEMS } from './types';

const { Text } = Typography;

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 19);
}

function toCount(value: unknown): number {
  const n = Math.floor(Number(value ?? 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizeItems(report: DailyReport | null): DailyReportItem[] {
  const backendItems = Array.isArray(report?.items) ? report.items : [];
  return FIXED_REPORT_ITEMS.map((fixed) => {
    const matched = backendItems.find((item) => item?.taskType === fixed.taskType);
    const rawLinks = (matched as DailyReportItem & { links?: unknown })?.links;
    const linksText = typeof matched?.linksText === 'string'
      ? matched.linksText
      : Array.isArray(rawLinks)
        ? rawLinks.map((line) => String(line ?? '').trim()).filter(Boolean).join(', ')
        : '';

    return {
      taskType: fixed.taskType,
      taskName: fixed.taskName,
      quantity: toCount(matched?.quantity),
      linksText,
      detail: matched?.detail ?? '',
      blockerReason: matched?.blockerReason ?? '',
    };
  });
}

function splitLinks(value: unknown): string[] {
  return String(value ?? '')
    .split(/[,，\n]/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function clippedText(value: unknown): string {
  const text = String(value ?? '').trim();
  return text || '-';
}

function CellText({ value }: { value?: string }) {
  const text = clippedText(value);
  if (text === '-') return <Text type="secondary">-</Text>;
  return (
    <Tooltip title={text}>
      <Text ellipsis style={{ maxWidth: 130, display: 'inline-block' }}>{text}</Text>
    </Tooltip>
  );
}

const metricCardMeta: Array<{ taskType: DailyReportTaskType; label: string; color: string; bg: string; icon: React.ReactNode }> = [
  { taskType: 'PRODUCT_SELECTION', label: '选品数量', color: '#16a34a', bg: '#dcfce7', icon: <SearchOutlined /> },
  { taskType: 'PRODUCT_LISTING', label: '上新数量', color: '#2563eb', bg: '#dbeafe', icon: <UploadOutlined /> },
  { taskType: 'APPROVED_COUNT', label: '合规数量', color: '#0891b2', bg: '#cffafe', icon: <CheckCircleOutlined /> },
  { taskType: 'SHIPMENT_COUNT', label: '发货数量', color: '#d97706', bg: '#fef3c7', icon: <TruckOutlined /> },
];

export default function OperationDetailDrawer({
  open,
  date,
  targetUser,
  onClose,
}: {
  open: boolean;
  date: string;
  targetUser: HeatmapDetailTarget | null;
  onClose: () => void;
}) {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<{ message: string; forbidden: boolean } | null>(null);

  useEffect(() => {
    if (!open || !targetUser?.userId) return;
    setLoading(true);
    setLoadError(null);
    fetchUserDailyReport(targetUser.userId, date)
      .then((payload) => setReport(payload ?? null))
      .catch((err) => {
        const msg = getBackendMessage(err, '加载员工运营日报失败');
        setReport(null);
        setLoadError({ message: msg, forbidden: isForbiddenError(err) });
        message.error(msg);
      })
      .finally(() => setLoading(false));
  }, [date, open, targetUser?.userId]);

  const handleClose = () => {
    setReport(null);
    setLoadError(null);
    onClose();
  };

  const items = normalizeItems(report);
  const submitted = report?.submitted === true;
  const otherText = items.find((item) => item.taskType === 'OTHER')?.detail?.trim() || '';
  const columns: ColumnsType<DailyReportItem> = [
    {
      title: '任务类型',
      dataIndex: 'taskName',
      key: 'taskName',
      width: 96,
      render: (value, record) => (
        <Tag color={record.taskType === 'OTHER' ? 'blue' : 'default'} style={{ marginInlineEnd: 0 }}>
          {value}
        </Tag>
      ),
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 64,
      align: 'right',
      render: (value, record) => (
        record.taskType === 'OTHER' ? <Text type="secondary">-</Text> : <Text strong>{toCount(value)}</Text>
      ),
    },
    {
      title: '父体SKU / 单条SKC',
      dataIndex: 'linksText',
      key: 'linksText',
      width: 112,
      render: (value, record) => {
        if (record.taskType === 'OTHER') return <Text type="secondary">-</Text>;
        const text = splitLinks(value).join(', ');
        return <CellText value={text} />;
      },
    },
    {
      title: '平台',
      dataIndex: 'detail',
      key: 'detail',
      width: 120,
      render: (value) => <CellText value={value} />,
    },
    {
      title: '备注',
      dataIndex: 'blockerReason',
      key: 'blockerReason',
      width: 120,
      render: (value, record) => (
        record.taskType === 'OTHER' ? <Text type="secondary">-</Text> : <CellText value={value} />
      ),
    },
  ];

  return (
    <Drawer
      open={open}
      title={`${targetUser?.name ?? '员工'} | ${date} 提交明细`}
      width={620}
      onClose={handleClose}
      destroyOnHidden
    >
      <Spin spinning={loading}>
        {loadError ? (
          <Alert
            type={loadError.forbidden ? 'warning' : 'error'}
            showIcon
            message={loadError.message}
            style={{ borderRadius: 12 }}
          />
        ) : !report ? (
          <Empty description="暂无登记明细" />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {!submitted ? (
              <Alert type="warning" showIcon message="该员工当天尚未提交日报。" style={{ borderRadius: 12 }} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Tag color="green" style={{ marginInlineEnd: 0 }}>已提交</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>修改次数：{Number(report.editCount ?? 0)} / {Number(report.maxEditCount ?? 1)}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>创建时间：{formatDateTime((report as DailyReport & { createdAt?: string | null; created_at?: string | null }).createdAt ?? (report as DailyReport & { created_at?: string | null }).created_at)}</Text>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              {metricCardMeta.map((meta) => {
                const item = items.find((row) => row.taskType === meta.taskType);
                return (
                  <Card key={meta.taskType} size="small" style={{ borderRadius: 14, background: '#fbfdff', border: '1px solid #e8eef7' }} styles={{ body: { padding: 12 } }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: meta.bg,
                        color: meta.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                        flexShrink: 0,
                      }}>
                        {meta.icon}
                      </div>
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>{meta.label}</Text>
                        <div style={{ color: meta.color, fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}>
                          {toCount(item?.quantity)}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            <Table<DailyReportItem>
              rowKey="taskType"
              size="small"
              bordered
              pagination={false}
              columns={columns}
              dataSource={Array.isArray(items) ? items : []}
              rowClassName={(record) => (targetUser?.metricType === record.taskType ? 'operation-detail-row-highlight' : '')}
              locale={{ emptyText: <Empty description="暂无登记明细" /> }}
            />

            <Card
              size="small"
              title="其他说明 / 提醒"
              style={{ borderRadius: 14, background: '#fffbeb', border: '1px solid #fde68a' }}
              styles={{ body: { padding: 12 } }}
            >
              <Text style={{ whiteSpace: 'pre-wrap', color: otherText ? '#78350f' : '#92400e' }}>
                {otherText || '暂无其他说明'}
              </Text>
            </Card>
            <style>{`
              .operation-detail-row-highlight > td {
                background: #eff6ff !important;
              }
              .operation-detail-row-highlight:hover > td {
                background: #dbeafe !important;
              }
            `}</style>
          </Space>
        )}
      </Spin>
    </Drawer>
  );
}
