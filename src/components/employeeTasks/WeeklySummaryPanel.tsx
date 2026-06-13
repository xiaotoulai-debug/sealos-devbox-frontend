import { Alert, Button, Card, Empty, Space, Spin, Tag, Typography } from 'antd';
import { CheckCircleOutlined, ExclamationCircleOutlined, FileTextOutlined, FlagOutlined, RobotOutlined } from '@ant-design/icons';
import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';
import type {
  AiWeeklyReviewCompactSections,
  AiWeeklyReviewSectionBlock,
  WeeklySummaryAiStatus,
  WeeklySummaryData,
} from './types';
import AiWeeklyReviewModal, {
  formatAiGeneratedAt,
} from './AiWeeklyReviewModal';
import EmployeeWeeklyPlanCard from './EmployeeWeeklyPlanCard';
import {
  hasCompactWeeklyReviewContent,
  resolveCompactWeeklyReviewSections,
} from './weeklyReviewMappers';
import {
  getWeeklyDailyReportCounts,
  getWeeklyDailyReportUnavailableText,
  isWeeklyDailyReportCalculable,
} from './types';

const { Paragraph, Text } = Typography;

const AI_CARD_STYLE: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e8eef7',
  borderRadius: 12,
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  overflow: 'hidden',
};

const AI_HEADER_STYLE: CSSProperties = {
  background: '#eff6ff',
  borderBottom: '1px solid #dbeafe',
  minHeight: 44,
  padding: '10px 12px',
};

const AI_TYPO = {
  title: '#0f172a',
  body: '#334155',
  label: '#0f172a',
  icon: '#2563eb',
} as const;

const AI_STATUS_META: Record<WeeklySummaryAiStatus, { label: string; color: string }> = {
  NOT_ENABLED: { label: 'AI 未启用', color: 'default' },
  RULE_ONLY: { label: '规则汇总版', color: 'blue' },
  PENDING: { label: 'AI 生成中', color: 'processing' },
  READY: { label: 'AI 已生成', color: 'success' },
  FAILED: { label: 'AI 生成失败', color: 'error' },
};

const PREVIEW_ROWS = [
  { key: 'completed', label: '上周完成情况' },
  { key: 'unfinished', label: '上周未完成情况' },
  { key: 'nextFocus', label: '本周重点建议' },
] as const;

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeAiStatus(value?: string | null): WeeklySummaryAiStatus {
  const allowed: WeeklySummaryAiStatus[] = ['NOT_ENABLED', 'RULE_ONLY', 'PENDING', 'READY', 'FAILED'];
  return allowed.includes(String(value) as WeeklySummaryAiStatus)
    ? String(value) as WeeklySummaryAiStatus
    : 'RULE_ONLY';
}

function getBlockPreviewText(block?: AiWeeklyReviewSectionBlock): string {
  if (!block) return '';
  const summary = String(block.summary ?? '').trim();
  if (summary) return summary;
  const items = Array.isArray(block.items) ? block.items.filter(Boolean) : [];
  return items.join('；');
}

