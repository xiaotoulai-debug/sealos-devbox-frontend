import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  message,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  PieChartOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import axios from 'axios';
import { getStoredUser, hasPermission } from '../lib/auth';
import {
  fetchAdminEmployeeTaskDashboard,
  fetchAdminEmployeeTasks,
  fetchAdminEmployeeTaskUsersSummary,
  fetchAdminWeeklySummaries,
  fetchAssignableUsers,
  generateAdminWeeklySummaries,
  getBackendMessage,
} from '../components/employeeTasks/api';
import AdminLastWeekSummaryPanel from '../components/employeeTasks/AdminLastWeekSummaryPanel';
import AdminWeeklySummaryDetailModal from '../components/employeeTasks/AdminWeeklySummaryDetailModal';
import EmployeeTaskDetailDrawer from '../components/employeeTasks/EmployeeTaskDetailDrawer';
import EmployeeTaskFormModal from '../components/employeeTasks/EmployeeTaskFormModal';
import EmployeeTaskPlatformTag from '../components/employeeTasks/EmployeeTaskPlatformTag';
import TaskDeadlineText from '../components/employeeTasks/TaskDeadlineText';
import {
  getTaskTagsWrapStyle,
  getTaskTitleStyle,
  isTaskCompleted,
  isTaskOverdueActive,
} from '../components/employeeTasks/taskVisualStyles';
import { getMondayOfLastWeek, mondayOf } from '../components/employeeTasks/EmployeeTaskCenter';
import type {
  AdminEmployeeTaskStatusFilter,
  AdminEmployeeTaskSummaryCards,
  AdminEmployeeTaskUserSummary,
  AdminWeeklySummaryDto,
  AssignableUser,
  EmployeeTaskDto,
} from '../components/employeeTasks/types';
import {
  getEmployeeTaskDisplayStatusLabel,
  getEmployeeTaskStatus,
  isEmployeeTaskPending,
  PRIORITY_LABELS,
  TASK_TYPE_LABELS,
} from '../components/employeeTasks/types';

const { Text, Title } = Typography;

const CARD_STYLE: CSSProperties = {
  border: '1px solid #eef2f7',
  borderRadius: 14,
  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)',
};

const DETAIL_STATUS_TAB_ITEMS: { key: AdminEmployeeTaskStatusFilter; label: string }[] = [
  { key: 'ALL', label: '全部' },
  { key: 'PENDING', label: '待完成' },
  { key: 'DONE', label: '已完成' },
  { key: 'OVERDUE', label: '已逾期' },
];

type AccessErrorType = 'forbidden' | 'notfound' | null;

function getMondayOfThisWeek(): string {
  return mondayOf(dayjs()).format('YYYY-MM-DD');
}

function normalizeCompletionRatePercent(rate?: number | null): number {
  const raw = Number(rate ?? 0);
  if (!Number.isFinite(raw)) return 0;
  if (raw > 0 && raw <= 1) return raw * 100;
  return raw;
}

function formatCompletionRate(rate?: number | null): string {
  return `${normalizeCompletionRatePercent(rate).toFixed(1)}%`;
}

function safeNumber(value?: number | null): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function resolveAccessError(err: unknown): { type: AccessErrorType; message: string } {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    if (status === 403) {
      return { type: 'forbidden', message: '你没有权限访问管理员工任务' };
    }
    if (status === 404) {
      return { type: 'notfound', message: '管理员工任务接口尚未开放，请联系后端配置接口' };
    }
  }
  return { type: null, message: getBackendMessage(err, '加载管理员工任务失败') };
}

