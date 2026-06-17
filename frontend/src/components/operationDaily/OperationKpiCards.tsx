import { Card, Statistic } from 'antd';
import {
  CheckCircleOutlined,
  UserDeleteOutlined,
  SearchOutlined,
  UploadOutlined,
  SafetyCertificateOutlined,
  TruckOutlined,
} from '@ant-design/icons';
import type { OperationSummaryCards } from './types';

function toCount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export default function OperationKpiCards({ summary, loading }: { summary?: OperationSummaryCards | null; loading: boolean }) {
  const cards = [
    { title: '今日已登记人数', value: summary?.registeredUserCount, icon: <CheckCircleOutlined />, color: '#16a34a', bg: '#dcfce7' },
    { title: '今日未登记人数', value: summary?.unregisteredUserCount, icon: <UserDeleteOutlined />, color: '#dc2626', bg: '#fee2e2' },
    { title: '今日选品数', value: summary?.productSelectionCount, icon: <SearchOutlined />, color: '#2563eb', bg: '#dbeafe' },
    { title: '今日上新数', value: summary?.productListingCount, icon: <UploadOutlined />, color: '#7c3aed', bg: '#ede9fe' },
    { title: '今日合规数', value: summary?.approvedCount, icon: <SafetyCertificateOutlined />, color: '#0891b2', bg: '#cffafe' },
    { title: '今日发货数', value: summary?.shipmentCount, icon: <TruckOutlined />, color: '#d97706', bg: '#fef3c7' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 16 }}>
      {cards.map((card) => (
        <Card key={card.title} loading={loading} style={{ borderRadius: 14 }} styles={{ body: { padding: 16 } }}>
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
              fontSize: 20,
              flexShrink: 0,
            }}>
              {card.icon}
            </div>
            <Statistic
              title={card.title}
              value={toCount(card.value)}
              valueStyle={{ color: card.color, fontWeight: 700, fontSize: 22, lineHeight: 1.15 }}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}
