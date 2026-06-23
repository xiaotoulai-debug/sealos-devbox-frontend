import { useState, useEffect, useCallback } from 'react';
import { SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import request from '../lib/request';

function formatRelativeTime(t: string): string {
  const d = dayjs(t);
  const now = dayjs();
  const diffM = now.diff(d, 'minute');
  if (diffM < 1) return '刚刚';
  if (diffM < 60) return `${diffM}分钟前`;
  const diffH = now.diff(d, 'hour');
  if (diffH < 24) return `${diffH}小时前`;
  const diffD = now.diff(d, 'day');
  if (diffD < 30) return `${diffD}天前`;
  return d.format('MM-DD HH:mm');
}

interface SyncStatusBarProps {
  shopId: number | null;
}

export default function SyncStatusBar({ shopId }: SyncStatusBarProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!shopId) return;
    try {
      const { data: res } = await request.get<{
        code: number;
        isSyncing?: boolean;
        is_syncing?: boolean;
        lastSyncAt?: string;
        last_sync_at?: string;
      }>('/orders', { params: { shopId, page: 1, pageSize: 1 } });
      if (res.code === 200) {
        const r = res as { isSyncing?: boolean; is_syncing?: boolean; lastSyncAt?: string; last_sync_at?: string };
        const syncing = r.isSyncing ?? r.is_syncing ?? false;
        const last = r.lastSyncAt ?? r.last_sync_at;
        setIsSyncing(syncing);
        if (last) setLastSyncAt(last);
      }
    } catch {
      // 静默失败
    }
  }, [shopId]);

  useEffect(() => {
    const tid = setTimeout(() => {
      void fetchStatus();
    }, 0);
    const timer = setInterval(fetchStatus, 10000);
    return () => {
      clearTimeout(tid);
      clearInterval(timer);
    };
  }, [fetchStatus]);

  if (!shopId) return null;

  const lastText = lastSyncAt ? formatRelativeTime(lastSyncAt) : null;
  const hasAny = isSyncing || lastText;

  if (!hasAny) return null;

  return (
    <div
      style={{
        background: isSyncing ? '#e6f4ff' : '#f8fafc',
        borderBottom: '1px solid #f0f0f0',
        padding: '6px 24px',
        fontSize: 12,
        color: '#64748b',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {isSyncing && <SyncOutlined spin style={{ color: '#1677ff' }} />}
      <span>
        {isSyncing ? '后台同步中...' : ''}
        {lastText && (
          <span>
            {isSyncing ? ' (' : ''}
            上一次同步：{lastText}
            {isSyncing ? ')' : ''}
          </span>
        )}
      </span>
    </div>
  );
}
