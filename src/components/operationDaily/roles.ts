/** 每日登记相关人员角色（运营专员 + 运营主管） */
export const DAILY_REPORT_ROLE_NAMES = ['运营专员', '运营主管'] as const;

/** 判断角色名是否属于每日登记相关人员 */
export function isDailyReportUser(roleName?: string | null): boolean {
  if (!roleName) return false;
  return roleName === '运营专员' || roleName === '运营主管';
}

type RoleTextSource = {
  role?: unknown;
  roleCode?: unknown;
  roleName?: unknown;
  roles?: unknown;
};

function normalizeRoleText(value: unknown): string[] {
  if (typeof value === 'string' || typeof value === 'number') return [String(value)];
  if (!value || typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  return [record.code, record.name, record.roleCode, record.roleName]
    .filter((item): item is string | number => typeof item === 'string' || typeof item === 'number')
    .map(String);
}

/** 当前登录用户是否可提交每日登记（仅运营专员 / 运营主管） */
export function canSubmitDailyReport(user: RoleTextSource | null): boolean {
  if (!user) return false;
  const roleParts = [
    ...normalizeRoleText(user.role),
    ...normalizeRoleText(user.roleCode),
    ...normalizeRoleText(user.roleName),
    ...(Array.isArray(user.roles) ? user.roles.flatMap(normalizeRoleText) : []),
  ];
  return roleParts.some((name) => isDailyReportUser(name));
}
