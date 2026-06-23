import { useCallback, useEffect, useMemo, useState } from 'react';
import { message } from 'antd';
import { fetchAlibabaAccounts } from '../lib/alibabaAccountApi';
import type { AlibabaAccount } from '../types/alibabaAccount';

interface UseAlibabaAccountsOptions {
  enabledOnly?: boolean;
  autoLoad?: boolean;
}

export function useAlibabaAccounts(options: UseAlibabaAccountsOptions = {}) {
  const { enabledOnly = false, autoLoad = true } = options;
  const [accounts, setAccounts] = useState<AlibabaAccount[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchAlibabaAccounts();
      setAccounts(Array.isArray(list) ? list : []);
    } catch (err) {
      setAccounts([]);
      message.error(err instanceof Error ? err.message : '获取 1688 账号失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoLoad) reload();
  }, [autoLoad, reload]);

  const visibleAccounts = useMemo(
    () => (enabledOnly ? accounts.filter((a) => a.enabled) : accounts),
    [accounts, enabledOnly],
  );

  const defaultAccount = useMemo(
    () => accounts.find((a) => a.isDefault && a.enabled) ?? visibleAccounts[0] ?? null,
    [accounts, visibleAccounts],
  );

  return {
    accounts: visibleAccounts,
    allAccounts: accounts,
    loading,
    reload,
    defaultAccount,
    hasAccounts: accounts.length > 0,
    hasEnabledAccounts: visibleAccounts.length > 0,
  };
}
