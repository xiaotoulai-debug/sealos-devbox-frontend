import { Card, Empty, Segmented, Space } from 'antd';
import { LineChartOutlined } from '@ant-design/icons';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { OperationRange, OperationTrendPoint } from './types';

function toCount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export default function OperationTrendChart({
  data,
  range,
  loading,
  onRangeChange,
}: {
  data?: OperationTrendPoint[];
  range: OperationRange;
  loading: boolean;
  onRangeChange: (range: OperationRange) => void;
}) {
  const list = Array.isArray(data) ? data : [];
  const chartData = list.map((item) => ({
    date: item.date,
    选品: toCount(item.productSelectionCount),
    上新: toCount(item.productListingCount),
    合规: toCount(item.approvedCount),
    发货: toCount(item.shipmentCount),
    其他: toCount(item.otherCount),
  }));

  return (
    <Card
      title={<Space><LineChartOutlined />运营动作趋势</Space>}
      extra={(
        <Segmented
          size="small"
          value={range}
          onChange={(value) => onRangeChange(value as OperationRange)}
          options={[
            { label: '近 7 天', value: '7d' },
            { label: '近 30 天', value: '30d' },
          ]}
        />
      )}
      loading={loading}
      style={{ borderRadius: 14 }}
    >
      {chartData.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无趋势数据" style={{ padding: 40 }} />
      ) : (
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <RechartsTooltip />
              <Legend />
              <Line type="monotone" dataKey="选品" stroke="#2563eb" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="上新" stroke="#7c3aed" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="合规" stroke="#0891b2" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="发货" stroke="#d97706" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="其他" stroke="#64748b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
