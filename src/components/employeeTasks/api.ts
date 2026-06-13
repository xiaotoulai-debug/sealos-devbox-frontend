import axios from 'axios';
import request from '../../lib/request';
import type {
  AdminEmployeeTaskDashboardData,
  AdminEmployeeTaskListData,
  AdminEmployeeTaskQuery,
  AdminEmployeeTaskUserSummary,
  AdminWeeklySummaryDto,
  AdminWeeklySummaryListData,
  ApiResponse,
  AssignableUser,
  CreateEmployeeTaskPayload,
  EmployeeTaskCommentDto,
  EmployeeTaskDashboardData,
  EmployeeTaskDetailData,
  EmployeeTaskDto,
  EmployeeTaskMentionUserDto,
  TaskListParams,
  UpdateEmployeeTaskPayload,
  UpdateEmployeeTaskStatusPayload,
  WeeklySummaryData,
  EmployeeWeeklyPlanData,
  SaveEmployeeWeeklyPlanPayload,
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

function assertSuccess<T>(res: ApiResponse<T>, fallback: string): T {
  if (res.code !== 200) throw new Error(res.message || fallback);
  return res.data;
}

export async function fetchEmployeeTaskDashboard(weekStart: string): Promise<EmployeeTaskDashboardData> {
  const { data: res } = await request.get<ApiResponse<EmployeeTaskDashboardData>>(
    '/employee-tasks/my-dashboard',
    { params: { weekStart } },
  );
  return assertSuccess(res, '加载员工任务中心失败') ?? {};
}

export async function fetchEmployeeTaskWeeklySummary(weekStart?: string): Promise<WeeklySummaryData> {
  const { data: res } = await request.get<ApiResponse<WeeklySummaryData>>(
    '/employee-tasks/weekly-summary',
    { params: weekStart ? { weekStart } : undefined },
  );
  return assertSuccess(res, '加载上周汇总失败') ?? {};
}

export interface GenerateWeeklySummaryAiPayload {
  weekStart: string;
  force?: boolean;
}

export async function generateEmployeeTaskWeeklySummaryAi(
  payload: GenerateWeeklySummaryAiPayload,
): Promise<WeeklySummaryData | null> {
  const { data: res } = await request.post<ApiResponse<WeeklySummaryData | null>>(
    '/employee-tasks/weekly-summary/ai-generate',
    payload,
  );
  return assertSuccess(res, '生成 AI 总结失败') ?? null;
}

export async function fetchEmployeeWeeklyPlan(weekStart: string): Promise<EmployeeWeeklyPlanData | null> {
  const normalizedWeekStart = String(weekStart ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedWeekStart)) {
    throw new Error('INVALID_WEEK_START');
  }
  const { data: res } = await request.get<ApiResponse<EmployeeWeeklyPlanData | null>>(
    '/employee-tasks/weekly-plan',
    { params: { weekStart: normalizedWeekStart } },
  );
  return assertSuccess(res, '加载下周计划失败') ?? null;
}

export async function saveEmployeeWeeklyPlan(
  payload: SaveEmployeeWeeklyPlanPayload,
): Promise<EmployeeWeeklyPlanData | null> {
  const body: SaveEmployeeWeeklyPlanPayload = {
    weekStart: String(payload.weekStart ?? '').trim(),
    nextWeekPlan: payload.nextWeekPlan ?? '',
    problems: payload.problems ?? '',
    supportNeeded: payload.supportNeeded ?? '',
  };
  if (payload.submit != null) body.submit = payload.submit;
  const { data: res } = await request.post<ApiResponse<EmployeeWeeklyPlanData | null>>(
    '/employee-tasks/weekly-plan',
    body,
  );
  return assertSuccess(res, '保存下周计划失败') ?? null;
}

export async function fetchReceivedTasks(params: TaskListParams): Promise<EmployeeTaskDto[]> {
  const { data: res } = await request.get<ApiResponse<EmployeeTaskDto[]>>('/employee-tasks/received', { params });
  const list = assertSuccess(res, '加载我收到的任务失败');
  return Array.isArray(list) ? list : [];
}

export async function fetchCreatedTasks(params: TaskListParams): Promise<EmployeeTaskDto[]> {
  const { data: res } = await request.get<ApiResponse<EmployeeTaskDto[]>>('/employee-tasks/created', { params });
  const list = assertSuccess(res, '加载我发起的任务失败');
  return Array.isArray(list) ? list : [];
}

export async function fetchEmployeeTaskDetail(id: number): Promise<EmployeeTaskDetailData> {
  const { data: res } = await request.get<ApiResponse<EmployeeTaskDetailData>>(`/employee-tasks/${id}`);
  return assertSuccess(res, '加载任务详情失败');
}

export async function createEmployeeTask(payload: CreateEmployeeTaskPayload): Promise<void> {
  const { data: res } = await request.post<ApiResponse<null>>('/employee-tasks', payload);
  assertSuccess(res, '创建任务失败');
}

