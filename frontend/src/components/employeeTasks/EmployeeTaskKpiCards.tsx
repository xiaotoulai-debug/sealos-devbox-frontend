import { Card, Progress, Typography } from 'antd';
import { CheckCircleOutlined, InboxOutlined, ScheduleOutlined, WarningOutlined } from '@ant-design/icons';
import type { EmployeeTaskSummaryCards } from './types';

const { Text } = Typography;

function toCount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export default function EmployeeTaskKpiCards({ summary, loading }: { summary?: EmployeeTaskSummaryCards | null; loading: boolean }) {
  const rate = Math.max(0, Math.min(100, toCount(summary?.monthlyCompletionRate)));
  const cards = [
    { title: '本周未完成任务', value: toCount(summary?.weeklyPendingCount), color: '#dc2626', bg: '#fee2e2', icon: <WarningOutlined />, desc: '待推进' },
    { title: '本周已完成任务', value: toCount(summary?.weeklyDoneCount), color: '#16a34a', bg: '#dcfce7', icon: <CheckCircleOutlined />, desc: '本周完成' },
    { title: '本月目标完成率', value: rate, color: '#2563eb', bg: '#dbeafe', icon: <ScheduleOutlined />, desc: '本月进度', isRate: true },
    { title: '我收到的任务', value: toCount(summary?.receivedTaskCount), color: '#7c3aed', bg: '#ede9fe', icon: <InboxOutlined />, desc: '待协作' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 16 }}>
      {cards.map((card) => (
        <Card key={card.title} loading={loading} style={{ borderRadius: 16, border: '1px solid #e8eef7', boxShadow: '0 8px 20px rgba(15, 23, 42, 0.04)' }} styles={{ body: { padding: 16 } }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: card.bg,
                color: card.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                flexShrink: 0,
              }}>
                {card.icon}
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 13 }}>{card.title}</Text>
                <div style={{ color: card.color, fontSize: 27, fontWeight: 800, lineHeight: 1.15 }}>
                  {card.isRate ? `${card.value}%` : card.value}
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>{card.desc}</Text>
              </div>
            </div>
            {card.isRate && <Progress type="circle" size={48} percent={card.value} strokeColor={card.color} />}
          </div>
        </Card>
      ))}
    </div>
  );
}
