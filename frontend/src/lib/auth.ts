// ── 认证 & 权限工具函数 ────────────────────────────────────────
// 所有与 localStorage 中 token / user / permissions 相关的读写操作
// 统一在此模块中管理，避免各页面散落重复代码。

export interface StoredUser {
  id:       number;
  username: string;
  name:     string;
  avatar:   string | null;
  role: {
    id:       number;
    name:     string;
    isAdmin?: boolean; // 后端登录接口返回，true = 超管，无需过滤菜单
  };
}

// ── 读取已登录用户 ─────────────────────────────────────────────
export function getStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

// ── 读取权限码数组 ─────────────────────────────────────────────
// 返回值语义：
//   null   → localStorage 中没有 'permissions' 键（老会话/未登录），视为超管（向后兼容）
//   []     → 后端明确返回空数组（该用户无任何权限）
//   [...]  → 用户拥有的权限码列表，用于菜单过滤
export function getStoredPermissions(): string[] | null {
  try {
    const raw = localStorage.getItem('permissions');
    if (raw === null || raw === 'null') return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}

// 超级管理员角色名称（与数据库 Role.name 字段对齐，由后端统一维护）
const SUPER_ADMIN_ROLE_NAME = '超级管理员';

// ── 判断是否为管理员 ───────────────────────────────────────────
// 判断依据（优先级从高到低）：
//   1. 后端登录时在 role 中返回 isAdmin: true（推荐，最严谨）
//   2. role.name === '超级管理员'（兜底：后端未返回 isAdmin 字段时生效）
//   3. localStorage 中从未存储过 permissions（老会话向后兼容）
// 若以上均为 false，则视为普通用户，进入 permissions 数组比对流程。
export function isAdminUser(): boolean {
  const user = getStoredUser();
  if (user?.role?.isAdmin === true) return true;
  if (user?.role?.name === SUPER_ADMIN_ROLE_NAME) return true;
  // 老会话：permissions 键不存在，默认不过滤菜单
  return getStoredPermissions() === null;
}

// ── 检查单个权限码 ─────────────────────────────────────────────
export function hasPermission(code: string): boolean {
  if (isAdminUser()) return true;
  const perms = getStoredPermissions();
  if (!perms) return true;
  return perms.includes(code);
}

// ── 从 /me 接口更新本地缓存 ────────────────────────────────────
// 将最新的 user 和 permissions 写回 localStorage，供刷新后的初始快照使用
export function writeAuthCache(user: StoredUser, permissions: string[] | null): void {
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('permissions', JSON.stringify(permissions));
}

// ── Token 是否存在 ─────────────────────────────────────────────
export function hasToken(): boolean {
  return !!localStorage.getItem('token');
}

// ── 清除所有认证数据（登出时调用） ────────────────────────────
export function clearAuth(): void {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('permissions');
}
