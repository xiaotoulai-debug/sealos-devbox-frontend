import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Descriptions, Drawer, Empty, message, Popconfirm, Space, Spin, Tag, Timeline, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { isAdminUser } from '../../lib/auth';
import {
  fetchEmployeeTaskDetail,
  getBackendMessage,
  updateEmployeeTaskDueDate,
  updateEmployeeTaskStatus,
} from './api';
import EmployeeTaskCommentPanel from './EmployeeTaskCommentPanel';
import EmployeeTaskFormModal from './EmployeeTaskFormModal';
import type { EmployeeTaskDetailData, EmployeeTaskDto, EmployeeTaskStatus } from './types';
import {
  formatTaskDeadline,
  getEmployeeTaskDisplayStatusLabel,
  isEmployeeTaskPending,
  PLATFORM_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TASK_TYPE_LABELS,
} from './types';
import EmployeeTaskPlatformTag from './EmployeeTaskPlatformTag';

const { Paragraph, Text, Title } = Typography;

function statusTag(task?: EmployeeTaskDetailData | null) {
  if (!task) return null;
  if (task.isOverdue && task.status !== 'DONE' && task.status !== 'CANCELLED') {
    return <Tag color="red">已逾期</Tag>;
  }
  const color = task.status === 'DONE'
    ? 'success'
    : task.status === 'CANCELLED'
      ? 'default'
      : 'gold';
  return <Tag color={color}>{getEmployeeTaskDisplayStatusLabel(task)}</Tag>;
}

function priorityTag(task?: EmployeeTaskDetailData | null) {
  if (!task) return null;
  const color = task.priority === 'HIGH' ? 'red' : task.priority === 'MEDIUM' ? 'gold' : 'blue';
  return <Tag color={color}>{task.priorityName || PRIORITY_LABELS[task.priority]}</Tag>;
}