function safeTimeAsc(value?: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = dayjs(value).valueOf();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function safeTimeDesc(value?: string | null): number {
  if (!value) return 0;
  const time = dayjs(value).valueOf();
  return Number.isFinite(time) ? time : 0;
}

function isOverdueTask(task: EmployeeTaskDto): boolean {
  const status = getEmployeeTaskStatus(task);
  if (status === 'DONE' || status === 'CANCELLED') return false;
  if (task.isOverdue === true) return true;
  if (!task.dueDate) return false;
  const due = dayjs(task.dueDate);
  return due.isValid() && due.isBefore(dayjs());
}

function isUnfinishedPendingTask(task: EmployeeTaskDto): boolean {
  const status = getEmployeeTaskStatus(task);
  return isEmployeeTaskPending(status) && !isOverdueTask(task);
}

function isDoneTask(task: EmployeeTaskDto): boolean {
  return getEmployeeTaskStatus(task) === 'DONE';
}

function isCancelledTask(task: EmployeeTaskDto): boolean {
  return getEmployeeTaskStatus(task) === 'CANCELLED';
}

function getTaskSortWeight(task: EmployeeTaskDto): number {
  if (isOverdueTask(task)) return 1;
  if (isUnfinishedPendingTask(task)) return 2;
  if (isDoneTask(task)) return 4;
  if (isCancelledTask(task)) return 5;
  return 3;
}

function sortAdminTaskDetails(tasks?: EmployeeTaskDto[]): EmployeeTaskDto[] {
  const list = Array.isArray(tasks) ? tasks : [];
  return [...list].sort((a, b) => {
    const aw = getTaskSortWeight(a);
    const bw = getTaskSortWeight(b);
    if (aw !== bw) return aw - bw;

    if (aw === 1 || aw === 2 || aw === 3) {
      return safeTimeAsc(a.dueDate) - safeTimeAsc(b.dueDate);
    }

    if (aw === 4) {
      return safeTimeDesc(b.completedAt || b.updatedAt || b.dueDate)
        - safeTimeDesc(a.completedAt || a.updatedAt || a.dueDate);
    }

    return safeTimeDesc(b.updatedAt || b.createdAt) - safeTimeDesc(a.updatedAt || a.createdAt);
  });
}

function priorityTag(priority: EmployeeTaskDto['priority']) {
  const color = priority === 'HIGH' ? 'red' : priority === 'MEDIUM' ? 'gold' : 'blue';
  return <Tag color={color}>{PRIORITY_LABELS[priority] ?? priority}</Tag>;
}

function statusTag(task: EmployeeTaskDto) {
  const status = getEmployeeTaskStatus(task);
  const completed = status === 'DONE';
  if (isTaskOverdueActive(task)) {
    return <Tag color="red">已逾期</Tag>;
  }
  const color = status === 'DONE'
    ? 'success'
    : status === 'CANCELLED'
      ? 'default'
      : 'gold';
  return (
    <Tag color={color} style={completed ? { opacity: 0.85 } : undefined}>
      {getEmployeeTaskDisplayStatusLabel(task)}
    </Tag>
  );
}

function dimmedCellText(task: EmployeeTaskDto, content: ReactNode) {
  const style = getTaskTitleStyle(task);
  return <span style={style}>{content}</span>;
}

function getAdminTaskTableRowProps(task: EmployeeTaskDto): { style?: CSSProperties } {
  const completed = isTaskCompleted(task);
  const cancelled = isCancelledTask(task);
  const overdue = !completed && !cancelled && isOverdueTask(task);
  if (completed || cancelled) {
    return {
      style: {
        background: '#FAFAFA',
        color: 'rgba(0, 0, 0, 0.38)',
      },
    };
  }
  if (overdue) {
    return {
      style: {
        background: '#FFF7F7',
      },
    };
  }
  return {};
}

function CompletionRateCell({ rate }: { rate?: number | null }) {
  const percent = Math.min(100, Math.max(0, normalizeCompletionRatePercent(rate)));
  const strokeColor = percent >= 80 ? '#52c41a' : percent >= 50 ? '#1677ff' : '#faad14';
  return (
    <div style={{ minWidth: 120 }}>
      <Progress
        percent={Number(percent.toFixed(1))}
        size="small"
        strokeColor={strokeColor}
        format={() => `${percent.toFixed(1)}%`}
      />
    </div>
  );
}

function SummaryMetricCard({
  title,
  value,
  icon,
  iconBg,
  iconColor,
  valueColor,
}: {
  title: string;
  value: ReactNode;
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  valueColor?: string;
}) {
  return (
    <Card
      size="small"
      styles={{ body: { padding: '14px 16px' } }}
      style={CARD_STYLE}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            background: iconBg,
            color: iconColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{title}</Text>
          <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, color: valueColor ?? '#0f172a' }}>
            {value}
          </div>
        </div>
      </div>
    </Card>
  );
}

