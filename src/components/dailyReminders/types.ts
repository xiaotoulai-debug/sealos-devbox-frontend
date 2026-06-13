export type ReminderCategory =
  | 'PLATFORM_MESSAGE'
  | 'QUALIFICATION'
  | 'PRODUCT_REVIEW'
  | 'AD_CHECK'
  | 'SHIPPING_FOLLOW'
  | 'INVENTORY_CHECK'
  | 'AFTER_SALES'
  | 'PRODUCT_SELECTION'
  | 'OTHER';

export type ReminderPriority = 'P0' | 'P1' | 'P2';

export type ReminderFrequency = 'DAILY' | 'WORKDAY' | 'WEEKLY';

export type ReminderCheckStatus = 'PENDING' | 'CHECKED' | 'ABNORMAL';

export type ReminderAssignmentTargetType = 'USER' | 'ROLE';

export interface DailyReminderTodayItem {
  id: number;
  title: string;
  category: ReminderCategory;
  categoryName?: string | null;
  priority: ReminderPriority;
  priorityName?: string | null;
  suggestedTime?: string | null;
  platform?: string | null;
  platformName?: string | null;
  shopId?: number | null;
  shopName?: string | null;
  description?: string | null;
  requireCheck?: boolean | null;
  checkStatus?: ReminderCheckStatus | null;
  checkStatusName?: string | null;
  note?: string | null;
  checkedAt?: string | null;
  isOverdue?: boolean | null;
  sortWeight?: number | null;
}

export interface DailyReminderAssignmentDto {
  id?: number;
  targetType: ReminderAssignmentTargetType;
  userId?: number | null;
  userName?: string | null;
  roleId?: number | null;
  roleName?: string | null;
}

export interface DailyReminderTemplateDto {
  id: number;
  title: string;
  category: ReminderCategory;
  categoryName?: string | null;
  priority: ReminderPriority;
  priorityName?: string | null;
  frequency: ReminderFrequency;
  frequencyName?: string | null;
  weekdays?: number[] | null;
  suggestedTime?: string | null;
  requireCheck?: boolean | null;
  platform?: string | null;
  platformName?: string | null;
  shopId?: number | null;
  shopName?: string | null;
  description?: string | null;
  isActive?: boolean | null;
  assignments?: DailyReminderAssignmentDto[];
  createdByName?: string | null;
  updatedByName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface DailyReminderCheckPayload {
  date: string;
  status: ReminderCheckStatus;
  note?: string;
}

export interface CreateReminderTemplatePayload {
  title: string;
  category: ReminderCategory;
  priority: ReminderPriority;
  frequency: ReminderFrequency;
  weekdays?: number[];
  suggestedTime?: string;
  requireCheck?: boolean;
  platform?: string;
  shopId?: number;
  description?: string;
  assignments?: DailyReminderAssignmentDto[];
}

export interface UpdateReminderTemplatePayload {
  title?: string;
  category?: ReminderCategory;
  priority?: ReminderPriority;
  frequency?: ReminderFrequency;
  weekdays?: number[];
  suggestedTime?: string;
  requireCheck?: boolean;
  platform?: string;
  shopId?: number;
  description?: string;
  assignments?: DailyReminderAssignmentDto[];
}

export interface ReminderTemplateListParams {
  keyword?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export type ReminderTemplateListResponse =
  | DailyReminderTemplateDto[]
  | {
      items?: DailyReminderTemplateDto[];
      total?: number;
      page?: number;
      pageSize?: number;
    };

export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}

export const REMINDER_CATEGORY_LABELS: Record<ReminderCategory, string> = {
  PLATFORM_MESSAGE: '平台消息',
  QUALIFICATION: '资质维护',
  PRODUCT_REVIEW: '商品审核',
  AD_CHECK: '广告检查',
  SHIPPING_FOLLOW: '发货跟进',
  INVENTORY_CHECK: '库存检查',
  AFTER_SALES: '售后异常',
  PRODUCT_SELECTION: '选品动作',
  OTHER: '其他',
};

export const REMINDER_PRIORITY_LABELS: Record<ReminderPriority, string> = {
  P0: 'P0 必做',
  P1: 'P1 重要',
  P2: 'P2 常规',
};

export const REMINDER_FREQUENCY_LABELS: Record<ReminderFrequency, string> = {
  DAILY: '每日',
  WORKDAY: '工作日',
  WEEKLY: '每周',
};

export const REMINDER_STATUS_LABELS: Record<ReminderCheckStatus, string> = {
  PENDING: '待检查',
  CHECKED: '已检查',
  ABNORMAL: '有异常',
};

export function getReminderStatus(item: Partial<DailyReminderTodayItem>): ReminderCheckStatus {
  return item.checkStatus && item.checkStatus in REMINDER_STATUS_LABELS ? item.checkStatus : 'PENDING';
}

export function sortTodayReminders(items?: DailyReminderTodayItem[]): DailyReminderTodayItem[] {
  const list = Array.isArray(items) ? items : [];
  return [...list].sort((a, b) => {
    const aWeight = typeof a.sortWeight === 'number' ? a.sortWeight : Number.MAX_SAFE_INTEGER;
    const bWeight = typeof b.sortWeight === 'number' ? b.sortWeight : Number.MAX_SAFE_INTEGER;
    return aWeight - bWeight;
  });
}
