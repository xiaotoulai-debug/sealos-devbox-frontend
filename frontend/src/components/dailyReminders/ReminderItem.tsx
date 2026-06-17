import { Space, Tag, Tooltip } from 'antd';
import type { DailyReminderTodayItem } from './types';
import { REMINDER_CATEGORY_LABELS, REMINDER_PRIORITY_LABELS } from './types';

const rankStyles = [
  { background: '#EFF6FF', color: '#2563EB', border: '1px solid #DBEAFE' },
  { background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1' },
  { background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0' },
];

function getRankStyle(rank: number) {
  if (rank === 1) return rankStyles[0];
  if (rank === 2) return rankStyles[1];
  return rankStyles[2];
}

function getPriorityTagStyle(priority?: string | null) {
  if (priority === 'P0') {
    return { background: '#FEF2F2', color: '#DC2626', borderColor: '#FECACA' };
  }
  if (priority === 'P1') {
    return { background: '#FFF7ED', color: '#EA580C', borderColor: '#FED7AA' };
  }
  return { background: '#F1F5F9', color: '#475569', borderColor: '#CBD5E1' };
}

function getCardAlertStyle(priority?: string | null) {
  if (priority === 'P0') {
    return {
      border: '1px solid #FED7D7',
      background: 'linear-gradient(180deg, #FFF8F8 0%, #FFFFFF 100%)',
      boxShadow: '0 4px 12px rgba(185, 28, 28, 0.04)',
    };
  }

  if (priority === 'P1') {
    return {
      border: '1px solid #FED7AA',
      background: 'linear-gradient(180deg, #FFFBF5 0%, #FFFFFF 100%)',
      boxShadow: '0 4px 12px rgba(234, 88, 12, 0.035)',
    };
  }

  return {
    border: '1px solid #E5E7EB',
    background: '#FFFFFF',
    boxShadow: 'none',
  };
}

export default function ReminderItem({ item, rank }: { item: DailyReminderTodayItem; rank: number }) {
  const rankStyle = getRankStyle(rank);
  const priorityTagStyle = getPriorityTagStyle(item.priority);
  const cardAlertStyle = getCardAlertStyle(item.priority);
  const title = item.title || '未命名提醒';

  return (
    <div
      className="daily-reminder-rank-card"
      style={{
        minHeight: 96,
        height: '100%',
        width: '100%',
        padding: 12,
        borderRadius: 12,
        transition: 'all 0.18s ease',
        ...cardAlertStyle,
      }}
    >
      <style>
        {`
          .daily-reminder-rank-card:hover {
            transform: translateY(-1px);
            border-color: #FCA5A5 !important;
            box-shadow: 0 8px 16px rgba(15, 23, 42, 0.06) !important;
          }
        `}
      </style>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
        padding: '2px 8px',
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1.4,
        marginBottom: 8,
        ...rankStyle,
      }}>
        #{rank}
      </div>

      <Tooltip title={title}>
        <div
          style={{
            minHeight: 38,
            marginTop: 0,
            color: '#7F1D1D',
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1.45,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 5,
          }}
        >
          <span
            aria-hidden
            style={{
              color: '#B91C1C',
              fontSize: 12,
              lineHeight: '18px',
              flexShrink: 0,
              marginTop: 1,
            }}
          >
            🚩
          </span>
          <span
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {title}
          </span>
        </div>
      </Tooltip>

      <Space size={[4, 5]} wrap style={{ marginTop: 10 }}>
        <Tag style={{ marginInlineEnd: 0, fontSize: 12, ...priorityTagStyle }}>
          {item.priorityName || REMINDER_PRIORITY_LABELS[item.priority]}
        </Tag>
        <Tag style={{ marginInlineEnd: 0, fontSize: 12, background: '#EFF6FF', color: '#2563EB', borderColor: '#DBEAFE' }}>
          {item.categoryName || REMINDER_CATEGORY_LABELS[item.category] || item.category}
        </Tag>
        {item.platformName && (
          <Tag style={{ marginInlineEnd: 0, fontSize: 12, background: '#ECFDF5', color: '#059669', borderColor: '#A7F3D0' }}>
            {item.platformName}
          </Tag>
        )}
      </Space>
    </div>
  );
}
