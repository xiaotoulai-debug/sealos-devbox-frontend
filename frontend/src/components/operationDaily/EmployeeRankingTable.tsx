import { Button, Empty, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import type { EmployeeRankingItem } from './types';

const { Text } = Typography;

function toCount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export default function EmployeeRankingTable({
  rows,
  loading,
  onViewDetail,
}: {
  rows?: EmployeeRankingItem[];
  loading: boolean;
  onViewDetail: (record: EmployeeRankingItem) => void;
}) {
  const dataSource = Array.isArray(rows) ? rows : [];
  const columns: ColumnsType<EmployeeRankingItem> = [
    {
      title: '员工',
      key: 'name',
      fixed: 'left',
      width: 150,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.name || '-'}</Text>
          {record.roleName && <Text type="secondary" style={{ fontSize: 12 }}>{record.roleName}</Text>}
        </Space>
      ),
    },
    {
      title: '登记状态',
      key: 'registered',
      width: 110,
      align: 'center',
      render: (_, record) => (
        record.registered
          ? <Tag color="green">已登记</Tag>
          : <Tag color="red">未登记</Tag>
      ),
    },
    { title: '选品', dataIndex: 'productSelectionCount', key: 'productSelectionCount', width: 80, align: 'right', render: toCount },
    { title: '上新', dataIndex: 'productListingCount', key: 'productListingCount', width: 80, align: 'right', render: toCount },
    { title: '合规', dataIndex: 'approvedCount', key: 'approvedCount', width: 80, align: 'right', render: toCount },
    { title: '发货', dataIndex: 'shipmentCount', key: 'shipmentCount', width: 80, align: 'right', render: toCount },
    { title: '其他', dataIndex: 'otherCount', key: 'otherCount', width: 80, align: 'right', render: toCount },
    {
      title: '总量',
      dataIndex: 'totalQuantity',
      key: 'totalQuantity',
      width: 80,
      align: 'right',
      render: (value) => <Text strong>{toCount(value)}</Text>,
    },
    {
      title: '得分',
      dataIndex: 'score',
      key: 'score',
      width: 80,
      align: 'right',
      render: (value) => <Text strong style={{ color: '#2563eb' }}>{toCount(value)}</Text>,
    },
    {
      title: '阻塞状态',
      key: 'blocked',
      width: 110,
      align: 'center',
      render: (_, record) => (
        record.hasBlockedTask
          ? <Tag color="orange">有阻塞</Tag>
          : <Tag color="default">正常</Tag>
      ),
    },
    {
      title: '查看明细',
      key: 'action',
      width: 110,
      fixed: 'right',
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => onViewDetail(record)}>
          查看明细
        </Button>
      ),
    },
  ];

  return (
    <Table<EmployeeRankingItem>
      rowKey={(record) => String(record.userId)}
      columns={columns}
      dataSource={dataSource}
      loading={loading}
      pagination={false}
      size="middle"
      scroll={{ y: 'calc(100vh - 560px)', x: 'max-content' }}
      locale={{ emptyText: <Empty description="暂无员工登记数据" /> }}
    />
  );
}
