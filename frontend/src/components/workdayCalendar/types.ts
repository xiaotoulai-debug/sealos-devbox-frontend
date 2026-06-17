export type WorkdayStatus = 'WORKDAY' | 'REST' | 'PENDING';

export interface WorkdayCalendarDayDto {
  date: string;
  status: WorkdayStatus;
  remark?: string | null;
  updatedById?: number | null;
  updatedByName?: string | null;
  updatedAt?: string | null;
}

export interface WorkdayCalendarYearDto {
  year: number;
  days: WorkdayCalendarDayDto[];
}

export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}

export const WORKDAY_STATUS_LABELS: Record<WorkdayStatus, string> = {
  WORKDAY: '运营日',
  REST: '休息日',
  PENDING: '待定',
};

export const WORKDAY_STATUS_STYLES: Record<WorkdayStatus, { background: string; color: string; border: string }> = {
  WORKDAY: {
    background: '#ECFDF5',
    color: '#047857',
    border: '1px solid #A7F3D0',
  },
  REST: {
    background: '#F3F4F6',
    color: '#6B7280',
    border: '1px solid #E5E7EB',
  },
  PENDING: {
    background: '#FAFAFA',
    color: '#B0B7C3',
    border: '1px dashed #E5E7EB',
  },
};
