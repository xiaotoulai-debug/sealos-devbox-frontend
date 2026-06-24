/**
 * 每日登记提交资格控制
 *
 * 业务规则（已确认）：
 *   - 运营专员：可提交 / 修改每日登记
 *   - 运营主管：仅可查看每日登记看板，不可提交
 *   - 其他岗位：只要拥有 MENU_DASHBOARD_DAILY 权限，可查看页面，但不可提交
 *
 * 看板查看权限由 RBAC 权限码 MENU_DASHBOARD_DAILY 独立控制，与本文件无关。
 */

/** 有权提交每日登记的角色名列表（仅运营专员） */
export const DAILY_SUBMIT_ROLE_NAMES = ['运营专员'] as const;

/** 判断角色名是否有资格提交每日登记（仅运营专员） */
export function isDailyReportUser(roleName?: string | null): boolean {
  if (!roleName) return false;
  return roleName === '运营专员';
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

/**
 * 当前登录用户是否可提交每日登记。
 * 仅运营专员返回 true；运营主管及其他岗位返回 false。
 */
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