function SummaryMetric({
  title,
  value,
  desc,
  color,
  icon,
}: {
  title: string;
  value: string | number;
  desc: string;
  color: string;
  icon: ReactNode;
}) {
  return (
    <div style={{ border: '1px solid #eef2f7', borderRadius: 12, padding: 12, background: '#fff' }}>
      <Space size={8}>
        <span style={{ width: 28, height: 28, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color, background: `${color}18` }}>
          {icon}
        </span>
        <Text type="secondary" style={{ fontSize: 12 }}>{title}</Text>
      </Space>
      <div style={{ marginTop: 8, color, fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
      <Text type="secondary" style={{ fontSize: 12 }}>{desc}</Text>
    </div>
  );
}

function AiCompactSummaryPreview({
  sections,
  aiGeneratedAt,
  onViewDetail,
}: {
  sections: AiWeeklyReviewCompactSections;
  aiGeneratedAt?: string | null;
  onViewDetail: () => void;
}) {
  const formattedTime = formatAiGeneratedAt(aiGeneratedAt);

  return (
    <Card
      size="small"
      title={(
        <Space size={8}>
          <RobotOutlined style={{ color: AI_TYPO.icon, fontSize: 16 }} />
          <span style={{ color: AI_TYPO.title, fontWeight: 600 }}>AI 上周工作复盘</span>
          <Tag color="blue" style={{ marginInlineStart: 0 }}>AI 生成</Tag>
        </Space>
      )}
      extra={(
        <Button type="link" size="small" onClick={onViewDetail} style={{ padding: 0, height: 'auto', fontSize: 13 }}>
          查看完整复盘
        </Button>
      )}
      style={AI_CARD_STYLE}
      styles={{
        header: AI_HEADER_STYLE,
        body: { padding: 14, background: '#ffffff' },
      }}
    >
      {formattedTime ? (
        <Text type="secondary" style={{ display: 'block', marginBottom: 10, fontSize: 12 }}>
          生成时间：{formattedTime}
        </Text>
      ) : null}
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        {PREVIEW_ROWS.map(({ key, label }) => {
          const text = getBlockPreviewText(sections[key]);
          if (!text) return null;
          return (
            <div key={key}>
              <Text strong style={{ fontSize: 14, color: AI_TYPO.label }}>{label}：</Text>
              <Paragraph
                style={{
                  margin: '4px 0 0',
                  color: AI_TYPO.body,
                  fontSize: 14,
                  lineHeight: 1.65,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {text}
              </Paragraph>
            </div>
          );
        })}
      </Space>
    </Card>
  );
}

function AiSummarySection({
  status,
  compactSections,
  aiGeneratedAt,
  aiErrorMessage,
  generating,
  readOnlyAiGenerate = false,
  onViewDetail,
}: {
  status: WeeklySummaryAiStatus;
  compactSections?: AiWeeklyReviewCompactSections | null;
  aiGeneratedAt?: string | null;
  aiErrorMessage?: string | null;
  generating: boolean;
  readOnlyAiGenerate?: boolean;
  onViewDetail?: () => void;
}) {
  const hasContent = hasCompactWeeklyReviewContent(compactSections);

  if (status === 'PENDING' || generating) {
    return (
      <Alert
        type="info"
        showIcon
        message="AI 总结生成中，请稍后刷新查看"
        style={{ borderRadius: 12 }}
      />
    );
  }

  if (status === 'FAILED') {
    return (
      <Alert
        type="warning"
        showIcon
        message="AI 总结生成失败"
        description={
          aiErrorMessage
          || (readOnlyAiGenerate ? '请联系管理员重新生成。' : '请稍后重试或重新生成。')
        }
        style={{ borderRadius: 12 }}
      />
    );
  }

  if (status === 'NOT_ENABLED') {
    return (
      <Alert
        type="info"
        showIcon
        message={readOnlyAiGenerate ? '暂无 AI 汇总，请等待管理员生成' : 'AI 未启用，当前展示规则汇总'}
        style={{ borderRadius: 12 }}
      />
    );
  }

  if (status === 'RULE_ONLY') {
    return (
      <Alert
        type="info"
        showIcon
        message={readOnlyAiGenerate ? '暂无 AI 汇总，请等待管理员生成' : '当前为规则汇总版，可点击上方按钮生成 AI 总结'}
        style={{ borderRadius: 12 }}
      />
    );
  }

  if (status === 'READY' && hasContent && compactSections) {
    return (
      <AiCompactSummaryPreview
        sections={compactSections}
        aiGeneratedAt={aiGeneratedAt}
        onViewDetail={() => onViewDetail?.()}
      />
    );
  }

  if (status === 'READY' && !hasContent) {
    const formattedTime = formatAiGeneratedAt(aiGeneratedAt);
    return (
      <Card
        size="small"
        title={(
          <Space size={8}>
            <RobotOutlined style={{ color: AI_TYPO.icon, fontSize: 16 }} />
            <span style={{ color: AI_TYPO.title, fontWeight: 600 }}>AI 上周工作复盘</span>
            <Tag color="blue" style={{ marginInlineStart: 0 }}>AI 生成</Tag>
          </Space>
        )}
        style={AI_CARD_STYLE}
        styles={{
          header: AI_HEADER_STYLE,
          body: { padding: 14, background: '#ffffff' },
        }}
      >
        {formattedTime ? (
          <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
            生成时间：{formattedTime}
          </Text>
        ) : null}
        <Text type="warning" style={{ fontSize: 14 }}>
          AI 内容为空，请{readOnlyAiGenerate ? '联系管理员' : ''}重新生成
        </Text>
      </Card>
    );
  }

  return (
    <Alert
      type="info"
      showIcon
      message="暂无 AI 总结内容"
      style={{ borderRadius: 12 }}
    />
  );
}

function getDailyReportMetric(daily?: WeeklySummaryData['dailyReportSummary']) {
  if (!isWeeklyDailyReportCalculable(daily)) {
    return {
      value: '-',
      desc: getWeeklyDailyReportUnavailableText(daily),
      color: '#64748b',
    };
  }
  const { submittedDays, requiredDays, missingDays } = getWeeklyDailyReportCounts(daily);
  return {
    value: `${submittedDays} / ${requiredDays}`,
    desc: missingDays > 0 ? `缺失 ${missingDays} 天` : '已全部提交',
    color: '#2563eb',
  };
}

function WeeklyPlanModuleSlot({
  loading,
  error,
  summaryWeekStart,
}: {
  loading: boolean;
  error?: string;
  summaryWeekStart?: string | null;
}) {
  const weekStart = typeof summaryWeekStart === 'string' ? summaryWeekStart.trim() : '';

  if (loading) return null;

  if (error || !weekStart) {
    return (
      <Card
        size="small"
        style={{
          marginTop: 16,
          borderRadius: 14,
          border: '1px solid #eef2f7',
          background: '#ffffff',
        }}
        styles={{ body: { padding: '14px 16px' } }}
      >
        <Text style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
          {error ? '请先成功加载上周汇总后再填写计划' : '上周汇总周期加载中，请稍后再填写计划'}
        </Text>
      </Card>
    );
  }

  return <EmployeeWeeklyPlanCard weekStart={weekStart} />;
}

export default function WeeklySummaryPanel({
  data,
  loading,
  error,
  readOnlyAiGenerate = false,
  aiGenerating = false,
  onGenerateAiSummary,
}: {
  data?: WeeklySummaryData | null;
  loading: boolean;
  error?: string;
  readOnlyAiGenerate?: boolean;
  aiGenerating?: boolean;
  onGenerateAiSummary?: (force: boolean) => void;
}) {
  const daily = data?.dailyReportSummary;
  const received = data?.receivedTaskSummary;
  const created = data?.createdTaskSummary;
  const overdueCount = toNumber(received?.overdueCount) + toNumber(created?.overdueCount);
  const dailyReportMetric = getDailyReportMetric(daily);
  const aiStatus = normalizeAiStatus(data?.aiStatus);
  const aiMeta = AI_STATUS_META[aiStatus];
  const compactSections = resolveCompactWeeklyReviewSections(data ?? null);
  const buttonDisabled = aiGenerating || aiStatus === 'PENDING' || aiStatus === 'NOT_ENABLED';
  const buttonLoading = aiGenerating || aiStatus === 'PENDING';
  const buttonText = aiStatus === 'NOT_ENABLED'
    ? 'AI 未启用'
    : aiStatus === 'READY' || aiStatus === 'FAILED'
      ? '重新生成'
      : '生成 AI 总结';
  const force = aiStatus === 'READY' || aiStatus === 'FAILED';
  const [aiDetailOpen, setAiDetailOpen] = useState(false);

  return (
    <Card
      title={
        <Space direction="vertical" size={0}>
          <span>上周汇总</span>
          <Text type="secondary" style={{ fontSize: 12 }}>周期：{data?.weekStart || '-'} 至 {data?.weekEnd || '-'}</Text>
        </Space>
      }
      extra={(
        <Space wrap>
          <Tag color={aiMeta.color}>{aiMeta.label}</Tag>
          {!readOnlyAiGenerate && (
            <Button
              size="small"
              loading={buttonLoading}
              disabled={buttonDisabled}
              onClick={() => onGenerateAiSummary?.(force)}
            >
              {buttonText}
            </Button>
          )}
        </Space>
      )}
      loading={loading}
      style={{ borderRadius: 16, border: '1px solid #e8eef7', height: '100%' }}
      styles={{ body: { padding: 16 } }}
    >
      <Spin spinning={loading}>
        {error && (
          <Alert type="warning" showIcon message={error} style={{ borderRadius: 12, marginBottom: 12 }} />
        )}
        {!data && !error ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无上周汇总" />
        ) : (
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
              <SummaryMetric title="日报提交" value={dailyReportMetric.value} desc={dailyReportMetric.desc} color={dailyReportMetric.color} icon={<FileTextOutlined />} />
              <SummaryMetric title="收到任务" value={`${toNumber(received?.doneCount)} / ${toNumber(received?.totalCount)}`} desc={`待处理 ${toNumber(received?.pendingCount)}`} color="#16a34a" icon={<CheckCircleOutlined />} />
              <SummaryMetric title="发起任务" value={`${toNumber(created?.doneCount)} / ${toNumber(created?.totalCount)}`} desc={`待推进 ${toNumber(created?.pendingCount)}`} color="#7c3aed" icon={<FlagOutlined />} />
              <SummaryMetric title="逾期提醒" value={overdueCount} desc="收到 + 发起" color={overdueCount > 0 ? '#dc2626' : '#64748b'} icon={<ExclamationCircleOutlined />} />
            </div>

            <AiSummarySection
              status={aiStatus}
              compactSections={compactSections}
              aiGeneratedAt={data?.aiGeneratedAt}
              aiErrorMessage={data?.aiErrorMessage}
              generating={aiGenerating}
              readOnlyAiGenerate={readOnlyAiGenerate}
              onViewDetail={() => setAiDetailOpen(true)}
            />

            <AiWeeklyReviewModal
              open={aiDetailOpen}
              title="AI 上周工作复盘"
              generatedAt={data?.aiGeneratedAt}
              status={aiStatus}
              errorMessage={data?.aiErrorMessage}
              compactSections={compactSections}
              onClose={() => setAiDetailOpen(false)}
            />

            <WeeklyPlanModuleSlot
              loading={loading}
              error={error}
              summaryWeekStart={data?.weekStart}
            />
          </Space>
        )}
      </Spin>
    </Card>
  );
}
