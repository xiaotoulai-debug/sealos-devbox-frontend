import axios from 'axios';
import request from '../../lib/request';
import type {
  ApiResponse,
  CreateReminderTemplatePayload,
  DailyReminderCheckPayload,
  DailyReminderTemplateDto,
  DailyReminderTodayItem,
  ReminderTemplateListParams,
  ReminderTemplateListResponse,
  UpdateReminderTemplatePayload,
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

export async function fetchTodayReminders(date?: string): Promise<DailyReminderTodayItem[]> {
  const { data: res } = await request.get<ApiResponse<DailyReminderTodayItem[]>>(
    '/daily-reminders/today',
    { params: date ? { date } : undefined },
  );
  const list = assertSuccess(res, '加载今日必做提醒失败');
  return Array.isArray(list) ? list : [];
}

export async function checkDailyReminder(templateId: number, payload: DailyReminderCheckPayload): Promise<void> {
  const { data: res } = await request.post<ApiResponse<null>>(`/daily-reminders/${templateId}/check`, payload);
  assertSuccess(res, '提交提醒检查结果失败');
}

export async function fetchReminderTemplates(params?: ReminderTemplateListParams): Promise<DailyReminderTemplateDto[]> {
  const { data: res } = await request.get<ApiResponse<ReminderTemplateListResponse>>(
    '/daily-reminders/templates',
    { params },
  );
  const result = assertSuccess(res, '加载提醒模板失败');

  if (Array.isArray(result)) {
    return result;
  }

  if (result && Array.isArray(result.items)) {
    return result.items;
  }

  return [];
}

export async function fetchReminderTemplateDetail(id: number): Promise<DailyReminderTemplateDto> {
  const { data: res } = await request.get<ApiResponse<DailyReminderTemplateDto>>(`/daily-reminders/templates/${id}`);
  return assertSuccess(res, '加载提醒模板详情失败');
}

export async function createReminderTemplate(payload: CreateReminderTemplatePayload): Promise<void> {
  const { data: res } = await request.post<ApiResponse<null>>('/daily-reminders/templates', payload);
  assertSuccess(res, '创建提醒模板失败');
}

export async function updateReminderTemplate(id: number, payload: UpdateReminderTemplatePayload): Promise<void> {
  const { data: res } = await request.patch<ApiResponse<null>>(`/daily-reminders/templates/${id}`, payload);
  assertSuccess(res, '更新提醒模板失败');
}

export async function updateReminderTemplateStatus(id: number, isActive: boolean): Promise<void> {
  const { data: res } = await request.patch<ApiResponse<null>>(`/daily-reminders/templates/${id}/status`, { isActive });
  assertSuccess(res, '更新提醒模板状态失败');
}

export async function deleteReminderTemplate(id: number, options?: { force?: boolean }): Promise<boolean> {
  const { data: res } = await request.delete<ApiResponse<boolean>>(
    `/daily-reminders/templates/${id}`,
    {
      params: options?.force ? { force: 'true' } : undefined,
    },
  );
  return assertSuccess(res, '删除提醒模板失败');
}

export function isReminderTemplateDeleteHistoryConflict(error: unknown): boolean {
  if (axios.isAxiosError(error) && error.response?.status === 409) return true;
  const msg = getBackendMessage(error, '');
  return ['历史处理记录', '历史检查记录', '无法直接删除'].some((keyword) => msg.includes(keyword));
}
