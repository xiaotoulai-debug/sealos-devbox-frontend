import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, DatePicker, Empty, message, Space, Spin } from 'antd';
import { EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import EmployeeTaskCenter, { mondayOf, type EmployeeTaskCenterHandle } from '../employeeTasks/EmployeeTaskCenter';
import AdminEmployeeTaskManagement from '../../pages/AdminEmployeeTaskManagement';
import { fetchMonthlyOverview, getBackendMessage, isForbiddenError } from './api';
import MonthlyScoreTopPanel from './MonthlyScoreTopPanel';
import MonthlyTaskHeatmap from './MonthlyTaskHeatmap';
import OperationDetailDrawer from './OperationDetailDrawer';
import OperationLogModal from './OperationLogModal';
import OperationMonthlyKpiCards from './OperationMonthlyKpiCards';
import YesterdayMissingPanel from './YesterdayMissingPanel';
import type { HeatmapDetailTarget, MonthlyOverviewData } from './types';
import { getStoredUser, hasPermission } from '../../lib/auth';
import { canSubmitDailyReport } from './roles';

type DashboardViewMode = 'dailyOverview' | 'employeeTasks' | 'adminEmployeeTasks';
type DashboardPermissionsSnapshot = string[] | null | undefined;

const DASHBOARD_TABS: { mode: DashboardViewMode; label: string; code: string }[] = [
  { mode: 'dailyOverview', label: '每日登记', code: 'MENU_DASHBOARD_DAILY' },
  { mode: 'employeeTasks', label: '个人任务', code: 'MENU_DASHBOARD_TASK_CENTER' },
  { mode: 'adminEmployeeTasks', label: '团队任务', code: 'MENU_DASHBOARD_COMPANY_MANAGEMENT' },
];

function canAccessDashboardPermission(code: string, permissions: DashboardPermissionsSnapshot): boolean {
  if (permissions === undefined) return hasPermission(code);
  if (permissions === null) return true;
  return permissions.includes(code);
}

export default function OperationDailyDashboard({
  permissions,
}: {
  permissions?: DashboardPermissionsSnapshot;
}) {
  const [viewMode, setViewMode] = useState<DashboardViewMode>('dailyOverview');
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs());
  const [employeeWeekValue, setEmployeeWeekValue] = useState<Dayjs>(mondayOf(dayjs()));
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [data, setData] = useState<MonthlyOverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [forbiddenMessage, setForbiddenMessage] = useState<string | null>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<HeatmapDetailTarget | null>(null);
  const employeeTaskRef = useRef<EmployeeTaskCenterHandle>(null);

  const monthText = useMemo(() => currentMonth.format('YYYY-MM'), [currentMonth]);
  const visibleTabs = useMemo(
    () => DASHBOARD_TABS.filter((tab) => canAccessDashboardPermission(tab.code, permissions)),
    [permissions],
  );
  const canViewDailyOverview = canAccessDashboardPermission('MENU_DASHBOARD_DAILY', permissions);
  const canSubmitDailyTask = canSubmitDailyReport(getStoredUser());

  const handleViewModeChange = useCallback((value: DashboardViewMode) => {
    const tab = DASHBOARD_TABS.find((item) => item.mode === value);
    if (!tab || !canAccessDashboardPermission(tab.code, permissions)) return;
    setViewMode(value);
  }, [permissions]);

  useEffect(() => {
    setViewMode((prev) => {
      if (visibleTabs.some((tab) => tab.mode === prev)) return prev;
      return visibleTabs[0]?.mode ?? 'dailyOverview';
    });
  }, [visibleTabs]);

  const loadMonthlyOverview = useCallback(async () => {
    if (!canViewDailyOverview) {
      setData(null);
      setForbiddenMessage(null);
      return;
    }
    setLoading(true);
    setForbiddenMessage(null);
    try {
      const payload = await fetchMonthlyOverview(monthText);
      setData(payload ?? {});
    } catch (err) {
      if (isForbiddenError(err)) {
        const backendMessage = getBackendMessage(err, '后端接口权限未开放，请检查后端 RBAC');
        console.error('每日任务总览接口返回 403，请检查后端 RBAC：', backendMessage, err);
        setForbiddenMessage(backendMessage);
        setData(null);
      } else {
        message.error(getBackendMessage(err, '加载每日任务总览失败'));
      }
    } finally {
      setLoading(false);
    }
  }, [canViewDailyOverview, monthText]);

  useEffect(() => {
    if (viewMode === 'dailyOverview') {
      loadMonthlyOverview();
    }
  }, [loadMonthlyOverview, viewMode]);

  const openDetail = (target: HeatmapDetailTarget) => {
    setDetailTarget(target);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetailTarget(null);
  };

  const handleLogSuccess = () => {
    setLogModalOpen(false);
    loadMonthlyOverview();
  };

  const yesterdayMissingUsers = Array.isArray(data?.yesterdayMissingUsers) ? data.yesterdayMissingUsers : [];
  const yesterdayRequired = data?.yesterdayRequired ?? data?.summaryCards?.yesterdayRequired ?? true;
  const yesterdayWorkdayStatus = data?.yesterdayWorkdayStatus ?? data?.summaryCards?.yesterdayWorkdayStatus ?? null;
  const yesterdayMessage = data?.yesterdayMessage ?? data?.summaryCards?.yesterdayMessage ?? undefined;
  const monthlyScoreTop = Array.isArray(data?.monthlyScoreTop) ? data.monthlyScoreTop : [];
  const dailyOverviewActions = (
    <Space wrap>
      <DatePicker
        value={currentMonth}
        picker="month"
        allowClear={false}
        format="YYYY年M月"
        style={{ width: 136 }}
        onChange={(value) => value && setCurrentMonth(value)}
      />
      <Button icon={<ReloadOutlined />} loading={loading} onClick={loadMonthlyOverview}>刷新</Button>
      {canSubmitDailyTask && (
        <Button type="primary" icon={<EditOutlined />} size="middle" onClick={() => setLogModalOpen(true)}>提交今日任务</Button>
      )}
    </Space>
  );

  const employeeTaskActions = (
    <Space wrap>
      <DatePicker
        picker="week"
        allowClear={false}
        value={employeeWeekValue}
        format={(value) => `本周：${mondayOf(value).format('MM-DD')} 至 ${mondayOf(value).add(6, 'day').format('MM-DD')}`}
        style={{ width: 190 }}
        onChange={(value) => value && setEmployeeWeekValue(mondayOf(value))}
      />
      <Button icon={<ReloadOutlined />} loading={employeeLoading} onClick={() => employeeTaskRef.current?.refreshAll()}>刷新</Button>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => employeeTaskRef.current?.openCreateModal()}>新建任务</Button>
    </Space>
  );

  const renderViewSwitchButton = (value: DashboardViewMode, label: string) => {
    const active = viewMode === value;
    return (
      <button
        type="button"
        onClick={() => handleViewModeChange(value)}
        style={{
          width: 132,
          height: 38,
          border: 'none',
          borderRadius: 12,
          background: active ? '#1677FF' : 'transparent',
          color: active ? '#FFFFFF' : '#475569',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.18s ease',
          boxShadow: active ? '0 8px 18px rgba(22, 119, 255, 0.22)' : 'none',
        }}
        onMouseEnter={(event) => {
          if (!active) {
            event.currentTarget.style.background = '#E2E8F0';
            event.currentTarget.style.color = '#334155';
          }
        }}
        onMouseLeave={(event) => {
          if (!active) {
            event.currentTarget.style.background = 'transparent';
            event.currentTarget.style.color = '#475569';
          }
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={{ minHeight: '100%', margin: -8, padding: 8, borderRadius: 18, background: 'linear-gradient(180deg, #f5f7fb 0%, #f8fafc 100%)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 12,
          padding: '12px 16px',
          background: 'transparent',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: 4,
            background: '#F1F5F9',
            border: '1px solid #E2E8F0',
            borderRadius: 16,
            height: 48,
            flexShrink: 0,
          }}
        >
          {visibleTabs.map((tab) => renderViewSwitchButton(tab.mode, tab.label))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minWidth: 280 }}>
          {visibleTabs.length > 0 && viewMode === 'dailyOverview' && canViewDailyOverview
            ? dailyOverviewActions
            : visibleTabs.length > 0 && viewMode === 'employeeTasks'
              ? employeeTaskActions
              : null}
        </div>
      </div>

      {visibleTabs.length === 0 ? (
        <Empty description="暂无仪表盘访问权限" style={{ marginTop: 48 }} />
      ) : viewMode === 'adminEmployeeTasks' && canAccessDashboardPermission('MENU_DASHBOARD_COMPANY_MANAGEMENT', permissions) ? (
        <AdminEmployeeTaskManagement embedded />
      ) : viewMode === 'employeeTasks' && canAccessDashboardPermission('MENU_DASHBOARD_TASK_CENTER', permissions) ? (
        <EmployeeTaskCenter
          ref={employeeTaskRef}
          compactHeader
          weekValue={employeeWeekValue}
          onWeekChange={setEmployeeWeekValue}
          onLoadingChange={setEmployeeLoading}
        />
      ) : viewMode === 'dailyOverview' && canViewDailyOverview ? (
        forbiddenMessage ? (
          <Alert
            type="error"
            showIcon
            message="后端接口权限未开放，请检查后端 RBAC"
            description={forbiddenMessage}
            style={{ borderRadius: 12 }}
          />
        ) : (
        <>
      <Spin spinning={loading}>
        <OperationMonthlyKpiCards
          summary={data?.summaryCards}
          loading={loading}
          yesterdayRequired={yesterdayRequired !== false}
          yesterdayWorkdayStatus={yesterdayWorkdayStatus}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 0.42fr) minmax(0, 1fr)', gap: 16, alignItems: 'stretch', marginBottom: 16 }}>
          <YesterdayMissingPanel
            users={yesterdayMissingUsers}
            loading={loading}
            yesterdayRequired={yesterdayRequired !== false}
            yesterdayWorkdayStatus={yesterdayWorkdayStatus}
            hintMessage={yesterdayMessage}
          />
          <MonthlyScoreTopPanel rows={monthlyScoreTop} loading={loading} />
        </div>

        <Card style={{ borderRadius: 18, border: '1px solid #e8eef7', boxShadow: '0 12px 28px rgba(15, 23, 42, 0.06)', overflow: 'hidden' }} styles={{ body: { padding: 0 } }}>
          <MonthlyTaskHeatmap heatmap={data?.heatmap} loading={loading} onCellClick={openDetail} />
        </Card>
      </Spin>

      <OperationLogModal
        open={logModalOpen}
        onCancel={() => setLogModalOpen(false)}
        onSuccess={handleLogSuccess}
      />
      <OperationDetailDrawer
        open={detailOpen}
        date={detailTarget?.date ?? dayjs().format('YYYY-MM-DD')}
        targetUser={detailTarget}
        onClose={closeDetail}
      />
        </>
        )
      ) : null}
    </div>
  );
}
