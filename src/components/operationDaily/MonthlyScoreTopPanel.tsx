import { Card, Empty, Space, Typography } from 'antd';
import { TrophyOutlined } from '@ant-design/icons';
import type { MonthlyScoreTopItem } from './types';

const { Text } = Typography;

const rankStyles = [
  { bg: 'linear-gradient(135deg, #fef3c7, #fde68a)', color: '#92400e', border: '#facc15' },
  { bg: 'linear-gradient(135deg, #f8fafc, #e2e8f0)', color: '#475569', border: '#cbd5e1' },
  { bg: 'linear-gradient(135deg, #ffedd5, #fed7aa)', color: '#9a3412', border: '#fb923c' },
  { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' },
  { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' },
];

function toScore(item: MonthlyScoreTopItem): number {
  const n = Number(item.monthlyScore ?? item.score ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export default function MonthlyScoreTopPanel({ rows, loading }: { rows?: MonthlyScoreTopItem[]; loading: boolean }) {
  const list = (Array.isArray(rows) ? rows : []).slice(0, 5);
  return (
    <Card
      title={<Space><TrophyOutlined style={{ color: '#f59e0b' }} />本月积分榜 Top 5 <Text type="secondary" style={{ fontSize: 12 }}>累计积分</Text></Space>}
      loading={loading}
      style={{ borderRadius: 18, height: '100%', border: '1px solid #e8eef7', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)' }}
      styles={{
        header: { borderBottom: '1px solid #eef2f7', fontWeight: 700 },
        body: { padding: list.length === 0 ? 22 : 16 },
      }}
    >
      {list.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无积分数据" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
          {list.map((item, index) => {
            const style = rankStyles[index] ?? rankStyles[4];
            return (
              <div
                key={`${item.userId}-${index}`}
                style={{
                  minHeight: 104,
                  padding: 12,
                  borderRadius: 14,
                  border: `1px solid ${style.border}`,
                  background: index === 0 ? 'linear-gradient(180deg, #fffbeb 0%, #ffffff 100%)' : '#ffffff',
                  boxShadow: index === 0 ? '0 10px 20px rgba(245, 158, 11, 0.12)' : '0 6px 14px rgba(15, 23, 42, 0.04)',
                }}
              >
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 34,
                  height: 24,
                  padding: '0 8px',
                  borderRadius: 999,
                  background: style.bg,
                  color: style.color,
                  fontWeight: 800,
                  fontSize: 12,
                  marginBottom: 10,
                }}>
                  #{item.rank ?? index + 1}
                </div>
                <div style={{ fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                {item.roleName && <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.roleName}</div>}
                <div style={{ marginTop: 8 }}>
                  <Text strong style={{ color: '#2563eb', fontSize: 20 }}>{toScore(item)}</Text>
                  <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>分</Text>
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>{item.scoreText || '本月累计'}</Text>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
