import { Button, Card, Empty, List, Space, Tabs, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import type { EmployeeTaskDto } from './types';
import {
  getEmployeeTaskDisplayStatusLabel,
  getEmployeeTaskPriority,
  getEmployeeTaskStatus,
  isActiveTaskOverdue,
  isEmployeeTaskPending,
  PRIORITY_LABELS,
  sortEmployeeTasks,
  TASK_TYPE_LABELS,
} from './types';
import EmployeeTaskPlatformTag from './EmployeeTaskPlatformTag';
import TaskDeadlineText from './TaskDeadlineText';
import {
  getTaskRowStyle,
  getTaskTagsWrapStyle,
  getTaskTitleStyle,
  isTaskOverdueActive,
  type CompletedDimLevel,
} from './taskVisualStyles';

const { Text } = Typography;

function statusTag(task: EmployeeTaskDto) {
  if (isTaskOverdueActive(task)) return <Tag color="red">已逾期</Tag>;
  const status = getEmployeeTaskStatus(task);
  const color = status === 'DONE' ? 'green' : status === 'CANCELLED' ? 'default' : 'gold';
  return <Tag color={color}>{getEmployeeTaskDisplayStatusLabel(task)}</Tag>;
}

function priorityTag(task: EmployeeTaskDto) {
  const priority = getEmployeeTaskPriority(task);
  const color = priority === 'HIGH' ? 'red' : priority === 'MEDIUM' ? 'orange' : 'green';
  return <Tag color={color}>{task.priorityName || PRIORITY_LABELS[priority]}</Tag>;
}

function TaskRow({
  task,
  onOpen,
  onDone,
  completedDim,
}: {
  task: EmployeeTaskDto;
  onOpen: (task: EmployeeTaskDto) => void;
  onDone: (task: EmployeeTaskDto) => void;
  completedDim?: CompletedDimLevel;
}) {
  const status = getEmployeeTaskStatus(task);
  const canDone = isEmployeeTaskPending(status);
  const titleStyle = getTaskTitleStyle(task);

  return (
    <div
      style={{
        width: '100%',
        minHeight: 62,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(230px, auto) auto',
        alignItems: 'center',
        gap: 12,
        padding: '9px 12px',
        borderRadius: 10,
        ...getTaskRowStyle(task, { completedDim }),
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <div style={getTaskTagsWrapStyle(task)}>
            <EmployeeTaskPlatformTag task={task} />
          </div>
          <Text
            strong={!titleStyle.fontWeight || Number(titleStyle.fontWeight) >= 600}
            ellipsis
            style={{ flex: 1, minWidth: 0, fontSize: 14, ...titleStyle }}
          >
            {task.title || '未命名任务'}
          </Text>
        </div>
        <TaskDeadlineText task={task} />
      </div>
      <div style={getTaskTagsWrapStyle(task)}>
        <Space size={[4, 4]} wrap style={{ justifyContent: 'flex-start' }}>
          <Tag color="blue">{task.taskTypeName || TASK_TYPE_LABELS[task.taskType]}</Tag>
          {priorityTag(task)}
          {statusTag(task)}
        </Space>
      </div>
      <Space size={4} wrap style={{ justifyContent: 'flex-end' }}>
        <Button size="small" onClick={() => onOpen(task)}>详情</Button>
        {canDone && <Button size="small" type="link" onClick={() => onDone(task)}>完成</Button>}
      </Space>
    </div>
  );
}

export default function WeeklyTaskPanel({
  tasks,
  loading,
  onOpen,
  onDone,
}: {
  tasks?: EmployeeTaskDto[];
  loading: boolean;
  onOpen: (task: EmployeeTaskDto) => void;
  onDone: (task: EmployeeTaskDto) => void;
}) {
  const [tab, setTab] = useState('all');
  const list = Array.isArray(tasks) ? tasks : [];
  const completedDim: CompletedDimLevel = tab === 'done' ? 'soft' : 'normal';
  const filtered = useMemo(() => {
    const filteredTasks = list.filter((task) => {
      const status = getEmployeeTaskStatus(task);
      if (tab === 'pending') return isEmployeeTaskPending(status) && !isActiveTaskOverdue(task);
      if (tab === 'done') return status === 'DONE';
      if (tab === 'overdue') return isActiveTaskOverdue(task);
      return true;
    });
    return sortEmployeeTasks(filteredTasks);
  }, [list, tab]);

  return (
    <Card
      title={(
        <Space direction="vertical" size={0}>
          <span>我的待办</span>
          <Text type="secondary" style={{ fontSize: 12 }}>聚合待处理、已逾期和本周需要推进的任务</Text>
        </Space>
      )}
      loading={loading}
      style={{ borderRadius: 16, border: '1px solid #e8eef7', height: '100%' }}
      styles={{ body: { padding: 12 } }}
    >
      <Tabs
        size="small"
        activeKey={tab}
        onChange={setTab}
        style={{ marginBottom: 8 }}
        items={[
          { key: 'all', label: '全部' },
          { key: 'pending', label: '待完成' },
          { key: 'done', label: '已完成' },
          { key: 'overdue', label: '已逾期' },
        ]}
      />
      {filtered.length === 0 ? (
        <div style={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待办任务" />
        </div>
      ) : (
        <div style={{ height: 360, overflowY: 'auto', paddingRight: 4 }}>
          <List
            dataSource={filtered}
            renderItem={(task) => (
              <List.Item style={{ padding: '4px 0', borderBlockEnd: 'none', width: '100%' }}>
                <TaskRow task={task} completedDim={completedDim} onOpen={onOpen} onDone={onDone} />
              </List.Item>
            )}
          />
        </div>
      )}
    </Card>
  );
}
