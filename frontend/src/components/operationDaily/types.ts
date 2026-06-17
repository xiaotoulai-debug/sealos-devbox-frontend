export type OperationRange = '7d' | '30d';

export type OperationTaskType =
  | 'PRODUCT_SELECTION'
  | 'PRODUCT_LISTING'
  | 'APPROVED_COUNT'
  | 'SHIPMENT_COUNT'
  | 'OTHER';

export type OperationPlatform =
  | 'SHEIN'
  | 'TEMU'
  | 'ALIEXPRESS'
  | 'EMAG'
  | 'AMAZON'
  | 'OTHER';

export type OperationStatus = 'DONE' | 'IN_PROGRESS' | 'BLOCKED';

export type DailyReportTaskType =
  | 'PRODUCT_SELECTION'
  | 'PRODUCT_LISTING'
  | 'APPROVED_COUNT'
  | 'SHIPMENT_COUNT'
  | 'OTHER';

export type DailyTaskMetricType = DailyReportTaskType;

export type DailyWorkdayStatus = 'WORKDAY' | 'REST' | 'PENDING';

export interface OperationSummaryCards {
  registeredUserCount?: number | null;
  unregisteredUserCount?: number | null;
  productSelectionCount?: number | null;
  productListingCount?: number | null;
  approvedCount?: number | null;
  shipmentCount?: number | null;
  otherCount?: number | null;
}

export interface MonthlySummaryCards {
  yesterdayRegisteredCount?: number | null;
  yesterdayMissingCount?: number | null;
  yesterdayRequired?: boolean | null;
  yesterdayWorkdayStatus?: DailyWorkdayStatus | null;
  yesterdayMessage?: string | null;
  monthlyProductSelectionCount?: number | null;
  monthlyProductListingCount?: number | null;
  monthlyApprovedCount?: number | null;
  monthlyShipmentCount?: number | null;
}

export interface EmployeeRankingItem {
  userId: number;
  name: string;
  roleName?: string | null;
  registered?: boolean | null;
  productSelectionCount?: number | null;
  productListingCount?: number | null;
  approvedCount?: number | null;
  shipmentCount?: number | null;
  otherCount?: number | null;
  totalQuantity?: number | null;
  score?: number | null;
  hasBlockedTask?: boolean | null;
}

export interface TaskUserBrief {
  userId: number;
  name: string;
  roleName?: string | null;
}

export interface MonthlyScoreTopItem {
  userId: number;
  name: string;
  roleName?: string | null;
  score?: number | null;
  monthlyScore?: number | null;
  rank?: number | null;
  scoreText?: string | null;
  scoreBreakdown?: string | null;
}

export interface OperationUserBrief {
  userId: number;
  name: string;
}

export interface BlockedItem {
  id: number;
  userId: number;
  name: string;
  taskType: OperationTaskType;
  blockerReason?: string | null;
}

export interface OperationTrendPoint {
  date: string;
  productSelectionCount?: number | null;
  productListingCount?: number | null;
  approvedCount?: number | null;
  shipmentCount?: number | null;
  otherCount?: number | null;
}

export interface OperationDashboardData {
  summaryCards?: OperationSummaryCards | null;
  employeeRankings?: EmployeeRankingItem[];
  missingUsers?: OperationUserBrief[];
  zeroOutputUsers?: OperationUserBrief[];
  blockedItems?: BlockedItem[];
  trendSeries?: OperationTrendPoint[];
}

export interface HeatmapCell {
  date: string;
  value?: number | null;
  text?: string | null;
  submitted?: boolean | null;
  isFuture?: boolean | null;
  reportId?: number | null;
  workdayStatus?: DailyWorkdayStatus | null;
}

export interface HeatmapTaskRow {
  metricType: DailyTaskMetricType;
  metricName: string;
  dailyValues?: HeatmapCell[];
  total?: number | null;
}

export interface HeatmapEmployee {
  userId: number;
  name: string;
  roleName?: string | null;
  rows?: HeatmapTaskRow[];
}

export interface MonthlyHeatmap {
  month: string;
  days?: string[];
  dayWorkdayStatuses?: Record<string, DailyWorkdayStatus>;
  employees?: HeatmapEmployee[];
}

export interface MonthlyOverviewData {
  summaryCards?: MonthlySummaryCards | null;
  yesterdayMissingUsers?: TaskUserBrief[];
  yesterdayRequired?: boolean | null;
  yesterdayWorkdayStatus?: DailyWorkdayStatus | null;
  yesterdayMessage?: string | null;
  monthlyScoreTop?: MonthlyScoreTopItem[];
  heatmap?: MonthlyHeatmap | null;
}

export interface HeatmapDetailTarget {
  userId: number;
  name: string;
  roleName?: string | null;
  date: string;
  metricType?: DailyTaskMetricType;
}

export interface OperationLogPayload {
  workDate: string;
  taskType: OperationTaskType;
  platform?: OperationPlatform;
  shopId?: number;
  quantity: number;
  status: OperationStatus;
  detail?: string;
  links?: string[];
  blockerReason?: string;
}

export interface OperationLogRecord extends OperationLogPayload {
  id: number;
  userId?: number;
  userName?: string | null;
  name?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
}

export interface DailyReportItem {
  taskType: DailyReportTaskType;
  taskName: string;
  quantity: number;
  linksText?: string;
  detail?: string;
  blockerReason?: string;
}

export interface DailyReportPayloadItem {
  taskType: DailyReportTaskType;
  quantity: number;
  links: string[];
  detail?: string;
  blockerReason?: string;
}

export interface DailyReport {
  reportId?: number | null;
  workDate: string;
  submitted: boolean;
  canEdit: boolean;
  editCount: number;
  maxEditCount: number;
  items: DailyReportItem[];
  workdayStatus?: DailyWorkdayStatus | null;
  workdayHint?: string | null;
}

export interface DailyReportPayload {
  workDate: string;
  items: DailyReportPayloadItem[];
}

export interface ShopOption {
  id: number;
  shopName: string;
  platform: string;
  region?: string | null;
  site?: string | null;
}

export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}

export const TASK_TYPE_LABELS: Record<OperationTaskType, string> = {
  PRODUCT_SELECTION: '选品数量',
  PRODUCT_LISTING: '上新数量',
  APPROVED_COUNT: '合规数量',
  SHIPMENT_COUNT: '发货数量',
  OTHER: '其他说明',
};

export const STATUS_LABELS: Record<OperationStatus, string> = {
  DONE: '已完成',
  IN_PROGRESS: '处理中',
  BLOCKED: '被阻塞',
};

export const PLATFORM_LABELS: Record<OperationPlatform, string> = {
  SHEIN: 'SHEIN',
  TEMU: 'TEMU',
  ALIEXPRESS: '速卖通',
  EMAG: 'eMAG',
  AMAZON: 'Amazon',
  OTHER: '其他',
};

export const FIXED_REPORT_ITEMS: Array<{ taskType: DailyReportTaskType; taskName: string }> = [
  { taskType: 'PRODUCT_SELECTION', taskName: '选品数量' },
  { taskType: 'PRODUCT_LISTING', taskName: '上新数量' },
  { taskType: 'APPROVED_COUNT', taskName: '合规数量' },
  { taskType: 'SHIPMENT_COUNT', taskName: '发货数量' },
  { taskType: 'OTHER', taskName: '其他说明' },
];
