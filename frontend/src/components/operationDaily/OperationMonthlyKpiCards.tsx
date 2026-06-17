import { Card, Typography } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SearchOutlined,
  UploadOutlined,
  SafetyCertificateOutlined,
  TruckOutlined,
} from '@ant-design/icons';
import type { DailyWorkdayStatus, MonthlySummaryCards } from './types';

const { Text } = Typography;

function toCount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isYesterdayNonWorkday(
  yesterdayRequired?: boolean,
  yesterdayWorkdayStatus?: DailyWorkdayStatus | null,
): boolean {
  return yesterdayRequired === false
    || yesterdayWorkdayStatus === 'REST'
    || yesterdayWorkdayStatus === 'PENDING';
}

export default function OperationMonthlyKpiCards({
  summary,
  loading,
  yesterdayRequired = true,
  yesterdayWorkdayStatus,
}: {
  summary?: MonthlySummaryCards | null;
  loading: boolean;
  yesterdayRequired?: boolean;
  yesterdayWorkdayStatus?: DailyWorkdayStatus | null;
}) {
  const yesterdayNonWorkday = isYesterdayNonWorkday(yesterdayRequired, yesterdayWorkdayStatus);
  const cards = [
    {
      title: '昨日登记人数',
      desc: '昨日数据',
      value: yesterdayNonWorkday ? 0 : summary?.yesterdayRegisteredCount,
      icon: <CheckCircleOutlined />,
      color: '#16a34a',
      bg: '#dcfce7',
    },
    {
      title: '昨日未登记人数',
      desc: '昨日数据',
      value: yesterdayNonWorkday ? 0 : summary?.yesterdayMissingCount,
      icon: <CloseCircleOutlined />,
      color: '#dc2626',
      bg: '#fee2e2',
    },
    { title: '本月选品数', desc: '本月累计', value: summary?.monthlyProductSelectionCount, icon: <SearchOutlined />, color: '#2563eb', bg: '#dbeafe' },
    { title: '本月上新数', desc: '本月累计', value: summary?.monthlyProductListingCount, icon: <UploadOutlined />, color: '#7c3aed', bg: '#ede9fe' },
    { title: '本月合规数', desc: '本月累计', value: summary?.monthlyApprovedCount, icon: <SafetyCertificateOutlined />, color: '#0891b2', bg: '#cffafe' },
    { title: '本月发货数', desc: '本月累计', value: summary?.monthlyShipmentCount, icon: <TruckOutlined />, color: '#d97706', bg: '#fef3c7' },
  ];

  return (
    <Card
      loading={loading}
      style={{ borderRadius: 18, marginBottom: 16, border: '1px solid #e8eef7', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)' }}
      styles={{ body: { padding: 0 } }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
        {cards.map((card, index) => (
          <div
            key={card.title}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '18px 16px',
              borderRight: index === cards.length - 1 ? 'none' : '1px solid #edf2f7',
              minWidth: 0,
            }}
          >
            <div style={{
              width: 44,
              height: 44,
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
            <div style={{ minWidth: 0 }}>
              <Text type="secondary" style={{ fontSize: 13 }}>{card.title}</Text>
              <div style={{ color: card.color, fontWeight: 800, fontSize: 27, lineHeight: 1.1, marginTop: 3 }}>
                {toCount(card.value)}
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>{card.desc}</Text>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
