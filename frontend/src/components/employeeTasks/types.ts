import dayjs from 'dayjs';

export type EmployeeTaskType =
  | 'PRODUCT_LISTING'
  | 'QUALIFICATION'
  | 'AD_OPTIMIZATION'
  | 'MARKETING_STRATEGY'
  | 'SHIPPING'
  | 'PURCHASE'
  | 'OTHER';

export type EmployeeTaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

export type EmployeeTaskPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export type EmployeeTaskPlatform =
  | 'SHEIN'
  | 'TEMU'
  | 'ALIEXPRESS'
  | 'EMAG'
  | 'AMAZON'
  | 'OTHER';

export interface EmployeeTaskDto {
  id: number;
  title: string;
  description?: string | null;
  taskType: EmployeeTaskType;
  taskTypeName?: string | null;
  platform?: EmployeeTaskPlatform | null;
  platformName?: string | null;
  shopId?: number | null;
  shopName?: string | null;
  priority: EmployeeTaskPriority;
  priorityName?: string | null;
  status: EmployeeTaskStatus;
  statusName?: string | null;
  isOverdue?: boolean | null;
  dueDate?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  creatorId: number;
  creatorName?: string | null;
  assigneeId: number;
  assigneeName?: string | null;
  relatedSkuText?: string | null;
  remark?: string | null;
  scoreImpact?: number | null;
  scoreStatus?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface EmployeeTaskLogDto {
  id: number;
  taskId: number;
  action: string;
  actionName?: string | null;
  operatorId?: number | null;
  operatorName?: string | null;
  beforeStatus?: EmployeeTaskStatus | null;
  afterStatus?: EmployeeTaskStatus | null;
  remark?: string | null;
  createdAt?: string | null;
}

export interface EmployeeTaskSummaryCards {
  weeklyPendingCount?: number | null;
  weeklyDoneCount?: number | null;
  monthlyCompletionRate?: number | null;
  receivedTaskCount?: number | null;
}

export interface EmployeeTaskDashboardData {
  summaryCards?: EmployeeTaskSummaryCards | null;
  weekStart?: string | null;
  weekEnd?: string | null;
  weeklyTasks?: EmployeeTaskDto[];
  historyTasks?: EmployeeTaskDto[];
  receivedTasks?: EmployeeTaskDto[];
  createdTasks?: EmployeeTaskDto[];
  collaborationTasks?: EmployeeTaskDto[];
}

export type WeeklyCalendarStatus = 'CONFIGURED' | 'NOT_CONFIGURED' | 'NO_WORKDAY';

export interface WeeklyDailyReportSummary {
  submittedDays?: number | null;
  missingDays?: number | null;
  requiredDays?: number | null;
  workdayDates?: string[];
  missingDates?: string[];
  restDates?: string[];
  pendingDates?: string[];
  calendarStatus?: WeeklyCalendarStatus | null;
  productSelectionCount?: number | null;
  productListingCount?: number | null;
  approvedCount?: number | null;
  shipmentCount?: number | null;
  otherNotes?: string[];
  blockedItems?: string[];
}

export function isWeeklyDailyReportCalculable(daily?: WeeklyDailyReportSummary | null): boolean {
  if (!daily) return false;
  if (daily.calendarStatus === 'NOT_CONFIGURED' || daily.calendarStatus === 'NO_WORKDAY') return false;
  const requiredDays = daily.requiredDays ?? 7;
  return requiredDays > 0;
}

export function getWeeklyDailyReportCounts(daily?: WeeklyDailyReportSummary | null) {
  const submittedDays = Number(daily?.submittedDays ?? 0);
  const requiredDays = daily?.requiredDays ?? 7;
  const missingDays = typeof daily?.missingDays === 'number'
    ? daily.missingDays
    : Math.max(0, requiredDays - submittedDays);
  return {
    submittedDays: Number.isFinite(submittedDays) ? submittedDays : 0,
    requiredDays: Number.isFinite(requiredDays) ? requiredDays : 7,
    missingDays: Number.isFinite(missingDays) ? missingDays : 0,
  };
}

export function getWeeklyDailyReportUnavailableText(daily?: WeeklyDailyReportSummary | null): string {
  if (daily?.calendarStatus === 'NOT_CONFIGURED') {
    return '运营日历未配置，暂不计算缺失';
  }
  return '上周无已配置运营日，暂不计算缺失';
}

export function buildWeeklyDailyReportSummaryText(daily?: WeeklyDailyReportSummary | null): string {
  if (daily?.calendarStatus === 'NOT_CONFIGURED') {
    return '上周运营日历未配置，暂不计算日报缺失；';
  }
  if (!isWeeklyDailyReportCalculable(daily)) {
    return '上周无已配置运营日，暂不计算缺失；';
  }
  const { submittedDays, requiredDays, missingDays } = getWeeklyDailyReportCounts(daily);
  return `上周应登记日报 ${requiredDays} 天，已登记 ${submittedDays} 天，缺失 ${missingDays} 天；`;
}

export interface WeeklyTaskSummary {
  totalCount?: number | null;
  doneCount?: number | null;
  pendingCount?: number | null;
  inProgressCount?: number | null;
  overdueCount?: number | null;
  doneTasks?: EmployeeTaskDto[];
  pendingTasks?: EmployeeTaskDto[];
  overdueTasks?: EmployeeTaskDto[];
}

export interface WeeklySummaryText {
  dailyReport?: string | null;
  receivedTasks?: string | null;
  createdTasks?: string | null;
  nextWeekPlan?: string | null;
}

export type WeeklySummaryAiStatus =
  | 'NOT_ENABLED'
  | 'RULE_ONLY'
  | 'PENDING'
  | 'READY'
  | 'FAILED';

/** sections 由前端完整展示，不做字数截断或条数限制 */
export interface AiWeeklyReviewSectionBlock {
  summary?: string | null;
  items?: string[] | null;
}

export interface AiWeeklyReviewCompactSections {
  completed: AiWeeklyReviewSectionBlock;
  unfinished: AiWeeklyReviewSectionBlock;
  nextFocus: AiWeeklyReviewSectionBlock;
}

export interface WeeklySummaryAiResult {
  overview?: string | null;
  highlights?: string[] | null;
  risks?: string[] | null;
  completionAnalysis?: string | null;
  nextWeekSuggestions?: string[] | null;
  managerNote?: string | null;
  sections?: AiWeeklyReviewCompactSections | null;
  completed?: AiWeeklyReviewSectionBlock | null;
  unfinished?: AiWeeklyReviewSectionBlock | null;
  nextFocus?: AiWeeklyReviewSectionBlock | null;
}

export interface WeeklySummaryAiReport {
  sections?: AiWeeklyReviewCompactSections | null;
}

export interface WeeklySummaryData {
  weekStart?: string | null;
  weekEnd?: string | null;
  dailyReportSummary?: WeeklyDailyReportSummary | null;
  receivedTaskSummary?: WeeklyTaskSummary | null;
  createdTaskSummary?: WeeklyTaskSummary | null;
  planSuggestions?: string[];
  summaryText?: WeeklySummaryText | null;
  aiStatus?: WeeklySummaryAiStatus | string | null;
  aiGeneratedAt?: string | null;
  aiSummary?: WeeklySummaryAiResult | null;
  aiReport?: WeeklySummaryAiReport | null;
  ai_report?: WeeklySummaryAiReport | null;
  sections?: AiWeeklyReviewCompactSections | null;
  aiErrorMessage?: string | null;
}

export interface EmployeeWeeklyPlanData {
  /** 服务端返回，前端只读，禁止在 POST body 中提交 */
  id?: number;
  weekStart: string;
  nextWeekPlan?: string | null;
  problems?: string | null;
  supportNeeded?: string | null;
  submittedAt?: string | null;
  updatedAt?: string | null;
}

export interface SaveEmployeeWeeklyPlanPayload {
  weekStart: string;
  nextWeekPlan?: string;
  problems?: string;
  supportNeeded?: string;
  submit?: boolean;
}

export interface AssignableUser {
  id: number;
  name: string;
  username?: string | null;
  roleName?: string | null;
}

export interface CreateEmployeeTaskPayload {
  title: string;
  taskType: EmployeeTaskType;
  assigneeId: number;
  platform: EmployeeTaskPlatform;
  shopId?: number;
  dueDate: string;
  priority: EmployeeTaskPriority;
  description?: string;
  relatedSkuText?: string;
  remark?: string;
}

export interface UpdateEmployeeTaskPayload {
  title?: string;
  taskType?: EmployeeTaskType;
  assigneeId?: number;
  platform?: EmployeeTaskPlatform;
  shopId?: number;
  dueDate?: string;
  priority?: EmployeeTaskPriority;
  description?: string;
  relatedSkuText?: string;
  remark?: string;
}

export interface UpdateEmployeeTaskStatusPayload {
  status: EmployeeTaskStatus;
  remark?: string;
}

export interface EmployeeTaskDetailData extends EmployeeTaskDto {
  logs?: EmployeeTaskLogDto[];
}

export interface EmployeeTaskCommentDto {
  id: number;
  taskId: number;
  content: string;
  authorId: number;
  authorName: string;
  mentionedUserIds: number[];
  mentionedUsers?: Array<{
    id: number;
    name: string;
  }>;
  createdAt: string;
}

export interface EmployeeTaskMentionUserDto {
  id: number;
  name: string;
  roleName?: string;
}

export interface TaskListParams {
  status?: EmployeeTaskStatus | '';
  range?: 'thisWeek' | 'thisMonth' | 'all';
  page?: number;
  pageSize?: number;
}

export type AdminEmployeeTaskStatusFilter =
  | 'ALL'
  | 'PENDING'
  | 'DONE'
  | 'OVERDUE'
  | 'CANCELLED';

export interface AdminEmployeeTaskQuery {
  weekStart: string;
  assigneeId?: number;
  status?: AdminEmployeeTaskStatusFilter;
  platform?: EmployeeTaskPlatform | 'ALL';
  page?: number;
  pageSize?: number;
}

export interface AdminEmployeeTaskSummaryCards {
  employeeCount?: number | null;
  totalTaskCount?: number | null;
  doneCount?: number | null;
  pendingCount?: number | null;
  overdueCount?: number | null;
  completionRate?: number | null;
}

export interface AdminEmployeeTaskDashboardData {
  summaryCards?: AdminEmployeeTaskSummaryCards | null;
}

export interface AdminEmployeeTaskUserSummary {
  assigneeId: number;
  name: string;
  username?: string | null;
  roleName?: string | null;
  totalTaskCount?: number | null;
  doneCount?: number | null;
  pendingCount?: number | null;
  overdueCount?: number | null;
  completionRate?: number | null;
}

export interface AdminEmployeeTaskListData {
  list?: EmployeeTaskDto[];
  total?: number;
}

export type AdminWeeklySummaryStatus =
  | 'NONE'
  | 'GENERATING'
  | 'SUCCESS'
  | 'FAILED';

export interface AdminWeeklySummaryDto {
  id?: number;
  assigneeId: number;
  assigneeName: string;
  roleName?: string | null;
  weekStart: string;
  weekEnd: string;
  status: AdminWeeklySummaryStatus;
  summaryPreview?: string | null;
  summaryText?: string | null;
  completedSummary?: string | null;
  pendingSummary?: string | null;
  problemSummary?: string | null;
  suggestionSummary?: string | null;
  nextWeekPlan?: string | null;
  sections?: AiWeeklyReviewCompactSections | null;
  generatedAt?: string | null;
  updatedAt?: string | null;
  errorMessage?: string | null;
}

export interface AdminWeeklySummaryListData {
  list?: AdminWeeklySummaryDto[];
}

export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}

