import { Descriptions, Drawer, Empty, Space, Tag, Typography } from 'antd';
import type { DailyReminderTodayItem } from './types';
import { REMINDER_CATEGORY_LABELS, REMINDER_PRIORITY_LABELS, REMINDER_STATUS_LABELS, getReminderStatus } from './types';

const { Paragraph, Title } = Typography;

function priorityColor(priority?: string | null) {
  if (priority === 'P0') return 'red';
  if (priority === 'P1') return 'orange';
  return 'blue';
}

function statusColor(item?: DailyReminderTodayItem | null) {
  if (!item) return 'default';
  if (item.isOverdue && getReminderStatus(item) !== 'CHECKED') return 'red';
  const status = getReminderStatus(item);
  if (status === 'CHECKED') return 'green';
  if (status === 'ABNORMAL') return 'volcano';
  return 'gold';
}

export default function ReminderDetailDrawer({
  open,
  reminder,
  onClose,
}: {
  open: boolean;
  reminder?: DailyReminderTodayItem | null;
  onClose: () => void;
}) {
  const status = reminder ? getReminderStatus(reminder) : 'PENDING';
  return (
    <Drawer open={open} width={520} title="提醒说明" onClose={onClose}>
      {!reminder ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择提醒事项" />
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>{reminder.title}</Title>
            <Space wrap style={{ marginTop: 8 }}>
              <Tag color={priorityColor(reminder.priority)}>{reminder.priorityName || REMINDER_PRIORITY_LABELS[reminder.priority]}</Tag>
              <Tag color="blue">{reminder.categoryName || REMINDER_CATEGORY_LABELS[reminder.category]}</Tag>
              <Tag color={statusColor(reminder)}>
                {reminder.isOverdue && status !== 'CHECKED' ? '已逾期' : reminder.checkStatusName || REMINDER_STATUS_LABELS[status]}
              </Tag>
            </Space>
          </div>

          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="平台">{reminder.platformName || reminder.platform || '-'}</Descriptions.Item>
            <Descriptions.Item label="店铺">{reminder.shopName || '-'}</Descriptions.Item>
            <Descriptions.Item label="建议时间">{reminder.suggestedTime ? `${reminder.suggestedTime} 前` : '-'}</Descriptions.Item>
            <Descriptions.Item label="当前状态">
              {reminder.isOverdue && status !== 'CHECKED' ? '已逾期' : reminder.checkStatusName || REMINDER_STATUS_LABELS[status]}
            </Descriptions.Item>
            <Descriptions.Item label="检查时间">{reminder.checkedAt || '-'}</Descriptions.Item>
          </Descriptions>

          <div>
            <Typography.Text strong>SOP 说明</Typography.Text>
            <Paragraph style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
              {reminder.description || '暂无 SOP 说明'}
            </Paragraph>
          </div>

          <div>
            <Typography.Text strong>员工备注</Typography.Text>
            <Paragraph style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
              {reminder.note || '-'}
            </Paragraph>
          </div>
        </Space>
      )}
    </Drawer>
  );
}
