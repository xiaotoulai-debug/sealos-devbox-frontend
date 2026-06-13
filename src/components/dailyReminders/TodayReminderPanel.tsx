import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, Space, Spin, Typography } from 'antd';
import { BellOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { hasPermission } from '../../lib/auth';
import { fetchTodayReminders, getBackendMessage } from './api';
import ReminderItem from './ReminderItem';
import ReminderTemplateManager from './ReminderTemplateManager';
import type { DailyReminderTodayItem } from './types';
import { sortTodayReminders } from './types';

const { Text, Title } = Typography;

export default function TodayReminderPanel() {
  const [rows, setRows] = useState<DailyReminderTodayItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [managerOpen, setManagerOpen] = useState(false);
  const today = useMemo(() => dayjs().format('YYYY-MM-DD'), []);
  const allowManage = hasPermission('ACTION_DASHBOARD_REMINDER_TEMPLATE_MANAGE');

  const loadToday = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await fetchTodayReminders(today);
      setRows(sortTodayReminders(payload));
    } catch (err) {
      const msg = getBackendMessage(err, '加载今日必做提醒失败');
      setRows([]);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  const list = Array.isArray(rows) ? rows : [];

  return (
    <>
      <Card
        style={{ borderRadius: 14, border: '1px solid #e8eef7', marginBottom: 14, boxShadow: 'none', height: 260, overflow: 'hidden' }}
        styles={{ body: { padding: 12, height: '100%', display: 'flex', flexDirection: 'column' } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <Space size={8} align="center">
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: '#FEF2F2',
              color: '#DC2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
            }}>
              <BellOutlined />
            </div>
            <div>
              <Title level={5} style={{ margin: 0, color: '#0f172a', fontSize: 16 }}>今日必做提醒</Title>
              <Text type="secondary" style={{ fontSize: 12 }}>每日运营关键事项，按优先级排序</Text>
            </div>
          </Space>
          <Space size={8} wrap>
            <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={loadToday}>刷新</Button>
            {allowManage && (
              <Button size="small" icon={<SettingOutlined />} onClick={() => setManagerOpen(true)}>
                管理提醒模板
              </Button>
            )}
          </Space>
        </div>

        {error && <Alert type="warning" showIcon message={error} style={{ borderRadius: 10, marginBottom: 8 }} />}

        <Spin spinning={loading} style={{ flex: 1, minHeight: 0 }}>
          {list.length === 0 ? (
            <div style={{ flex: 1, minHeight: 112, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="今日暂无必做提醒" />
            </div>
          ) : (
            <div style={{ height: 186, overflowY: 'auto', paddingRight: 4 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 220px))', gap: 12 }}>
                {list.map((item, index) => (
                  <ReminderItem key={`${item.id}-${index}`} item={item} rank={index + 1} />
                ))}
              </div>
            </div>
          )}
        </Spin>
      </Card>

      <ReminderTemplateManager
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        onChanged={loadToday}
      />
    </>
  );
}
