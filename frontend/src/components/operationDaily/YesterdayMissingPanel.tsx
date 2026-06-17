import { Card, Empty, List, Space, Tag, Typography } from 'antd';
import { UserDeleteOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import type { DailyWorkdayStatus, TaskUserBrief } from './types';

const { Text } = Typography;

function isYesterdayNonWorkday(
  yesterdayRequired?: boolean,
  yesterdayWorkdayStatus?: DailyWorkdayStatus | null,
): boolean {
  return yesterdayRequired === false
    || yesterdayWorkdayStatus === 'REST'
    || yesterdayWorkdayStatus === 'PENDING';
}

export default function YesterdayMissingPanel({
  users,
  loading,
  yesterdayRequired = true,
  yesterdayWorkdayStatus,
  hintMessage,
}: {
  users?: TaskUserBrief[];
  loading: boolean;
  yesterdayRequired?: boolean;
  yesterdayWorkdayStatus?: DailyWorkdayStatus | null;
  hintMessage?: string;
}) {
  const list = Array.isArray(users) ? users : [];
  const isRestDay = yesterdayRequired === false || yesterdayWorkdayStatus === 'REST';
  const isPendingDay = yesterdayWorkdayStatus === 'PENDING';
  const displayList = isYesterdayNonWorkday(yesterdayRequired, yesterdayWorkdayStatus) ? [] : list;

  let emptyDescription: ReactNode = <Text style={{ color: '#16a34a' }}>昨日全员已提交</Text>;
  if (isRestDay) {
    emptyDescription = (
      <Space direction="vertical" size={4}>
        <Text style={{ color: '#64748b' }}>昨日未登记名单为空</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {hintMessage || '昨日为休息日，无需登记'}
        </Text>
      </Space>
    );
  } else if (isPendingDay) {
    emptyDescription = (
      <Space direction="vertical" size={4}>
        <Text style={{ color: '#64748b' }}>昨日未登记名单为空</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {hintMessage || '昨日运营日历待定，暂不统计未登记'}
        </Text>
      </Space>
    );
  }

  return (
    <Card
      title={<Space><UserDeleteOutlined style={{ color: '#dc2626' }} />昨日未登记名单</Space>}
      loading={loading}
      style={{ borderRadius: 18, height: '100%', border: '1px solid #e8eef7', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)' }}
      styles={{
        header: { borderBottom: '1px solid #eef2f7', fontWeight: 700 },
        body: { padding: displayList.length === 0 ? 22 : '6px 16px' },
      }}
    >
      {displayList.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />
      ) : (
        <List
          size="small"
          dataSource={displayList}
          renderItem={(user) => (
            <List.Item style={{ padding: '10px 0', borderBlockEnd: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12 }}>
                <Space>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                  <Text strong>{user.name}</Text>
                  {user.roleName && <Tag color="default" style={{ marginInlineEnd: 0 }}>{user.roleName}</Tag>}
                </Space>
                <Tag color="red" style={{ marginInlineEnd: 0 }}>未提交</Tag>
              </div>
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}