export const TASK_TYPE_LABELS: Record<EmployeeTaskType, string> = {
  PRODUCT_LISTING: '选品上架',
  QUALIFICATION: '资质维护',
  AD_OPTIMIZATION: '广告优化',
  MARKETING_STRATEGY: '营销策略',
  SHIPPING: '发货模块',
  PURCHASE: '采购模块',
  OTHER: '其他任务',
};

export const STATUS_LABELS: Record<EmployeeTaskStatus, string> = {
  TODO: '待完成',
  IN_PROGRESS: '待完成',
  DONE: '已完成',
  CANCELLED: '已取消',
};

export const PENDING_DISPLAY_LABEL = '待完成';

export const PRIORITY_LABELS: Record<EmployeeTaskPriority, string> = {
  HIGH: '高',
  MEDIUM: '中',
  LOW: '低',
};

export const PLATFORM_LABELS: Record<EmployeeTaskPlatform, string> = {
  SHEIN: 'SHEIN',
  TEMU: 'TEMU',
  ALIEXPRESS: 'AliExpress',
  EMAG: 'eMAG',
  AMAZON: 'Amazon',
  OTHER: '其他',
};

const STATUS_SCORE: Record<EmployeeTaskStatus, number> = {
  IN_PROGRESS: 3000,
  TODO: 2000,
  DONE: -5000,
  CANCELLED: -8000,
};

