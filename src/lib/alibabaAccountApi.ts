import request from './request';
import {
  buildAlibabaAccountUpdatePayload,
  normalizeAlibabaAccount,
  unwrapAlibabaAccountList,
  type AlibabaAccount,
  type AlibabaAccountFormValues,
} from '../types/alibabaAccount';

type ApiRes<T> = { code: number; data?: T; message?: string };

function assertOk<T>(res: ApiRes<T>, fallback: string): T {
  if (res.code !== 200) {
    throw new Error(res.message ?? fallback);
  }
  return res.data as T;
}

async function patchAlibabaAccount(id: number, payload: Record<string, unknown>): Promise<void> {
  const { data: res } = await request.patch<ApiRes<unknown>>(`/alibaba/accounts/${id}`, payload);
  assertOk(res, '更新 1688 账号失败');
}

export async function fetchAlibabaAccounts(): Promise<AlibabaAccount[]> {
  const { data: res } = await request.get<ApiRes<unknown>>('/alibaba/accounts');
  return unwrapAlibabaAccountList(assertOk(res, '获取 1688 账号列表失败'));
}

export async function createAlibabaAccount(values: AlibabaAccountFormValues): Promise<AlibabaAccount> {
  const payload: Record<string, unknown> = {
    accountName: values.accountName.trim(),
    accessToken: values.accessToken?.trim(),
    loginId: values.loginId?.trim() || undefined,
    memberId: values.memberId?.trim() || undefined,
    remark: values.remark?.trim() || undefined,
    isDefault: values.isDefault === true,
  };
  const { data: res } = await request.post<ApiRes<Record<string, unknown>>>('/alibaba/accounts', payload);
  const data = assertOk(res, '添加 1688 账号失败');
  if (data && typeof data === 'object' && 'id' in data) {
    return normalizeAlibabaAccount(data as Record<string, unknown>);
  }
  return unwrapAlibabaAccountList(data)[0];
}

export async function updateAlibabaAccount(
  original: AlibabaAccount,
  values: AlibabaAccountFormValues,
): Promise<boolean> {
  const payload = buildAlibabaAccountUpdatePayload(original, values);
  if (Object.keys(payload).length === 0) {
    return false;
  }
  await patchAlibabaAccount(original.id, payload);
  return true;
}

export async function validateAlibabaAccount(id: number): Promise<{ valid?: boolean; message?: string }> {
  const { data: res } = await request.post<ApiRes<{ valid?: boolean; message?: string }>>(
    `/alibaba/accounts/${id}/validate`,
  );
  const data = assertOk(res, 'Token 验证失败');
  return data ?? {};
}

export async function setDefaultAlibabaAccount(id: number): Promise<void> {
  await patchAlibabaAccount(id, { isDefault: true });
}

export async function disableAlibabaAccount(id: number): Promise<void> {
  await patchAlibabaAccount(id, { enabled: false });
}
