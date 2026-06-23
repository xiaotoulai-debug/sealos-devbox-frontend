import axios from 'axios';
import request from '../../lib/request';
import type {
  ApiResponse,
  DailyReport,
  DailyReportPayload,
  MonthlyOverviewData,
  OperationDashboardData,
  OperationLogPayload,
  OperationLogRecord,
  OperationRange,
} from './types';

export function getBackendMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: unknown } | string | undefined;
    if (typeof data === 'string' && data.trim()) return data.trim();
    if (typeof data === 'object' && typeof data?.message === 'string' && data.message.trim()) {
      return data.message.trim();
    }
  }
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}

export function isForbiddenError(error: unknown): boolean {
  if (axios.isAxiosError(error)) return error.response?.status === 403;
  return Boolean(error && typeof error === 'object' && 'status' in error && (error as { status?: number }).status === 403);
}

export async function fetchOperationDashboard(date: string, range: OperationRange): Promise<OperationDashboardData> {
  const { data: res } = await request.get<ApiResponse<OperationDashboardData>>(
    '/operation-daily/dashboard',
    { params: { date, range } },
  );
  if (res.code === 403) throw Object.assign(new Error(res.message || '暂无查看运营看板权限'), { status: 403 });
  if (res.code !== 200) throw new Error(res.message || '加载运营看板失败');
  return res.data ?? {};
}

export async function fetchMonthlyOverview(month: string): Promise<MonthlyOverviewData> {
  const { data: res } = await request.get<ApiResponse<MonthlyOverviewData>>(
    '/operation-daily/monthly-overview',
    { params: { month } },
  );
  if (res.code === 403) throw Object.assign(new Error(res.message || '后端接口权限未开放，请检查后端 RBAC'), { status: 403 });
  if (res.code !== 200) throw new Error(res.message || '加载每日任务总览失败');
  return res.data ?? {};
}

export async function createOperationLog(payload: OperationLogPayload): Promise<void> {
  const { data: res } = await request.post<ApiResponse<null>>('/operation-daily/logs', payload);
  if (res.code !== 200) throw new Error(res.message || '登记失败');
}

export async function fetchMyTodayLogs(): Promise<OperationLogRecord[]> {
  const { data: res } = await request.get<ApiResponse<OperationLogRecord[]>>('/operation-daily/my-today');
  if (res.code !== 200) throw new Error(res.message || '加载我的今日登记失败');
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchMyDailyReport(date: string): Promise<DailyReport> {
  const { data: res } = await request.get<ApiResponse<DailyReport>>(
    '/operation-daily/my-report',
    { params: { date } },
  );
  if (res.code !== 200) throw new Error(res.message || '加载我的运营日报失败');
  return res.data;
}

export async function createDailyReport(payload: DailyReportPayload): Promise<void> {
  const { data: res } = await request.post<ApiResponse<null>>('/operation-daily/reports', payload);
  if (res.code !== 200) throw new Error(res.message || '提交运营日报失败');
}

export async function updateDailyReport(reportId: number, payload: DailyReportPayload): Promise<void> {
  const { data: res } = await request.put<ApiResponse<null>>(
    `/operation-daily/reports/${reportId}`,
    payload,
  );
  if (res.code !== 200) throw new Error(res.message || '修改运营日报失败');
}

export async function fetchMyLogs(date: string): Promise<OperationLogRecord[]> {
  const { data: res } = await request.get<ApiResponse<OperationLogRecord[]>>(
    '/operation-daily/my-logs',
    { params: { date } },
  );
  if (res.code !== 200) throw new Error(res.message || '加载我的登记明细失败');
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchUserOperationLogs(userId: number, date: string): Promise<OperationLogRecord[]> {
  const { data: res } = await request.get<ApiResponse<OperationLogRecord[]>>(
    `/operation-daily/users/${userId}/logs`,
    { params: { date } },
  );
  if (res.code !== 200) throw new Error(res.message || '加载员工登记明细失败');
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchUserDailyReport(userId: number, date: string): Promise<DailyReport> {
  const { data: res } = await request.get<ApiResponse<DailyReport>>(
    `/operation-daily/users/${userId}/report`,
    { params: { date } },
  );
  if (res.code === 403) {
    throw Object.assign(new Error(res.message || '无权限查看员工运营日报'), { status: 403 });
  }
  if (res.code !== 200) throw new Error(res.message || '加载员工运营日报失败');
  return res.data;
}
