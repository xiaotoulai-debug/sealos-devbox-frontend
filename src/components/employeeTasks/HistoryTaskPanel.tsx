import { Card, Empty, List, Space, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import type { EmployeeTaskDto } from './types';
import { getEmployeeTaskDisplayStatusLabel, getEmployeeTaskStatus, sortEmployeeTasks, TASK_TYPE_LABELS } from './types';
import EmployeeTaskPlatformTag from './EmployeeTaskPlatformTag';
import TaskDeadlineText from './TaskDeadlineText';
import {
  getTaskRowStyle,
  getTaskTagsWrapStyle,
  getTaskTitleStyle,
  isTaskOverdueActive,
} from './taskVisualStyles';

const { Text } = Typography;

type HistoryTabKey = 'lastWeek' | 'thisWeek' | 'all';

function getThisWeekRange() {
  const today = dayjs();
  const start = today.subtract((today.day() + 6) % 7, 'day').startOf('day');
  const end = start.add(6, 'day').endOf('day');
  return { start, end };
}

function getLastWeekRange() {
  const { start: thisWeekStart } = getThisWeekRange();
  const start = thisWeekStart.subtract(7, 'day').startOf('day');
  const end = start.add(6, 'day').endOf('day');
  return { start, end };
}

function getTaskDate(task: EmployeeTaskDto): string | null {
  return task.dueDate || task.createdAt || null;
}

function isInRange(dateValue: string | null, start: dayjs.Dayjs, end: dayjs.Dayjs): boolean {
  if (!dateValue) return false;
  const date = dayjs(dateValue);
  if (!date.isValid()) return false;
  return !date.isBefore(start, 'day') && !date.isAfter(end, 'day');
}

function getEmptyDescription(tab: HistoryTabKey): string {
  if (tab === 'lastWeek') return '暂无上周任务';
  if (tab === 'thisWeek') return '暂无本周任务';
  return '暂无历史任务';
}

function taskStatus(task: EmployeeTaskDto) {
  if (isTaskOverdueActive(task)) return <Tag color="red">已逾期</Tag>;
  const status = getEmployeeTaskStatus(task);
  const color = status === 'DONE' ? 'green' : status === 'CANCELLED' ? 'default' : 'gold';
  return <Tag color={color}>{getEmployeeTaskDisplayStatusLabel(task)}</Tag>;
}

export default function HistoryTaskPanel({
  tasks,
  currentUserId,
  loading,
  onOpen,
}: {
  tasks?: EmployeeTaskDto[];
  currentUserId?: number;
  loading: boolean;
  onOpen: (task: EmployeeTaskDto) => void;
}) {
  const [tab, setTab] = useState<HistoryTabKey>('thisWeek');
  const list = Array.isArray(tasks) ? tasks : [];
  const ownHistoryList = currentUserId
    ? list.filter((task) => task.assigneeId === currentUserId)
    : list;

  const filtered = useMemo(() => {
    const visibleTasks = ownHistoryList.filter((task) => getEmployeeTaskStatus(task) !== 'CANCELLED');
    const { start: lastWeekStart, end: lastWeekEnd } = getLastWeekRange();
    const { start: thisWeekStart, end: thisWeekEnd } = getThisWeekRange();

    let result = visibleTasks;
    if (tab === 'lastWeek') {
      result = visibleTasks.filter((task) => isInRange(getTaskDate(task), lastWeekStart, lastWeekEnd));
    } else if (tab === 'thisWeek') {
      result = visibleTasks.filter((task) => isInRange(getTaskDate(task), thisWeekStart, thisWeekEnd));
    }

    return sortEmployeeTasks(result);
  }, [ownHistoryList, tab]);

  return (
    <Card title="历史任务" loading={loading} style={{ borderRadius: 16, border: '1px solid #e8eef7', height: '100%' }} styles={{ body: { padding: 12 } }}>
      <Tabs
        size="small"
        activeKey={tab}
        onChange={(key) => setTab(key as HistoryTabKey)}
        items={[
          { key: 'thisWeek', label: '本周任务' },
          { key: 'lastWeek', label: '上周任务' },
          { key: 'all', label: '全部任务' },
        ]}
      />
      {filtered.length === 0 ? (
        <div style={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={getEmptyDescription(tab)} />
        </div>
      ) : (
        <div style={{ height: 360, overflowY: 'auto', paddingRight: 4 }}>
          <List
            size="small"
            dataSource={filtered}
            renderItem={(task) => {
              const status = getEmployeeTaskStatus(task);
              const titleStyle = getTaskTitleStyle(task);
              const completedDim = status === 'DONE' ? 'soft' : 'normal';
              return (
                <List.Item onClick={() => onOpen(task)} style={{ cursor: 'pointer', padding: '6px 0', borderBlockEnd: 'none' }}>
                  <div
                    style={{
                      width: '100%',
                      minHeight: 56,
                      padding: '8px 10px',
                      borderRadius: 10,
                      ...getTaskRowStyle(task, { completedDim }),
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                        <div style={getTaskTagsWrapStyle(task)}>
                          <EmployeeTaskPlatformTag task={task} />
                        </div>
                        <Text strong={Number(titleStyle.fontWeight) >= 600} ellipsis style={{ flex: 1, minWidth: 0, ...titleStyle }}>
                          {task.title || '未命名任务'}
                        </Text>
                      </div>
                      <div style={getTaskTagsWrapStyle(task)}>{taskStatus(task)}</div>
                    </div>
                    <TaskDeadlineText task={task} />
                    <div style={getTaskTagsWrapStyle(task)}>
                      <Space size={6} wrap style={{ marginTop: 5 }}>
                        <Tag color="blue">{task.taskTypeName || TASK_TYPE_LABELS[task.taskType]}</Tag>
                      </Space>
                    </div>
                  </div>
                </List.Item>
              );
            }}
          />
        </div>
      )}
    </Card>
  );
}
