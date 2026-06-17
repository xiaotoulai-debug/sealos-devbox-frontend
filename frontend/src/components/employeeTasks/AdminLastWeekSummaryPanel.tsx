import { Button, Card, Empty, Popconfirm, Spin, Tag, Typography } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useMemo, type CSSProperties } from 'react';
import type { AdminWeeklySummaryDto, AdminWeeklySummaryStatus } from './types';

const { Text, Paragraph } = Typography;

const CARD_STYLE: CSSProperties = {
  border: '1px solid #eef2f7',
  borderRadius: 14,
  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)',
};

const STATUS_META: Record<AdminWeeklySummaryStatus, { label: string; color: string }> = {
  SUCCESS: { label: '已生成', color: 'success' },
  GENERATING: { label: '生成中', color: 'processing' },
  FAILED: { label: '失败', color: 'error' },
  NONE: { label: '未生成', color: 'default' },
};

function normalizeStatus(value?: string | null): AdminWeeklySummaryStatus {
  const allowed: AdminWeeklySummaryStatus[] = ['NONE', 'GENERATING', 'SUCCESS', 'FAILED'];
  return allowed.includes(String(value) as AdminWeeklySummaryStatus)
    ? String(value) as AdminWeeklySummaryStatus
    : 'NONE';
}

function formatTime(value?: string | null): string {
  if (!value) return '-';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('MM-DD HH:mm') : value;
}

function getPreviewText(item: AdminWeeklySummaryDto): string | null {
  const preview = String(item.summaryPreview ?? '').trim();
  if (preview) return preview;
  const text = String(item.summaryText ?? '').trim();
  if (text) return text;
  if (item.status === 'FAILED' && item.errorMessage) return item.errorMessage;
  return null;
}

function getLatestGeneratedLabel(rows: AdminWeeklySummaryDto[]): string {
  const latest = rows
    .map((item) => item.generatedAt || item.updatedAt)
    .filter(Boolean)
    .sort((a, b) => dayjs(b).valueOf() - dayjs(a).valueOf())[0];

  if (!latest) return '暂无';
  const parsed = dayjs(latest);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : String(latest);
}

function SummaryListItem({
  item,
  onOpenDetail,
}: {
  item: AdminWeeklySummaryDto;
  onOpenDetail: (item: AdminWeeklySummaryDto) => void;
}) {
  const status = normalizeStatus(item.status);
  const meta = STATUS_META[status];
  const preview = getPreviewText(item);

  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid #eef2f7',
        background: '#fafbfc',
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text strong ellipsis style={{ flex: 1 }}>
          {item.assigneeName || '-'}
        </Text>
        <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>{meta.label}</Tag>
      </div>
      {item.roleName ? (
        <Text type="secondary" style={{ fontSize: 12 }}>{item.roleName}</Text>
      ) : null}
      {preview ? (
        <Paragraph
          type="secondary"
          style={{ fontSize: 12, marginBottom: 4, marginTop: 6 }}
          ellipsis={{ rows: 2 }}
        >
          {preview}
        </Paragraph>
      ) : (
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
          暂无摘要
        </Text>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          更新：{formatTime(item.updatedAt || item.generatedAt)}
        </Text>
        <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} onClick={() => onOpenDetail(item)}>
          详情
        </Button>
      </div>
    </div>
  );
}

export default function AdminLastWeekSummaryPanel({
  list,
  loading,
  generating,
  loadError,
  weekLabel,
  showRegenerate = false,
  onRegenerate,
  onOpenDetail,
}: {
  list: AdminWeeklySummaryDto[];
  loading: boolean;
  generating: boolean;
  loadError?: string | null;
  weekLabel?: string | null;
  showRegenerate?: boolean;
  onRefresh?: () => void;
  onRegenerate: () => void;
  onOpenDetail: (item: AdminWeeklySummaryDto) => void;
}) {
  const rows = Array.isArray(list) ? list : [];
  const latestGeneratedLabel = useMemo(() => getLatestGeneratedLabel(rows), [rows]);

  return (
    <Card
      size="small"
      title={(
        <div>
          <div style={{ fontWeight: 600 }}>上周汇总</div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 8,
              marginTop: 2,
            }}
          >
            {weekLabel ? (
              <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>{weekLabel}</Text>
            ) : null}
            <span
              style={{
                fontSize: 12,
                color: '#2563eb',
                background: '#eff6ff',
                padding: '2px 8px',
                borderRadius: 6,
                lineHeight: '18px',
              }}
            >
              最近生成：{latestGeneratedLabel}
            </span>
          </div>
        </div>
      )}
      extra={showRegenerate ? (
        <Popconfirm
          title="确认生成所有员工上周 AI 周报？"
          description="本操作会调用 AI 并消耗 Token，建议每周一开会前统一生成。已生成且内容未变化的员工周报将尽量复用缓存，避免重复消耗。"
          okText="确认生成"
          cancelText="取消"
          onConfirm={onRegenerate}
          disabled={generating}
        >
          <Button size="small" icon={<RobotOutlined />} loading={generating}>
            AI生成周报
          </Button>
        </Popconfirm>
      ) : null}
      styles={{
        body: {
          padding: '10px 12px',
          maxHeight: 'calc(100vh - 720px)',
          minHeight: 420,
          overflowY: 'auto',
        },
      }}
      style={{ ...CARD_STYLE, height: '100%' }}
    >
      <Spin spinning={loading}>
        {loadError ? (
          <Empty description={loadError} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : rows.length === 0 ? (
          <Empty description="暂无上周 AI 汇总" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          rows.map((item) => (
            <SummaryListItem key={item.assigneeId} item={item} onOpenDetail={onOpenDetail} />
          ))
        )}
      </Spin>
    </Card>
  );
}
