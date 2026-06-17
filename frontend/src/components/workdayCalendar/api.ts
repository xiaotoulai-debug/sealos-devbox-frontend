import axios from 'axios';
import request from '../../lib/request';
import type {
  ApiResponse,
  WorkdayCalendarDayDto,
  WorkdayCalendarYearDto,
  WorkdayStatus,
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

export async function fetchWorkdayCalendar(year: number): Promise<WorkdayCalendarYearDto> {
  const { data: res } = await request.get<ApiResponse<WorkdayCalendarYearDto>>(
    '/workday-calendar',
    { params: { year } },
  );
  return assertSuccess(res, '加载运营日历失败');
}

export async function updateWorkdayCalendarDay(
  date: string,
  payload: {
    status: WorkdayStatus;
    remark?: string;
  },
): Promise<WorkdayCalendarDayDto> {
  const { data: res } = await request.put<ApiResponse<WorkdayCalendarDayDto>>(
    `/workday-calendar/${date}`,
    payload,
  );
  return assertSuccess(res, '更新运营日状态失败');
}

export async function batchUpdateWorkdayCalendar(payload: {
  dates: string[];
  status: WorkdayStatus;
  remark?: string;
}): Promise<{ count: number }> {
  const { data: res } = await request.post<ApiResponse<{ count: number }>>(
    '/workday-calendar/batch',
    payload,
  );
  return assertSuccess(res, '批量更新运营日状态失败');
}
