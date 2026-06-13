import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState, type CSSProperties } from 'react';
import { Alert, Button, Card, DatePicker, message, Space, Spin, Typography } from 'antd';
import { PlusOutlined, ReloadOutlined, TeamOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { getStoredUser } from '../../lib/auth';
import { fetchEmployeeTaskDashboard, fetchEmployeeTaskWeeklySummary, getBackendMessage, updateEmployeeTaskStatus } from './api';
import TodayReminderPanel from '../dailyReminders/TodayReminderPanel';
import EmployeeTaskDetailDrawer from './EmployeeTaskDetailDrawer';
import EmployeeTaskFormModal from './EmployeeTaskFormModal';
import HistoryTaskPanel from './HistoryTaskPanel';
import TaskCollaborationPanel from './TaskCollaborationPanel';
import WeeklyTaskPanel from './WeeklyTaskPanel';
import WeeklySummaryPanel from './WeeklySummaryPanel';
import type { EmployeeTaskDashboardData, EmployeeTaskDto, EmployeeTaskStatus, WeeklySummaryData } from './types';
import { uniqueEmployeeTasks } from './types';

const { Text, Title } = Typography;

const taskCenterTwoColumnGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.25fr) minmax(420px, 0.75fr)',
  gap: 16,
  alignItems: 'stretch',
};

function mondayOf(date: Dayjs): Dayjs {
  return date.subtract((date.day() + 6) % 7, 'day');
}

function getMondayOfLastWeek(): string {
  return mondayOf(dayjs()).subtract(1, 'week').format('YYYY-MM-DD');
}

export interface EmployeeTaskCenterHandle {
  refreshAll: () => void;
  openCreateModal: () => void;
}

interface EmployeeTaskCenterProps {
  compactHeader?: boolean;
  weekValue?: Dayjs;
  onWeekChange?: (value: Dayjs) => void;
  onLoadingChange?: (loading: boolean) => void;
}