export default function EmployeeTaskDetailDrawer({
  open,
  taskId,
  currentUserId,
  onClose,
  onChanged,
}: {
  open: boolean;
  taskId?: number | null;
  currentUserId?: number | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<EmployeeTaskDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [dueDateSaving, setDueDateSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!open || !taskId) return;
    setLoading(true);
    setError('');
    try {
      setDetail(await fetchEmployeeTaskDetail(taskId));
    } catch (err) {
      setDetail(null);
      setError(getBackendMessage(err, '加载任务详情失败'));
    } finally {
      setLoading(false);
    }
  }, [open, taskId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const isAssignee = Boolean(currentUserId && detail?.assigneeId === currentUserId);
  const isCreator = Boolean(currentUserId && detail?.creatorId === currentUserId);
  const isAdmin = isAdminUser();
  const closed = detail?.status === 'DONE' || detail?.status === 'CANCELLED';
  const canEditDueDate = Boolean(detail && !closed && (isAssignee || isCreator || isAdmin));
  const canCancelTask = Boolean(detail && !closed && (isCreator || isAdmin));

  const actionItems = useMemo(() => {
    if (!detail || closed) return [];
    const items: { key: string; label: string; status: EmployeeTaskStatus; danger?: boolean }[] = [];
    if (isAssignee && isEmployeeTaskPending(detail.status)) {
      items.push({ key: 'done', label: '标记完成', status: 'DONE' });
    }
    if (canCancelTask) {
      items.push({ key: 'cancel', label: '取消任务', status: 'CANCELLED', danger: true });
    }
    return items;
  }, [canCancelTask, closed, detail, isAssignee]);

  const updateStatus = async (status: EmployeeTaskStatus) => {
    if (!detail || closed) return;
    setStatusLoading(true);
    try {
      await updateEmployeeTaskStatus(detail.id, { status });
      message.success('任务状态已更新');
      await loadDetail();
      onChanged();
    } catch (err) {
      message.error(getBackendMessage(err, '更新任务状态失败'));
    } finally {
      setStatusLoading(false);
    }
  };

  const handleDueDateChange = async (value: Dayjs | null) => {
    if (!detail || !value || !canEditDueDate) return;
    setDueDateSaving(true);
    try {
      await updateEmployeeTaskDueDate(detail.id, value.format('YYYY-MM-DD'));
      message.success('截止日期已更新');
      await loadDetail();
      onChanged();
    } catch (err) {
      message.error(getBackendMessage(err, '更新截止日期失败'));
    } finally {
      setDueDateSaving(false);
    }
  };

  const handleEditSuccess = async () => {
    setEditOpen(false);
    await loadDetail();
    onChanged();
  };

  const logs = Array.isArray(detail?.logs) ? detail.logs : [];

  return (
    <>
      <Drawer
        open={open}
        width={620}
        title="任务详情"
        onClose={onClose}
        extra={
          <Space>
            {detail && isCreator && !closed && <Button onClick={() => setEditOpen(true)}>编辑任务</Button>}
            {actionItems.map((item) => (
              item.danger ? (
                <Popconfirm key={item.key} title="确认取消该任务？" onConfirm={() => updateStatus(item.status)}>
                  <Button danger loading={statusLoading}>{item.label}</Button>
                </Popconfirm>
              ) : (
                <Button key={item.key} type="primary" loading={statusLoading} onClick={() => updateStatus(item.status)}>
                  {item.label}
                </Button>
              )
            ))}
          </Space>
        }
      >
        <Spin spinning={loading}>
          {error ? (
            <Alert type={error.includes('403') || error.includes('权限') ? 'warning' : 'error'} showIcon message={error.includes('403') ? '暂无查看该任务权限' : error} />
          ) : detail ? (
            <div>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <EmployeeTaskPlatformTag task={detail} />
                  <Title level={4} ellipsis style={{ margin: 0, flex: 1, minWidth: 0 }}>{detail.title}</Title>
                </div>
                <Space wrap>
                  {statusTag(detail)}
                  {priorityTag(detail)}
                  {detail.isOverdue && detail.status !== 'DONE' && detail.status !== 'CANCELLED' && <Tag color="red">逾期提醒</Tag>}
                </Space>
              </Space>

              <Descriptions column={2} size="small" bordered style={{ marginTop: 16 }}>
                <Descriptions.Item label="任务类型">{detail.taskTypeName || TASK_TYPE_LABELS[detail.taskType]}</Descriptions.Item>
                <Descriptions.Item label="平台">{detail.platform ? detail.platformName || PLATFORM_LABELS[detail.platform] : '-'}</Descriptions.Item>
                <Descriptions.Item label="店铺">{detail.shopName || '-'}</Descriptions.Item>
                <Descriptions.Item label="截止日期">
                  {canEditDueDate ? (
                    <DatePicker
                      value={detail.dueDate ? dayjs(detail.dueDate) : null}
                      format="YYYY-MM-DD"
                      allowClear={false}
                      disabled={dueDateSaving}
                      onChange={handleDueDateChange}
                      style={{ width: '100%' }}
                    />
                  ) : (
                    formatTaskDeadline(detail.dueDate)
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="创建人">{detail.creatorName || '-'}</Descriptions.Item>
                <Descriptions.Item label="指派给">{detail.assigneeName || '-'}</Descriptions.Item>
              </Descriptions>

              <div style={{ marginTop: 18 }}>
                <Text strong>任务说明</Text>
                <Paragraph style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{detail.description || '-'}</Paragraph>
                <Text strong>相关 SKU / SKC</Text>
                <Paragraph style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{detail.relatedSkuText || '-'}</Paragraph>
                <Text strong>备注</Text>
                <Paragraph style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{detail.remark || '-'}</Paragraph>
              </div>

              <div style={{ marginTop: 18 }}>
                <Text strong>操作日志</Text>
                {logs.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无操作日志" />
                ) : (
                  <Timeline
                    style={{ marginTop: 14 }}
                    items={logs.map((log) => ({
                      children: (
                        <div>
                          <Text strong>{log.actionName || log.action}</Text>
                          <div style={{ color: '#64748b', fontSize: 12 }}>
                            {log.operatorName || '-'} · {log.createdAt || '-'}
                            {log.afterStatus ? ` · ${STATUS_LABELS[log.afterStatus]}` : ''}
                          </div>
                          {log.remark && <div style={{ marginTop: 4 }}>{log.remark}</div>}
                        </div>
                      ),
                    }))}
                  />
                )}
              </div>

              <EmployeeTaskCommentPanel taskId={detail.id} open={open} onChanged={onChanged} />
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择任务" />
          )}
        </Spin>
      </Drawer>
      <EmployeeTaskFormModal
        open={editOpen}
        task={detail as EmployeeTaskDto | null}
        onCancel={() => setEditOpen(false)}
        onSuccess={handleEditSuccess}
      />
    </>
  );
}