function AdminSummaryCards({ cards }: { cards: AdminEmployeeTaskSummaryCards }) {
  return (
    <Row gutter={[12, 12]}>
      <Col xs={12} sm={8} md={4}>
        <SummaryMetricCard
          title="员工总数"
          value={safeNumber(cards.employeeCount)}
          icon={<TeamOutlined />}
          iconBg="#eff6ff"
          iconColor="#2563eb"
        />
      </Col>
      <Col xs={12} sm={8} md={4}>
        <SummaryMetricCard
          title="本周任务总数"
          value={safeNumber(cards.totalTaskCount)}
          icon={<UnorderedListOutlined />}
          iconBg="#f3e8ff"
          iconColor="#7c3aed"
        />
      </Col>
      <Col xs={12} sm={8} md={4}>
        <SummaryMetricCard
          title="已完成数"
          value={safeNumber(cards.doneCount)}
          icon={<CheckCircleOutlined />}
          iconBg="#ecfdf5"
          iconColor="#16a34a"
          valueColor="#16a34a"
        />
      </Col>
      <Col xs={12} sm={8} md={4}>
        <SummaryMetricCard
          title="待完成数"
          value={safeNumber(cards.pendingCount)}
          icon={<ClockCircleOutlined />}
          iconBg="#fff7ed"
          iconColor="#ea580c"
          valueColor="#ea580c"
        />
      </Col>
      <Col xs={12} sm={8} md={4}>
        <SummaryMetricCard
          title="逾期数"
          value={safeNumber(cards.overdueCount)}
          icon={<ExclamationCircleOutlined />}
          iconBg="#fef2f2"
          iconColor="#dc2626"
          valueColor="#dc2626"
        />
      </Col>
      <Col xs={12} sm={8} md={4}>
        <SummaryMetricCard
          title="完成率"
          value={formatCompletionRate(cards.completionRate)}
          icon={<PieChartOutlined />}
          iconBg="#e0e7ff"
          iconColor="#3730a3"
          valueColor="#1e3a8a"
        />
      </Col>
    </Row>
  );
}

