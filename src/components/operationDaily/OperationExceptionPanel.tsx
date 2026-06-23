import { Card, Empty, Space, Tag, Typography } from 'antd';
import { AlertOutlined, StopOutlined, UserDeleteOutlined } from '@ant-design/icons';
import type { BlockedItem, OperationUserBrief } from './types';
import { TASK_TYPE_LABELS } from './types';

const { Text } = Typography;

function UserList({ users, emptyText }: { users?: OperationUserBrief[]; emptyText: string }) {
  const list = Array.isArray(users) ? users : [];
  if (list.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />;
  return (
    <Space direction="vertical" size={6} style={{ width: '100%' }}>
      {list.map((user) => (
        <Tag key={`${user.userId}-${user.name}`} color="default" style={{ marginInlineEnd: 0, width: 'fit-content' }}>
          {user.name}
        </Tag>
      ))}
    </Space>
  );
}

function BlockedList({ items }: { items?: BlockedItem[] }) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无阻塞事项" />;
  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      {list.map((item) => (
        <div key={item.id} style={{ padding: 10, borderRadius: 10, background: '#fff7ed', border: '1px solid #fed7aa' }}>
          <Space size={6} wrap>
            <Text strong>{item.name}</Text>
            <Tag color="orange" style={{ marginInlineEnd: 0 }}>{TASK_TYPE_LABELS[item.taskType] ?? item.taskType}</Tag>
          </Space>
          <div style={{ marginTop: 4, color: '#9a3412', fontSize: 12 }}>
            {item.blockerReason || '未填写备注'}
          </div>
        </div>
      ))}
    </Space>
  );
}

export default function OperationExceptionPanel({
  missingUsers,
  zeroOutputUsers,
  blockedItems,
}: {
  missingUsers?: OperationUserBrief[];
  zeroOutputUsers?: OperationUserBrief[];
  blockedItems?: BlockedItem[];
}) {
  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Card size="small" title={<Space><UserDeleteOutlined style={{ color: '#dc2626' }} />今日未登记人员</Space>} style={{ borderRadius: 12 }}>
        <UserList users={missingUsers} emptyText="今日暂无未登记人员" />
      </Card>
      <Card size="small" title={<Space><StopOutlined style={{ color: '#d97706' }} />登记但产出为 0</Space>} style={{ borderRadius: 12 }}>
        <UserList users={zeroOutputUsers} emptyText="暂无零产出人员" />
      </Card>
      <Card size="small" title={<Space><AlertOutlined style={{ color: '#f59e0b' }} />今日阻塞事项</Space>} style={{ borderRadius: 12 }}>
        <BlockedList items={blockedItems} />
      </Card>
    </Space>
  );
}
