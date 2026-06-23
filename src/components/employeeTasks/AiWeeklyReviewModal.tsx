import { Alert, Empty, Modal, Spin, Typography } from 'antd';
import dayjs from 'dayjs';
import type { CSSProperties, ReactNode } from 'react';
import type { AiWeeklyReviewCompactSections, AiWeeklyReviewSectionBlock } from './types';
import { hasCompactWeeklyReviewContent } from './weeklyReviewMappers';

const { Text } = Typography;

export type AiWeeklyReviewModalStatus =
  | 'NONE'
  | 'GENERATING'
  | 'SUCCESS'
  | 'FAILED'
  | 'NOT_ENABLED'
  | 'RULE_ONLY'
  | 'PENDING'
  | 'READY';

export interface AiWeeklyReviewModalProps {
  open: boolean;
  title: string;
  generatedAt?: string | null;
  status?: AiWeeklyReviewModalStatus | string | null;
  errorMessage?: string | null;
  periodLabel?: string | null;
  compactSections?: AiWeeklyReviewCompactSections | null;
  onClose: () => void;
  width?: number;
}

const MODAL_DEFAULT_WIDTH = 980;
const MODAL_MIN_WIDTH = 980;

const AI_TYPO = {
  modalTitle: '#0f172a',
  cardTitle: '#0f172a',
  body: '#334155',
  label: '#64748b',
  meta: '#94a3b8',
} as const;

const COMPACT_CARD_ACCENTS = {
  completed: '#22c55e',
  unfinished: '#f59e0b',
  nextFocus: '#2563eb',
} as const;

const SUMMARY_TEXT_STYLE: CSSProperties = {
  color: AI_TYPO.body,
  fontSize: 14,
  lineHeight: 1.75,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const ITEM_LIST_STYLE: CSSProperties = {
  margin: 0,
  paddingLeft: 22,
  listStyleType: 'decimal',
  color: AI_TYPO.body,
  fontSize: 14,
  lineHeight: 1.8,
};

export function formatAiGeneratedAt(value?: string | null): string | null {
  if (!value) return null;
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : value;
}

function normalizeModalStatus(value?: AiWeeklyReviewModalStatus | string | null): AiWeeklyReviewModalStatus {
  const raw = String(value ?? 'NONE').toUpperCase();
  if (raw === 'READY') return 'SUCCESS';
  if (raw === 'PENDING') return 'GENERATING';
  const allowed: AiWeeklyReviewModalStatus[] = [
    'NONE', 'GENERATING', 'SUCCESS', 'FAILED', 'NOT_ENABLED', 'RULE_ONLY',
  ];
  return allowed.includes(raw as AiWeeklyReviewModalStatus) ? raw as AiWeeklyReviewModalStatus : 'NONE';
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        display: 'block',
        fontSize: 13,
        fontWeight: 600,
        color: AI_TYPO.label,
        marginBottom: 6,
      }}
    >
      {children}
    </Text>
  );
}