function rankBadgeStyle(rank: number): CSSProperties {
  if (rank === 1) return { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' };
  if (rank === 2) return { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' };
  if (rank === 3) return { background: '#ffedd5', color: '#c2410c', border: '1px solid #fed7aa' };
  return { background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' };
}

function EmployeeRankingTop5({ rows }: { rows: AdminEmployeeTaskUserSummary[] }) {
  const topRows = useMemo(() => {
    const list = Array.isArray(rows) ? rows : [];
    return [...list]
      .sort((a, b) => {
        const rateDiff = normalizeCompletionRatePercent(b.completionRate) - normalizeCompletionRatePercent(a.completionRate);
        if (rateDiff !== 0) return rateDiff;
        return safeNumber(b.doneCount) - safeNumber(a.doneCount);
      })
      .slice(0, 5);
  }, [rows]);

  if (topRows.length === 0) {
    return <Empty description="暂无排行数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {topRows.map((row, index) => {
        const rank = index + 1;
        const percent = normalizeCompletionRatePercent(row.completionRate);
        return (
          <div
            key={row.assigneeId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              borderRadius: 10,
              background: '#f8fafc',
              border: '1px solid #eef2f7',
            }}
          >
            <span
              style={{
                width: 36,
                height: 28,
                borderRadius: 8,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
                ...rankBadgeStyle(rank),
              }}
            >
              #{rank}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text strong ellipsis>{row.name || row.username || '-'}</Text>
                <Text style={{ color: '#1677ff', fontWeight: 600, flexShrink: 0 }}>
                  {formatCompletionRate(row.completionRate)}
                </Text>
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {row.roleName || '未分配角色'}
              </Text>
              <Progress
                percent={Number(Math.min(100, Math.max(0, percent)).toFixed(1))}
                size="small"
                showInfo={false}
                strokeColor={percent >= 80 ? '#52c41a' : '#1677ff'}
                style={{ marginTop: 4, marginBottom: 0 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmployeeTaskOverviewTable({
  rows,
  loading,
  canManageTasks,
  onViewTasks,
  onAssignTask,
}: {
  rows: AdminEmployeeTaskUserSummary[];
  loading: boolean;
  canManageTasks: boolean;
  onViewTasks: (assigneeId: number) => void;
  onAssignTask: (assigneeId: number) => void;
}) {
  const columns: ColumnsType<AdminEmployeeTaskUserSummary> = [
    {
      title: '员工',
      key: 'name',
      width: 120,
      ellipsis: true,
      render: (_, row) => row.name || row.username || '-',
    },
    {
      title: '本周任务数',
      dataIndex: 'totalTaskCount',
      key: 'totalTaskCount',
      width: 96,
      align: 'right',
      render: (value?: number | null) => safeNumber(value),
    },
    {
      title: '已完成',
      dataIndex: 'doneCount',
      key: 'doneCount',
      width: 72,
      align: 'right',
      render: (value?: number | null) => (
        <Text style={{ color: '#16a34a' }}>{safeNumber(value)}</Text>
      ),
    },
    {
      title: '待完成',
      dataIndex: 'pendingCount',
      key: 'pendingCount',
      width: 72,
      align: 'right',
      render: (value?: number | null) => (
        <Text style={{ color: '#ea580c' }}>{safeNumber(value)}</Text>
      ),
    },
    {
      title: '逾期',
      dataIndex: 'overdueCount',
      key: 'overdueCount',
      width: 56,
      align: 'right',
      render: (value?: number | null) => {
        const num = safeNumber(value);
        return <Text type={num > 0 ? 'danger' : undefined}>{num}</Text>;
      },
    },
    {
      title: '完成率',
      dataIndex: 'completionRate',
      key: 'completionRate',
      width: 150,
      render: (value?: number | null) => <CompletionRateCell rate={value} />,
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 150,
      render: (_, row) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => onViewTasks(row.assigneeId)}>
            查看任务
          </Button>
          {canManageTasks ? (
            <Button type="link" size="small" onClick={() => onAssignTask(row.assigneeId)}>
              挂任务
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <Table<AdminEmployeeTaskUserSummary>
      rowKey="assigneeId"
      size="small"
      columns={columns}
      dataSource={Array.isArray(rows) ? rows : []}
      loading={loading}
      pagination={false}
      locale={{ emptyText: <Empty description="暂无员工任务汇总" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      scroll={{ x: 'max-content', y: 280 }}
    />
  );
}

function AdminTaskDetailTable({
  tasks,
  loading,
  total,
  page,
  pageSize,
  embedded,
  onPageChange,
  onOpenDetail,
}: {
  tasks: EmployeeTaskDto[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  embedded: boolean;
  onPageChange: (page: number, pageSize: number) => void;
  onOpenDetail: (taskId: number) => void;
}) {
  const sortedTasks = useMemo(
    () => sortAdminTaskDetails(tasks),
    [tasks],
  );

  const columns: ColumnsType<EmployeeTaskDto> = [
    {
      title: '任务标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (value: string, task) => dimmedCellText(task, value || '-'),
    },
    {
      title: '员工',
      dataIndex: 'assigneeName',
      key: 'assigneeName',
      width: 88,
      ellipsis: true,
      render: (value: string | null | undefined, task) => dimmedCellText(task, value || '-'),
    },
    {
      title: '平台',
      key: 'platform',
      width: 100,
      render: (_, task) => (
        <span style={getTaskTagsWrapStyle(task)}>
          <EmployeeTaskPlatformTag task={task} />
        </span>
      ),
    },
    {
      title: '任务类型',
      dataIndex: 'taskType',
      key: 'taskType',
      width: 100,
      render: (value: EmployeeTaskDto['taskType'], task) => (
        dimmedCellText(task, TASK_TYPE_LABELS[value] ?? value)
      ),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 72,
      render: (value: EmployeeTaskDto['priority'], task) => (
        <span style={getTaskTagsWrapStyle(task)}>{priorityTag(value)}</span>
      ),
    },
    {
      title: '截止日期',
      key: 'dueDate',
      width: 128,
      render: (_, task) => <TaskDeadlineText task={task} />,
    },
    {
      title: '状态',
      key: 'status',
      width: 80,
      render: (_, task) => statusTag(task),
    },
    {
      title: '是否逾期',
      key: 'isOverdue',
      width: 72,
      render: (_, task) => (
        task.isOverdue && task.status !== 'DONE' && task.status !== 'CANCELLED'
          ? <Tag color="red">是</Tag>
          : dimmedCellText(task, <Tag>否</Tag>)
      ),
    },
    {
      title: '创建人',
      dataIndex: 'creatorName',
      key: 'creatorName',
      width: 88,
      ellipsis: true,
      render: (value: string | null | undefined, task) => dimmedCellText(task, value || '-'),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 64,
      render: (_, task) => (
        <Button type="link" size="small" onClick={() => onOpenDetail(task.id)}>
          详情
        </Button>
      ),
    },
  ];

  return (
    <Table<EmployeeTaskDto>
      rowKey="id"
      size="small"
      columns={columns}
      dataSource={sortedTasks}
      loading={loading}
      locale={{ emptyText: <Empty description="暂无任务明细" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      onRow={(task) => getAdminTaskTableRowProps(task)}
      scroll={{ x: 'max-content', y: embedded ? 'calc(100vh - 720px)' : 'calc(100vh - 660px)' }}
      pagination={{
        current: page,
        pageSize,
        total,
        showSizeChanger: true,
        showTotal: (count) => `共 ${count} 条`,
        onChange: onPageChange,
      }}
    />
  );
}

function AdminTaskFilterToolbar({
  assigneeOptions,
  detailAssigneeId,
  weekValue,
  statusFilter,
  loading,
  canManageTasks,
  onAssigneeChange,
  onWeekChange,
  onStatusChange,
  onRefresh,
  onCreateTask,
}: {
  assigneeOptions: { value: number; label: string }[];
  detailAssigneeId?: number;
  weekValue: Dayjs;
  statusFilter: AdminEmployeeTaskStatusFilter;
  loading: boolean;
  canManageTasks: boolean;
  onAssigneeChange: (value?: number) => void;
  onWeekChange: (value: Dayjs | null) => void;
  onStatusChange: (value: AdminEmployeeTaskStatusFilter) => void;
  onRefresh: () => void;
  onCreateTask: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        flexWrap: 'wrap',
        padding: '10px 14px',
        borderBottom: '1px solid #eef2f7',
      }}
    >
      <Space wrap size={[8, 8]} align="center">
        <Select
          allowClear
          showSearch
          placeholder="全部员工"
          style={{ width: 132 }}
          value={detailAssigneeId}
          options={assigneeOptions}
          optionFilterProp="label"
          onChange={onAssigneeChange}
        />
        <DatePicker
          picker="week"
          value={weekValue}
          onChange={onWeekChange}
          allowClear={false}
          style={{ width: 160 }}
          format={(value) => `${mondayOf(value).format('MM-DD')} 至 ${mondayOf(value).add(6, 'day').format('MM-DD')}`}
        />
        <Tabs
          size="small"
          activeKey={statusFilter}
          onChange={(key) => onStatusChange(key as AdminEmployeeTaskStatusFilter)}
          style={{ marginBottom: 0 }}
          items={DETAIL_STATUS_TAB_ITEMS.map((item) => ({
            key: item.key,
            label: item.label,
          }))}
        />
      </Space>
      <Space wrap size={8}>
        <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading}>
          刷新
        </Button>
        {canManageTasks ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreateTask}>
            新建任务
          </Button>
        ) : null}
      </Space>
    </div>
  );
}

export default function AdminEmployeeTaskManagement({ embedded = false }: { embedded?: boolean }) {
  const currentUser = useMemo(() => getStoredUser(), []);
  const canManageCompanyTasks = hasPermission('ACTION_DASHBOARD_COMPANY_TASK_MANAGE');
  const canGenerateWeeklyAi = hasPermission('ACTION_DASHBOARD_COMPANY_WEEKLY_AI_GENERATE');
  const taskTableRef = useRef<HTMLDivElement>(null);

  const overviewWeekStart = useMemo(() => getMondayOfThisWeek(), []);

  const [detailWeekValue, setDetailWeekValue] = useState<Dayjs>(() => mondayOf(dayjs()));
  const [detailAssigneeId, setDetailAssigneeId] = useState<number | undefined>();
  const [detailStatus, setDetailStatus] = useState<AdminEmployeeTaskStatusFilter>('ALL');

  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [summaryCards, setSummaryCards] = useState<AdminEmployeeTaskSummaryCards | null>(null);
  const [usersSummary, setUsersSummary] = useState<AdminEmployeeTaskUserSummary[]>([]);
  const [taskList, setTaskList] = useState<EmployeeTaskDto[]>([]);
  const [taskTotal, setTaskTotal] = useState(0);
  const [taskPage, setTaskPage] = useState(1);
  const [taskPageSize, setTaskPageSize] = useState(15);

  const [overviewLoading, setOverviewLoading] = useState(false);
  const [taskLoading, setTaskLoading] = useState(false);
  const [accessError, setAccessError] = useState<AccessErrorType>(null);
  const [pageError, setPageError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [formInitialAssigneeId, setFormInitialAssigneeId] = useState<number | undefined>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<number | null>(null);

  const [weeklySummaries, setWeeklySummaries] = useState<AdminWeeklySummaryDto[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyLoadError, setWeeklyLoadError] = useState<string | null>(null);
  const [weeklyGenerating, setWeeklyGenerating] = useState(false);
  const [weeklyDetailOpen, setWeeklyDetailOpen] = useState(false);
  const [weeklyDetailItem, setWeeklyDetailItem] = useState<AdminWeeklySummaryDto | null>(null);

  const lastWeekStart = useMemo(() => getMondayOfLastWeek(), []);

  const detailWeekStart = useMemo(
    () => mondayOf(detailWeekValue).format('YYYY-MM-DD'),
    [detailWeekValue],
  );

  const weeklyWeekLabel = useMemo(() => {
    const start = dayjs(lastWeekStart);
    if (!start.isValid()) return null;
    return `周期：${start.format('MM-DD')} 至 ${start.add(6, 'day').format('MM-DD')}`;
  }, [lastWeekStart]);

  const loadAssignableUsers = useCallback(async () => {
    try {
      const users = await fetchAssignableUsers();
      setAssignableUsers(Array.isArray(users) ? users : []);
    } catch {
      setAssignableUsers([]);
    }
  }, []);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setAccessError(null);
    setPageError('');
    try {
      const overviewQuery = { weekStart: overviewWeekStart };
      const [dashboard, users] = await Promise.all([
        fetchAdminEmployeeTaskDashboard(overviewQuery),
        fetchAdminEmployeeTaskUsersSummary(overviewQuery),
      ]);
      setSummaryCards(dashboard?.summaryCards ?? null);
      setUsersSummary(Array.isArray(users) ? users : []);
    } catch (err) {
      const resolved = resolveAccessError(err);
      if (resolved.type) {
        setAccessError(resolved.type);
        setPageError(resolved.message);
      } else {
        setPageError(getBackendMessage(err, '加载全局概览失败'));
      }
      setSummaryCards(null);
      setUsersSummary([]);
      throw err;
    } finally {
      setOverviewLoading(false);
    }
  }, [overviewWeekStart]);

  const loadTasks = useCallback(async () => {
    setTaskLoading(true);
    try {
      const tasks = await fetchAdminEmployeeTasks({
        weekStart: detailWeekStart,
        assigneeId: detailAssigneeId,
        status: detailStatus,
        page: taskPage,
        pageSize: taskPageSize,
      });
      setTaskList(Array.isArray(tasks?.list) ? tasks.list : []);
      setTaskTotal(safeNumber(tasks?.total));
    } catch (err) {
      setPageError(getBackendMessage(err, '加载任务明细失败'));
      setTaskList([]);
      setTaskTotal(0);
    } finally {
      setTaskLoading(false);
    }
  }, [detailAssigneeId, detailStatus, detailWeekStart, taskPage, taskPageSize]);

  const loadLastWeekSummaries = useCallback(async () => {
    setWeeklyLoading(true);
    setWeeklyLoadError(null);
    try {
      const list = await fetchAdminWeeklySummaries({
        weekStart: getMondayOfLastWeek(),
      });
      setWeeklySummaries(Array.isArray(list) ? list : []);
    } catch (err) {
      setWeeklySummaries([]);
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 404) {
          setWeeklyLoadError('上周汇总接口尚未开放');
          return;
        }
        if (status === 403) {
          setWeeklyLoadError('你没有权限查看上周汇总');
          return;
        }
      }
      setWeeklyLoadError(getBackendMessage(err, '加载上周汇总失败'));
    } finally {
      setWeeklyLoading(false);
    }
  }, []);

  const loadInitialPage = useCallback(async () => {
    try {
      await Promise.all([loadOverview(), loadLastWeekSummaries()]);
    } catch {
      // loadOverview 已处理 accessError
    }
  }, [loadOverview, loadLastWeekSummaries]);

  const refreshGlobalAndTasks = useCallback(async () => {
    try {
      await loadOverview();
    } catch {
      // accessError 已在 loadOverview 内处理
    }
    await loadTasks();
  }, [loadOverview, loadTasks]);

  useEffect(() => {
    loadAssignableUsers();
  }, [loadAssignableUsers]);

  useEffect(() => {
    loadInitialPage();
  }, [loadInitialPage]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleDetailWeekChange = (value: Dayjs | null) => {
    if (!value) return;
    setDetailWeekValue(mondayOf(value));
    setTaskPage(1);
  };

  const handleRefreshTasks = () => {
    loadTasks();
  };

  const handleRegenerateWeeklySummaries = async () => {
    setWeeklyGenerating(true);
    try {
      await generateAdminWeeklySummaries({
        weekStart: getMondayOfLastWeek(),
      });
      message.success('AI周报生成任务已提交，请稍后点击刷新查看');
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 404) {
          message.error('AI周报生成接口尚未开放');
          return;
        }
        if (status === 403) {
          message.error('无权限生成员工AI周报');
          return;
        }
      }
      message.error(getBackendMessage(err, '提交生成任务失败'));
    } finally {
      setWeeklyGenerating(false);
    }
  };

  const handleOpenWeeklyDetail = (item: AdminWeeklySummaryDto) => {
    setWeeklyDetailItem(item);
    setWeeklyDetailOpen(true);
  };

  const handleViewEmployeeTasks = (assigneeId: number) => {
    setDetailAssigneeId(assigneeId);
    setTaskPage(1);
    taskTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleAssignTask = (assigneeId: number) => {
    setFormInitialAssigneeId(assigneeId);
    setFormOpen(true);
  };

  const handleCreateTask = () => {
    setFormInitialAssigneeId(undefined);
    setFormOpen(true);
  };

  const handleFormSuccess = () => {
    setFormOpen(false);
    setFormInitialAssigneeId(undefined);
    refreshGlobalAndTasks();
  };

  const handleOpenDetail = (taskId: number) => {
    setDetailTaskId(taskId);
    setDetailOpen(true);
  };

  const assigneeOptions = useMemo(() => {
    const map = new Map<number, string>();
    assignableUsers.forEach((user) => map.set(user.id, user.name || user.username || String(user.id)));
    usersSummary.forEach((row) => map.set(row.assigneeId, row.name || row.username || String(row.assigneeId)));
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [assignableUsers, usersSummary]);

  const currentEmployeeLabel = detailAssigneeId
    ? assigneeOptions.find((item) => item.value === detailAssigneeId)?.label ?? String(detailAssigneeId)
    : null;

  const cards = summaryCards ?? {};

  if (accessError) {
    return (
      <div style={{ padding: embedded ? 0 : 24 }}>
        <Alert
          type={accessError === 'forbidden' ? 'warning' : 'error'}
          showIcon
          message={pageError}
          style={embedded ? { borderRadius: 12 } : undefined}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        height: embedded ? 'auto' : '100%',
        overflow: embedded ? 'visible' : 'hidden',
        display: 'flex',
        flexDirection: 'column',
        padding: embedded ? 0 : '16px 24px 24px',
        gap: 14,
      }}
    >
      {pageError ? (
        <Alert type="error" showIcon message={pageError} closable onClose={() => setPageError('')} />
      ) : null}

      <Spin spinning={overviewLoading}>
        <AdminSummaryCards cards={cards} />
      </Spin>

      <Row gutter={[14, 14]} align="stretch">
        <Col xs={24} lg={8}>
          <Card
            size="small"
            title={<Title level={5} style={{ margin: 0 }}>员工完成排行 Top 5</Title>}
            styles={{ body: { padding: '12px 14px' } }}
            style={{ ...CARD_STYLE, height: '100%' }}
          >
            <EmployeeRankingTop5 rows={usersSummary} />
          </Card>
        </Col>
        <Col xs={24} lg={16}>
          <Card
            size="small"
            title={<Title level={5} style={{ margin: 0 }}>员工任务总览</Title>}
            styles={{ body: { padding: 0 } }}
            style={{ ...CARD_STYLE, height: '100%' }}
          >
            <EmployeeTaskOverviewTable
              rows={usersSummary}
              loading={overviewLoading}
              canManageTasks={canManageCompanyTasks}
              onViewTasks={handleViewEmployeeTasks}
              onAssignTask={handleAssignTask}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[14, 14]} align="stretch" ref={taskTableRef}>
        <Col xs={24} lg={16}>
          <Card
            size="small"
            title={(
              <Space wrap size={[8, 4]}>
                <Title level={5} style={{ margin: 0 }}>员工任务筛选 / 任务明细</Title>
                {currentEmployeeLabel ? (
                  <Tag color="blue">当前员工：{currentEmployeeLabel}</Tag>
                ) : null}
                {detailAssigneeId ? (
                  <Button
                    type="link"
                    size="small"
                    style={{ padding: 0, height: 'auto' }}
                    onClick={() => {
                      setDetailAssigneeId(undefined);
                      setTaskPage(1);
                    }}
                  >
                    清除员工筛选
                  </Button>
                ) : null}
              </Space>
            )}
            styles={{ body: { padding: 0 } }}
            style={{ ...CARD_STYLE, height: '100%' }}
          >
            <AdminTaskFilterToolbar
              assigneeOptions={assigneeOptions}
              detailAssigneeId={detailAssigneeId}
              weekValue={detailWeekValue}
              statusFilter={detailStatus}
              loading={taskLoading}
              canManageTasks={canManageCompanyTasks}
              onAssigneeChange={(value) => {
                setDetailAssigneeId(value);
                setTaskPage(1);
              }}
              onWeekChange={handleDetailWeekChange}
              onStatusChange={(value) => {
                setDetailStatus(value);
                setTaskPage(1);
              }}
              onRefresh={handleRefreshTasks}
              onCreateTask={handleCreateTask}
            />
            <AdminTaskDetailTable
              tasks={taskList}
              loading={taskLoading}
              total={taskTotal}
              page={taskPage}
              pageSize={taskPageSize}
              embedded={embedded}
              onPageChange={(page, pageSize) => {
                setTaskPage(page);
                setTaskPageSize(pageSize);
              }}
              onOpenDetail={handleOpenDetail}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <AdminLastWeekSummaryPanel
            list={weeklySummaries}
            loading={weeklyLoading}
            generating={weeklyGenerating}
            loadError={weeklyLoadError}
            weekLabel={weeklyWeekLabel}
            showRegenerate={canGenerateWeeklyAi}
            onRefresh={loadLastWeekSummaries}
            onRegenerate={handleRegenerateWeeklySummaries}
            onOpenDetail={handleOpenWeeklyDetail}
          />
        </Col>
      </Row>

      <AdminWeeklySummaryDetailModal
        open={weeklyDetailOpen}
        item={weeklyDetailItem}
        onClose={() => {
          setWeeklyDetailOpen(false);
          setWeeklyDetailItem(null);
        }}
      />

      <EmployeeTaskFormModal
        open={formOpen}
        initialAssigneeId={formInitialAssigneeId}
        onCancel={() => {
          setFormOpen(false);
          setFormInitialAssigneeId(undefined);
        }}
        onSuccess={handleFormSuccess}
      />

      <EmployeeTaskDetailDrawer
        open={detailOpen}
        taskId={detailTaskId}
        currentUserId={currentUser?.id ?? null}
        onClose={() => {
          setDetailOpen(false);
          setDetailTaskId(null);
        }}
        onChanged={refreshGlobalAndTasks}
      />
    </div>
  );
}
