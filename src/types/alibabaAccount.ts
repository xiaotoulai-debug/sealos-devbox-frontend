export type AlibabaAccountFilter = number | 'ALL';

export interface AlibabaAccount {
  id: number;
  name: string;
  tokenType: string;
  authStatus: string;
  isDefault: boolean;
  enabled: boolean;
  accessTokenMasked: string | null;
  loginId: string | null;
  memberId: string | null;
  remark: string | null;
  updatedAt: string | null;
}

export interface AlibabaAccountFormValues {
  accountName: string;
  accessToken?: string;
  loginId?: string;
  memberId?: string;
  remark?: string;
  isDefault?: boolean;
  enabled?: boolean;
}

function readBool(raw: unknown, defaultValue = false): boolean {
  if (raw === undefined || raw === null) return defaultValue;
  if (raw === true || raw === 1 || raw === '1' || raw === 'true') return true;
  if (raw === false || raw === 0 || raw === '0' || raw === 'false') return false;
  return defaultValue;
}

function trimOrNull(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeAlibabaAccount(raw: Record<string, unknown>): AlibabaAccount {
  const enabledRaw = raw.enabled ?? raw.isEnabled ?? raw.is_enabled;
  return {
    id: Number(raw.id),
    name: String(raw.name ?? raw.accountName ?? raw.account_name ?? '').trim(),
    tokenType: String(raw.tokenType ?? raw.token_type ?? 'ENTERPRISE_STATIC'),
    authStatus: String(raw.authStatus ?? raw.auth_status ?? raw.status ?? 'UNKNOWN'),
    isDefault: readBool(raw.isDefault ?? raw.is_default),
    enabled: readBool(enabledRaw, true),
    accessTokenMasked: (raw.accessTokenMasked ?? raw.access_token_masked ?? null) as string | null,
    loginId: (raw.loginId ?? raw.login_id ?? null) as string | null,
    memberId: (raw.memberId ?? raw.member_id ?? null) as string | null,
    remark: (raw.remark ?? null) as string | null,
    updatedAt: (raw.updatedAt ?? raw.updated_at ?? null) as string | null,
  };
}

export function unwrapAlibabaAccountList(data: unknown): AlibabaAccount[] {
  let rawList: unknown[] = [];
  if (Array.isArray(data)) {
    rawList = data;
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    rawList = Array.isArray(obj.list)
      ? obj.list
      : Array.isArray(obj.items)
        ? obj.items
        : Array.isArray(obj.accounts)
          ? obj.accounts
          : [];
  }
  return rawList
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => normalizeAlibabaAccount(item));
}

export function getTokenTypeLabel(tokenType: string): string {
  const upper = tokenType.toUpperCase();
  if (upper.includes('OAUTH')) return 'OAuth';
  if (upper.includes('ENTERPRISE') || upper.includes('STATIC') || upper.includes('PERMANENT')) {
    return '企业自用永久 token';
  }
  return tokenType || '-';
}

export function getAuthStatusDisplay(status: string): { label: string; color: string } {
  const upper = status.toUpperCase();
  if (upper === 'VALID' || upper === 'ACTIVE' || upper === 'OK' || upper === 'AUTHORIZED') {
    return { label: '有效', color: 'success' };
  }
  if (upper === 'EXPIRED' || upper === 'INVALID' || upper === 'FAILED') {
    return { label: '无效', color: 'error' };
  }
  if (upper === 'PENDING' || upper === 'UNKNOWN') {
    return { label: '待验证', color: 'warning' };
  }
  return { label: status || '未知', color: 'default' };
}

export function resolveAlibabaAuthId(filter: AlibabaAccountFilter): number | undefined {
  return filter === 'ALL' ? undefined : filter;
}

export function withAlibabaAuthBody<T extends Record<string, unknown>>(
  payload: T,
  authId?: number,
): T & { alibabaAuthId?: number } {
  if (authId == null) return payload;
  return { ...payload, alibabaAuthId: authId };
}

export function alibabaAuthQueryParams(authId?: number): Record<string, number> {
  if (authId == null) return {};
  return { alibabaAuthId: authId };
}

export function resolveRecordAlibabaAuthId(record: {
  alibabaAuthId?: number | null;
  alibabaAccountId?: number | null;
}): number | undefined {
  const raw = record.alibabaAuthId ?? record.alibabaAccountId;
  if (raw == null || Number.isNaN(Number(raw))) return undefined;
  return Number(raw);
}

export function pickInitialAlibabaAuthId(options: {
  recordAuthId?: number;
  filterAuthId?: number;
  defaultAccountId?: number;
  firstEnabledAccountId?: number;
}): number | undefined {
  return (
    options.recordAuthId
    ?? options.filterAuthId
    ?? options.defaultAccountId
    ?? options.firstEnabledAccountId
  );
}

/** 编辑账号时构建最小 PATCH payload，仅包含实际变更字段 */
export function buildAlibabaAccountUpdatePayload(
  original: AlibabaAccount,
  values: AlibabaAccountFormValues,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  const accountName = values.accountName.trim();
  if (accountName && accountName !== original.name) {
    payload.accountName = accountName;
  }

  const token = values.accessToken?.trim();
  if (token) {
    payload.accessToken = token;
  }

  const loginId = trimOrNull(values.loginId);
  if (loginId !== original.loginId) {
    payload.loginId = loginId;
  }

  const memberId = trimOrNull(values.memberId);
  if (memberId !== original.memberId) {
    payload.memberId = memberId;
  }

  const remark = trimOrNull(values.remark);
  if (remark !== original.remark) {
    payload.remark = remark;
  }

  // 仅允许设为默认；禁止提交 isDefault:false（尤其不能误取消当前默认账号）
  if (values.isDefault === true && !original.isDefault) {
    payload.isDefault = true;
  }

  if (values.enabled != null && values.enabled !== original.enabled) {
    payload.enabled = values.enabled;
  }

  return payload;
}