export async function updateEmployeeTaskStatus(id: number, payload: UpdateEmployeeTaskStatusPayload): Promise<void> {
  const { data: res } = await request.patch<ApiResponse<null>>(`/employee-tasks/${id}/status`, payload);
  assertSuccess(res, '更新任务状态失败');
}

export async function updateEmployeeTask(id: number, payload: UpdateEmployeeTaskPayload): Promise<void> {
  const { data: res } = await request.patch<ApiResponse<null>>(`/employee-tasks/${id}`, payload);
  assertSuccess(res, '更新任务失败');
}

export async function fetchAssignableUsers(): Promise<AssignableUser[]> {
  const { data: res } = await request.get<ApiResponse<AssignableUser[]>>('/employee-tasks/assignable-users');
  const list = assertSuccess(res, '加载可指派用户失败');
  return Array.isArray(list) ? list : [];
}

export async function updateEmployeeTaskDueDate(taskId: number, dueDate: string): Promise<void> {
  const { data: res } = await request.patch<ApiResponse<null>>(`/employee-tasks/${taskId}/due-date`, { dueDate });
  assertSuccess(res, '更新截止日期失败');
}

export async function fetchEmployeeTaskComments(taskId: number): Promise<EmployeeTaskCommentDto[]> {
  const { data: res } = await request.get<ApiResponse<EmployeeTaskCommentDto[]>>(`/employee-tasks/${taskId}/comments`);
  const list = assertSuccess(res, '加载任务沟通记录失败');
  return Array.isArray(list) ? list : [];
}

export async function createEmployeeTaskComment(
  taskId: number,
  payload: {
    content: string;
    mentionedUserIds?: number[];
  },
): Promise<void> {
  const { data: res } = await request.post<ApiResponse<null>>(`/employee-tasks/${taskId}/comments`, payload);
  assertSuccess(res, '发送消息失败');
}

export async function fetchEmployeeTaskMentionUsers(): Promise<EmployeeTaskMentionUserDto[]> {
  const { data: res } = await request.get<ApiResponse<EmployeeTaskMentionUserDto[]>>('/employee-tasks/mention-users');
  const list = assertSuccess(res, '加载可 @ 用户失败');
  return Array.isArray(list) ? list : [];
}

function buildAdminQueryParams(query: AdminEmployeeTaskQuery): Record<string, string | number> {
  const params: Record<string, string | number> = { weekStart: query.weekStart };
  if (query.assigneeId != null) params.assigneeId = query.assigneeId;
  if (query.status && query.status !== 'ALL') params.status = query.status;
  if (query.platform && query.platform !== 'ALL') params.platform = query.platform;
  if (query.page != null) params.page = query.page;
  if (query.pageSize != null) params.pageSize = query.pageSize;
  return params;
}

export async function fetchAdminEmployeeTaskDashboard(
  query: AdminEmployeeTaskQuery,
): Promise<AdminEmployeeTaskDashboardData> {
  const { data: res } = await request.get<ApiResponse<AdminEmployeeTaskDashboardData>>(
    '/employee-tasks/admin-dashboard',
    { params: buildAdminQueryParams(query) },
  );
  return assertSuccess(res, '加载管理员工任务统计失败') ?? {};
}

export async function fetchAdminEmployeeTaskUsersSummary(
  query: AdminEmployeeTaskQuery,
): Promise<AdminEmployeeTaskUserSummary[]> {
  const { data: res } = await request.get<ApiResponse<AdminEmployeeTaskUserSummary[]>>(
    '/employee-tasks/admin-users-summary',
    { params: buildAdminQueryParams(query) },
  );
  const list = assertSuccess(res, '加载员工任务汇总失败');
  return Array.isArray(list) ? list : [];
}

export async function fetchAdminEmployeeTasks(
  query: AdminEmployeeTaskQuery,
): Promise<AdminEmployeeTaskListData> {
  const { data: res } = await request.get<ApiResponse<AdminEmployeeTaskListData>>(
    '/employee-tasks/admin-tasks',
    { params: buildAdminQueryParams(query) },
  );
  return assertSuccess(res, '加载员工任务明细失败') ?? { list: [], total: 0 };
}

export async function fetchAdminWeeklySummaries(params: {
  weekStart: string;
  assigneeId?: number;
}): Promise<AdminWeeklySummaryDto[]> {
  const query: Record<string, string | number> = { weekStart: params.weekStart };
  if (params.assigneeId != null) query.assigneeId = params.assigneeId;
  const { data: res } = await request.get<ApiResponse<AdminWeeklySummaryListData>>(
    '/employee-tasks/admin-weekly-summaries',
    { params: query },
  );
  const data = assertSuccess(res, '加载上周汇总失败');
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.list) ? data.list : [];
}

export async function generateAdminWeeklySummaries(payload: {
  weekStart: string;
  assigneeId?: number;
}): Promise<void> {
  const body: { weekStart: string; assigneeId?: number } = { weekStart: payload.weekStart };
  if (payload.assigneeId != null) body.assigneeId = payload.assigneeId;
  const { data: res } = await request.post<ApiResponse<unknown>>(
    '/employee-tasks/admin-weekly-summaries/generate',
    body,
  );
  assertSuccess(res, '提交生成任务失败');
}