function CompactSectionCard({
  title,
  accent,
  section,
}: {
  title: string;
  accent: string;
  section: AiWeeklyReviewSectionBlock;
}) {
  const summary = String(section.summary ?? '').trim();
  const items = Array.isArray(section.items) ? section.items.filter(Boolean) : [];
  if (!summary && items.length === 0) return null;

  const cardStyle: CSSProperties = {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderLeft: `4px solid ${accent}`,
    borderRadius: 12,
    padding: '16px 18px',
  };

  return (
    <div style={cardStyle}>
      <Text
        strong
        style={{
          color: AI_TYPO.cardTitle,
          fontSize: 15,
          fontWeight: 700,
          display: 'block',
          marginBottom: 12,
        }}
      >
        {title}
      </Text>
      {summary ? (
        <div style={{ marginBottom: items.length > 0 ? 10 : 0 }}>
          <SectionLabel>总结：</SectionLabel>
          <Text style={{ ...SUMMARY_TEXT_STYLE, display: 'block' }}>
            {summary}
          </Text>
        </div>
      ) : null}
      {items.length > 0 ? (
        <div>
          <SectionLabel>重点明细：</SectionLabel>
          <ol style={ITEM_LIST_STYLE}>
            {items.map((item, index) => (
              <li
                key={`${index}-${item}`}
                style={{
                  marginBottom: 7,
                  whiteSpace: 'normal',
                  wordBreak: 'break-word',
                }}
              >
                {item}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

export function AiWeeklyReviewCompactContent({ sections }: { sections: AiWeeklyReviewCompactSections }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <CompactSectionCard
        title="上周完成情况"
        accent={COMPACT_CARD_ACCENTS.completed}
        section={sections.completed}
      />
      <CompactSectionCard
        title="上周未完成情况"
        accent={COMPACT_CARD_ACCENTS.unfinished}
        section={sections.unfinished}
      />
      <CompactSectionCard
        title="AI建议本周重点要做什么"
        accent={COMPACT_CARD_ACCENTS.nextFocus}
        section={sections.nextFocus}
      />
    </div>
  );
}

export default function AiWeeklyReviewModal({
  open,
  title,
  generatedAt,
  status,
  errorMessage,
  periodLabel,
  compactSections,
  onClose,
  width = MODAL_DEFAULT_WIDTH,
}: AiWeeklyReviewModalProps) {
  const normalizedStatus = normalizeModalStatus(status);
  const formattedTime = formatAiGeneratedAt(generatedAt);
  const showSuccessContent = normalizedStatus === 'SUCCESS' && hasCompactWeeklyReviewContent(compactSections);
  const modalWidth = Math.max(width, MODAL_MIN_WIDTH);

  let body: ReactNode;

  if (normalizedStatus === 'GENERATING') {
    body = (
      <div style={{ padding: '36px 0', textAlign: 'center' }}>
        <Spin size="large" />
        <div style={{ marginTop: 14 }}>
          <Text style={{ color: AI_TYPO.meta, fontSize: 14 }}>AI 汇总生成中，请稍后刷新</Text>
        </div>
      </div>
    );
  } else if (normalizedStatus === 'FAILED') {
    body = (
      <Alert
        type="error"
        showIcon
        message="AI 汇总生成失败"
        description={errorMessage || '请稍后重试或联系管理员。'}
        style={{ borderRadius: 12, fontSize: 14 }}
      />
    );
  } else if (normalizedStatus === 'NONE' || normalizedStatus === 'NOT_ENABLED' || normalizedStatus === 'RULE_ONLY') {
    body = <Empty description="暂无上周 AI 汇总，请先生成" />;
  } else if (!showSuccessContent || !compactSections) {
    body = <Empty description="暂无上周 AI 汇总，请先生成" />;
  } else {
    body = <AiWeeklyReviewCompactContent sections={compactSections} />;
  }

  return (
    <Modal
      title={(
        <span style={{ fontSize: 17, fontWeight: 700, color: AI_TYPO.modalTitle }}>
          {title}
        </span>
      )}
      open={open}
      onCancel={onClose}
      footer={null}
      width={modalWidth}
      destroyOnClose
      styles={{
        body: { paddingTop: 12, paddingBottom: 16 },
      }}
    >
      {periodLabel ? (
        <Text style={{ display: 'block', fontSize: 13, color: AI_TYPO.meta, marginBottom: 4 }}>
          周期：{periodLabel}
        </Text>
      ) : null}
      {formattedTime ? (
        <Text style={{ display: 'block', fontSize: 13, color: AI_TYPO.meta, marginBottom: 4 }}>
          生成时间：{formattedTime}
        </Text>
      ) : null}
      <div style={{ maxHeight: '78vh', overflowY: 'auto', overflowX: 'hidden', marginTop: 10, paddingRight: 4 }}>
        {body}
      </div>
    </Modal>
  );
}