const EmployeeTaskCenter = forwardRef<EmployeeTaskCenterHandle, EmployeeTaskCenterProps>(function EmployeeTaskCenter(
  { compactHeader = false, weekValue: externalWeekValue, onWeekChange, onLoadingChange },
  ref,
) {
  const currentUser = useMemo(() => getStoredUser(), []);
  const [innerWeekValue, setInnerWeekValue] = useState<Dayjs>(mondayOf(dayjs()));
  const [data, setData] = useState<EmployeeTaskDashboardData | null>(null);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [weeklySummaryLoading, setWeeklySummaryLoading] = useState(false);
  const [error, setError] = useState('');
  const [weeklySummaryError, setWeeklySummaryError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const weekValue = externalWeekValue ?? innerWeekValue;
  const weekStart = useMemo(() => mondayOf(weekValue).format('YYYY-MM-DD'), [weekValue]);

  const handleWeekChange = (value: Dayjs) => {
    const next = mondayOf(value);
    if (onWeekChange) {
      onWeekChange(next);
    } else {
      setInnerWeekValue(next);
    }
  };

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await fetchEmployeeTaskDashboard(weekStart);
      setData(payload ?? {});
    } catch (err) {
      setData(null);
      setError(getBackendMessage(err, '加载员工任务中心失败'));
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  const loadWeeklySummary = useCallback(async () => {
    setWeeklySummaryLoading(true);
    setWeeklySummaryError('');
    try {
      const payload = await fetchEmployeeTaskWeeklySummary(getMondayOfLastWeek());
      setWeeklySummary(payload ?? {});
    } catch (err) {
      const msg = getBackendMessage(err, '加载上周汇总失败');
      setWeeklySummaryError(msg);
      message.error(msg);
    } finally {
      setWeeklySummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    loadWeeklySummary();
  }, [loadWeeklySummary]);

  const refreshAll = useCallback(() => {
    loadDashboard();
    loadWeeklySummary();
  }, [loadDashboard, loadWeeklySummary]);

  useImperativeHandle(ref, () => ({
    refreshAll,
    openCreateModal: () => setFormOpen(true),
  }), [refreshAll]);

  useEffect(() => {
    onLoadingChange?.(loading || weeklySummaryLoading);
  }, [loading, onLoadingChange, weeklySummaryLoading]);

  const openDetail = (task: EmployeeTaskDto) => {
    setDetailTaskId(task.id);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetailTaskId(null);
  };

  const updateStatus = async (task: EmployeeTaskDto, status: EmployeeTaskStatus) => {
    if (task.status === 'DONE' || task.status === 'CANCELLED') return;
    if (currentUser?.id !== task.assigneeId && status !== 'CANCELLED') {
      message.warning('只有任务指派人可以处理或完成任务');
      return;
    }
    try {
      await updateEmployeeTaskStatus(task.id, { status });
      message.success('任务状态已更新');
      refreshAll();
    } catch (err) {
      message.error(getBackendMessage(err, '更新任务状态失败'));
    }
  };

  const handleFormSuccess = () => {
    setFormOpen(false);
    refreshAll();
  };

  const weeklyTasks = Array.isArray(data?.weeklyTasks) ? data.weeklyTasks : [];
  const historyTasksRaw = Array.isArray(data?.historyTasks) ? data.historyTasks : [];
  const historyTasks = currentUser?.id
    ? historyTasksRaw.filter((task) => task.assigneeId === currentUser.id)
    : historyTasksRaw;

  const collaborationTasksRaw = Array.isArray(data?.collaborationTasks)
    ? data.collaborationTasks
    : Array.isArray(data?.createdTasks)
      ? data.createdTasks
      : [];
  const historyTaskIds = new Set(historyTasks.map((task) => task.id));
  const collaborationTasks = uniqueEmployeeTasks(collaborationTasksRaw).filter(
    (task) => !historyTaskIds.has(task.id),
  );

  return (
    <div style={{ minHeight: '100%', borderRadius: 18, background: 'linear-gradient(180deg, #f5f7fb 0%, #f8fafc 100%)' }}>
      {!compactHeader && (
        <Card
          style={{ borderRadius: 18, marginBottom: 16, border: '1px solid #e8eef7', boxShadow: '0 12px 28px rgba(15, 23, 42, 0.06)' }}
          styles={{ body: { padding: 20 } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <Space size={10} align="center">
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: '#dbeafe',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
              }}>
                <TeamOutlined />
              </div>
              <div>
                <Title level={2} style={{ margin: 0, fontSize: 26, fontWeight: 750, color: '#0f172a' }}>任务中心</Title>
                <Text style={{ color: '#3b82f6', fontSize: 13 }}>你好，{currentUser?.name || currentUser?.username || '当前用户'}，聚焦重点，高效执行</Text>
              </div>
            </Space>
            <Space wrap>
              <DatePicker
                picker="week"
                allowClear={false}
                value={weekValue}
                format={(value) => `本周：${mondayOf(value).format('MM-DD')} 至 ${mondayOf(value).add(6, 'day').format('MM-DD')}`}
                style={{ width: 190 }}
                onChange={(value) => value && handleWeekChange(value)}
              />
              <Button icon={<ReloadOutlined />} loading={loading || weeklySummaryLoading} onClick={refreshAll}>刷新</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>新建任务</Button>
            </Space>
          </div>
        </Card>
      )}

      {error && (
        <Alert
          type={error.includes('403') || error.includes('权限') ? 'warning' : 'error'}
          showIcon
          message={error.includes('403') ? '暂无查看员工任务中心权限' : error}
          style={{ borderRadius: 12, marginBottom: 16 }}
        />
      )}

      <Spin spinning={loading}>
        <TodayReminderPanel />
        <div style={{ ...taskCenterTwoColumnGridStyle, marginBottom: 16 }}>
          <WeeklyTaskPanel
            tasks={weeklyTasks}
            loading={loading}
            onOpen={openDetail}
            onDone={(task) => updateStatus(task, 'DONE')}
          />
          <HistoryTaskPanel
            tasks={historyTasks}
            currentUserId={currentUser?.id}
            loading={loading}
            onOpen={openDetail}
          />
        </div>
        <div style={taskCenterTwoColumnGridStyle}>
          <WeeklySummaryPanel
            data={weeklySummary}
            loading={weeklySummaryLoading}
            error={weeklySummaryError}
            readOnlyAiGenerate
          />
          <TaskCollaborationPanel tasks={collaborationTasks} loading={loading} onOpen={openDetail} />
        </div>
      </Spin>

      <EmployeeTaskFormModal open={formOpen} onCancel={() => setFormOpen(false)} onSuccess={handleFormSuccess} />
      <EmployeeTaskDetailDrawer
        open={detailOpen}
        taskId={detailTaskId}
        currentUserId={currentUser?.id}
        onClose={closeDetail}
        onChanged={refreshAll}
      />
    </div>
  );
});

export { mondayOf, getMondayOfLastWeek };
export default EmployeeTaskCenter;
