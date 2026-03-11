import { useState, useEffect, useCallback } from 'react';
import {
  Card, Button, Tag, Typography, Space, Spin, Descriptions, message, Alert, Tooltip, Divider,
} from 'antd';
import {
  LinkOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  ReloadOutlined,
  ExclamationCircleFilled,
  SyncOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

const API = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : '/api';

interface AuthStatus {
  authorized: boolean;
  loginId?: string | null;
  memberId?: string | null;
  aliId?: string | null;
  expiresAt?: string | null;
  refreshExpiresAt?: string | null;
  tokenExpired?: boolean;
  refreshExpired?: boolean;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function remainingDays(iso?: string | null): string {
  if (!iso) return '-';
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return '已过期';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  return days > 0 ? `${days} 天 ${hours} 小时` : `${hours} 小时`;
}

export default function AlibabaSettings() {
  const [loading, setLoading]   = useState(true);
  const [status, setStatus]     = useState<AuthStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/alibaba/auth-status`, { headers });
      const json = await res.json();
      if (json.code === 200) {
        setStatus(json.data);
      } else {
        message.error(json.message ?? '获取状态失败');
      }
    } catch {
      message.error('网络请求失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authResult = params.get('alibaba_auth');
    if (authResult === 'success') {
      message.success('1688 账号授权成功！');
      window.history.replaceState({}, '', window.location.pathname);
      fetchStatus();
    } else if (authResult === 'error') {
      const msg = params.get('msg') ?? '授权失败';
      message.error(`1688 授权失败: ${msg}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [fetchStatus]);

  const handleAuthorize = () => {
    window.location.href = `${API}/alibaba/authorize`;
  };

  const handleRefreshToken = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${API}/alibaba/refresh-token`, { method: 'POST', headers });
      const json = await res.json();
      if (json.code === 200 && json.data?.refreshed) {
        message.success('Token 已成功刷新');
        fetchStatus();
      } else {
        message.warning(json.message ?? 'Token 刷新失败');
      }
    } catch {
      message.error('网络请求失败');
    } finally {
      setRefreshing(false);
    }
  };

  const authorized   = status?.authorized === true;
  const tokenExpired  = status?.tokenExpired === true;
  const needReAuth    = status?.refreshExpired === true;

  return (
    <div style={{ maxWidth: 800 }}>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
             style={{ background: 'linear-gradient(135deg, #ff6a00, #ff9248)' }}>
          <span style={{ fontSize: 20 }}>🏭</span>
        </div>
        <div>
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>1688 开放平台</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>管理 1688 账号授权与 API 对接状态</Text>
        </div>
      </div>

      <Card
        style={{ borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
        bodyStyle={{ padding: 28 }}
      >
        <div className="flex items-center justify-between mb-5">
          <Space size={12}>
            <Text strong style={{ fontSize: 15 }}>授权状态</Text>
            {loading ? (
              <Spin size="small" />
            ) : authorized ? (
              <Tag icon={<CheckCircleFilled />} color="success" style={{ fontSize: 13, padding: '2px 10px' }}>
                已授权
              </Tag>
            ) : needReAuth ? (
              <Tag icon={<CloseCircleFilled />} color="error" style={{ fontSize: 13, padding: '2px 10px' }}>
                已过期
              </Tag>
            ) : !status ? (
              <Tag color="default" style={{ fontSize: 13, padding: '2px 10px' }}>
                未绑定
              </Tag>
            ) : tokenExpired ? (
              <Tag icon={<ExclamationCircleFilled />} color="warning" style={{ fontSize: 13, padding: '2px 10px' }}>
                Token 待刷新
              </Tag>
            ) : (
              <Tag color="default" style={{ fontSize: 13, padding: '2px 10px' }}>
                未绑定
              </Tag>
            )}
          </Space>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchStatus} loading={loading}>
              刷新
            </Button>
          </Space>
        </div>

        {!loading && authorized && status && (
          <>
            <Descriptions column={1} size="small" bordered labelStyle={{ width: 160, fontWeight: 500, background: '#fafafa' }}>
              <Descriptions.Item label="账号">
                <Text strong>{status.loginId || status.memberId || '-'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="会员 ID">
                <Text copyable={{ text: status.memberId ?? '' }}>
                  {status.memberId || '-'}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Access Token 到期">
                <Space>
                  <Text>{fmtDate(status.expiresAt)}</Text>
                  {tokenExpired ? (
                    <Tag color="error" style={{ fontSize: 11 }}>已过期</Tag>
                  ) : (
                    <Tag color="blue" style={{ fontSize: 11 }}>剩余 {remainingDays(status.expiresAt)}</Tag>
                  )}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Refresh Token 到期">
                <Space>
                  <Text>{fmtDate(status.refreshExpiresAt)}</Text>
                  {status.refreshExpiresAt && (
                    needReAuth ? (
                      <Tag color="error" style={{ fontSize: 11 }}>已过期</Tag>
                    ) : (
                      <Tag color="green" style={{ fontSize: 11 }}>剩余 {remainingDays(status.refreshExpiresAt)}</Tag>
                    )
                  )}
                </Space>
              </Descriptions.Item>
            </Descriptions>

            <Divider style={{ margin: '20px 0 16px' }} />

            <Space>
              <Tooltip title="手动触发 Token 刷新（一般系统会在调用时自动续期）">
                <Button
                  icon={<SyncOutlined />}
                  loading={refreshing}
                  onClick={handleRefreshToken}
                  disabled={needReAuth}
                >
                  手动刷新 Token
                </Button>
              </Tooltip>
              <Button
                type="primary"
                danger
                ghost
                icon={<LinkOutlined />}
                onClick={handleAuthorize}
              >
                重新授权
              </Button>
            </Space>
          </>
        )}

        {!loading && !authorized && !needReAuth && !status?.loginId && (
          <div className="text-center py-10">
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
            <Title level={5} style={{ marginBottom: 8, color: '#475569' }}>尚未绑定 1688 账号</Title>
            <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
              绑定后可直接从系统向 1688 供应商下单，实现自动化采购
            </Text>
            <Button
              type="primary"
              size="large"
              icon={<LinkOutlined />}
              onClick={handleAuthorize}
              style={{ background: '#ff6a00', borderColor: '#ff6a00', borderRadius: 8, fontWeight: 600 }}
            >
              绑定 1688 账号
            </Button>
          </div>
        )}

        {!loading && needReAuth && (
          <Alert
            type="error"
            showIcon
            style={{ marginTop: 16 }}
            message="授权已完全过期"
            description="Refresh Token 已过期，系统无法自动续期。请点击下方按钮重新授权。"
            action={
              <Button type="primary" danger icon={<LinkOutlined />} onClick={handleAuthorize}>
                重新授权
              </Button>
            }
          />
        )}
      </Card>

      <Card
        style={{ borderRadius: 12, marginTop: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
        bodyStyle={{ padding: 28 }}
      >
        <Text strong style={{ fontSize: 15, marginBottom: 12, display: 'block' }}>接口配置</Text>
        <Descriptions column={1} size="small" bordered labelStyle={{ width: 160, fontWeight: 500, background: '#fafafa' }}>
          <Descriptions.Item label="App Key">
            <Text code>9058737</Text>
          </Descriptions.Item>
          <Descriptions.Item label="回调地址">
            <Text code copyable>
              {import.meta.env.VITE_API_URL
                ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api/alibaba/callback`
                : 'http://localhost:3001/api/alibaba/callback'}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="网关地址">
            <Text code>https://gw.open.1688.com/openapi</Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}