const PRIORITY_SCORE: Record<EmployeeTaskPriority, number> = {
  HIGH: 300,
  MEDIUM: 200,
  LOW: 100,
};

function safeTime(value?: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function safeUpdatedTime(value?: string | null): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function getEmployeeTaskStatus(task: Partial<EmployeeTaskDto>): EmployeeTaskStatus {
  return task.status && task.status in STATUS_LABELS ? task.status : 'TODO';
}

export function isEmployeeTaskPending(status: EmployeeTaskStatus): boolean {
  return status === 'TODO' || status === 'IN_PROGRESS';
}

export function getEmployeeTaskDisplayStatusLabel(task: Partial<EmployeeTaskDto>): string {
  const status = getEmployeeTaskStatus(task);
  if (status === 'DONE') return task.statusName || STATUS_LABELS.DONE;
  if (status === 'CANCELLED') return task.statusName || STATUS_LABELS.CANCELLED;
  if (isActiveTaskOverdue(task)) return '已逾期';
  return PENDING_DISPLAY_LABEL;
}

export function getEmployeeTaskPriority(task: Partial<EmployeeTaskDto>): EmployeeTaskPriority {
  return task.priority && task.priority in PRIORITY_LABELS ? task.priority : 'MEDIUM';
}

export function getEmployeeTaskSortScore(task: EmployeeTaskDto): number {
  const status = getEmployeeTaskStatus(task);
  const priority = getEmployeeTaskPriority(task);
  let score = 0;
  if (task.isOverdue === true && status !== 'DONE' && status !== 'CANCELLED') score += 100000;
  score += STATUS_SCORE[status];
  score += PRIORITY_SCORE[priority];
  return score;
}

export function sortEmployeeTasks(tasks?: EmployeeTaskDto[]): EmployeeTaskDto[] {
  const list = Array.isArray(tasks) ? tasks : [];
  return [...list].sort((a, b) => {
    const scoreDiff = getEmployeeTaskSortScore(b) - getEmployeeTaskSortScore(a);
    if (scoreDiff !== 0) return scoreDiff;

    const dueDiff = safeTime(a.dueDate) - safeTime(b.dueDate);
    if (dueDiff !== 0) return dueDiff;

    return safeUpdatedTime(b.updatedAt) - safeUpdatedTime(a.updatedAt);
  });
}

export function uniqueEmployeeTasks(tasks?: EmployeeTaskDto[]): EmployeeTaskDto[] {
  const list = Array.isArray(tasks) ? tasks : [];
  const map = new Map<number, EmployeeTaskDto>();
  list.forEach((task) => map.set(task.id, task));
  return Array.from(map.values());
}

export function isActiveTaskOverdue(task: Partial<EmployeeTaskDto>): boolean {
  const status = getEmployeeTaskStatus(task);
  return task.isOverdue === true && status !== 'DONE' && status !== 'CANCELLED';
}

export function formatTaskDeadline(dueDate?: string | null): string {
  if (!dueDate) return '-';
  const parsed = dayjs(dueDate);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : '-';
}

export function getTaskDeadlineLabel(task: Partial<EmployeeTaskDto>): string {
  const formatted = formatTaskDeadline(task.dueDate);
  if (isActiveTaskOverdue(task)) return `已逾期：${formatted}`;
  return `截止：${formatted}`;
}
