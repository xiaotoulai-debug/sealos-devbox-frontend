import { Card, Empty, List, Space, Tag, Typography } from 'antd';
import { ArrowUpOutlined } from '@ant-design/icons';
import type { EmployeeTaskDto } from './types';
import { getEmployeeTaskDisplayStatusLabel, getEmployeeTaskPriority, getEmployeeTaskStatus, sortEmployeeTasks, TASK_TYPE_LABELS } from './types';
import EmployeeTaskPlatformTag from './EmployeeTaskPlatformTag';
import TaskDeadlineText from './TaskDeadlineText';
import {
  getTaskRowStyle,
  getTaskTagsWrapStyle,
  getTaskTitleStyle,
  isTaskOverdueActive,
} from './taskVisualStyles';

const { Text } = Typography;

function MiniTaskList({
  rows,
  onOpen,
}: {
  rows?: EmployeeTaskDto[];
  onOpen: (task: EmployeeTaskDto) => void;
}) {
  const list = sortEmployeeTasks(Array.isArray(rows) ? rows : []);
  if (list.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无协同任务" />;
  return (
    <div style={{ maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
      <List
        size="small"
        dataSource={list}
        renderItem={(task) => {
          const status = getEmployeeTaskStatus(task);
          const priority = getEmployeeTaskPriority(task);
          const activeOverdue = isTaskOverdueActive(task);
          const titleStyle = getTaskTitleStyle(task);
          return (
            <List.Item onClick={() => onOpen(task)} style={{ cursor: 'pointer', padding: '6px 0', borderBlockEnd: 'none' }}>
              <div
                style={{
                  width: '100%',
                  minHeight: 54,
                  padding: '8px 10px',
                  borderRadius: 10,
                  ...getTaskRowStyle(task),
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
                  <div style={getTaskTagsWrapStyle(task)}>
                    <Tag color={activeOverdue ? 'red' : status === 'DONE' ? 'green' : status === 'CANCELLED' ? 'default' : 'gold'} style={{ marginInlineEnd: 0 }}>
                      {activeOverdue ? '已逾期' : getEmployeeTaskDisplayStatusLabel(task)}
                    </Tag>
                  </div>
                </div>
                <TaskDeadlineText task={task} />
                <div style={getTaskTagsWrapStyle(task)}>
                  <Space size={6} wrap style={{ marginTop: 5 }}>
                    <Tag color="blue">{task.taskTypeName || TASK_TYPE_LABELS[task.taskType]}</Tag>
                    <Tag color={priority === 'HIGH' ? 'red' : priority === 'MEDIUM' ? 'orange' : 'green'}>
                      {task.priorityName || PRIORITY_LABELS[priority]}
                    </Tag>
                  </Space>
                </div>
              </div>
            </List.Item>
          );
        }}
      />
    </div>
  );
}

export default function TaskCollaborationPanel({
  tasks,
  createdTasks,
  loading,
  onOpen,
}: {
  tasks?: EmployeeTaskDto[];
  createdTasks?: EmployeeTaskDto[];
  loading: boolean;
  onOpen: (task: EmployeeTaskDto) => void;
}) {
  const rows = Array.isArray(tasks) ? tasks : Array.isArray(createdTasks) ? createdTasks : [];
  return (
    <Card
      title={<Space><ArrowUpOutlined style={{ color: '#16a34a' }} />任务协同</Space>}
      loading={loading}
      style={{ borderRadius: 16, border: '1px solid #e8eef7' }}
      styles={{ body: { padding: 16 } }}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
        我参与 / 我发起 / @我的协同任务
      </Text>
      <MiniTaskList rows={rows} onOpen={onOpen} />
    </Card>
  );
}
