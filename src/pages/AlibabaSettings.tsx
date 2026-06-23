import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card, Button, Tag, Typography, Space, Table, message, Popconfirm, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import AlibabaAccountFormModal from '../components/AlibabaAccountFormModal';
import { useAlibabaAccounts } from '../hooks/useAlibabaAccounts';
import {
  createAlibabaAccount,
  disableAlibabaAccount,
  setDefaultAlibabaAccount,
  updateAlibabaAccount,
  validateAlibabaAccount,
} from '../lib/alibabaAccountApi';
import type { AlibabaAccount, AlibabaAccountFormValues } from '../types/alibabaAccount';
import { getAuthStatusDisplay, getTokenTypeLabel } from '../types/alibabaAccount';

const { Title, Text } = Typography;

const API = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : '/api';

function fmtDate(iso?: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function AlibabaSettings() {
  const { accounts, loading, reload } = useAlibabaAccounts();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AlibabaAccount | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [validatingId, setValidatingId] = useState<number | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authResult = params.get('alibaba_auth');
    if (authResult === 'success') {
      message.success('1688 账号授权成功！');
      window.history.replaceState({}, '', window.location.pathname);
      reload();
    } else if (authResult === 'error') {
      const msg = params.get('msg') ?? '授权失败';
      message.error(`1688 授权失败: ${msg}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [reload]);

  const handleAuthorizeOAuth = () => {
    window.location.href = `${API}/alibaba/authorize`;
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (record: AlibabaAccount) => {
    setEditing(record);
    setFormOpen(true);
  };

  const handleFormSubmit = async (values: AlibabaAccountFormValues) => {
    setSubmitting(true);
    try {
      if (editing) {
        const updated = await updateAlibabaAccount(editing, values);
        message.success(updated ? '账号已更新' : '无修改内容');
      } else {
        await createAlibabaAccount(values);
        message.success('1688 账号已添加');
      }
      setFormOpen(false);
      setEditing(null);
      await reload();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleValidate = useCallback(async (record: AlibabaAccount) => {
    setValidatingId(record.id);
    try {
      const result = await validateAlibabaAccount(record.id);
      if (result.valid === true) {
        message.success(result.message || 'Token 验证通过');
      } else {
        message.warning(result.message || 'Token 验证未通过，请检查 token 是否有效');
      }
      await reload();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Token 验证失败');
    } finally {
      setValidatingId(null);
    }
  }, [reload]);

  const handleSetDefault = useCallback(async (record: AlibabaAccount) => {
    setActionId(record.id);
    try {
      await setDefaultAlibabaAccount(record.id);
      message.success(`已将「${record.name}」设为默认账号`);
      await reload();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '设置默认账号失败');
    } finally {
      setActionId(null);
    }
  }, [reload]);

  const handleDisable = useCallback(async (record: AlibabaAccount) => {
    setActionId(record.id);
    try {
      await disableAlibabaAccount(record.id);
      message.success(`已禁用「${record.name}」`);
      await reload();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '禁用失败');
    } finally {
      setActionId(null);
    }
  }, [reload]);

  const columns = useMemo<ColumnsType<AlibabaAccount>>(() => [
    {
      title: '账号名称',
      dataIndex: 'name',
      width: 160,
      render: (name: string) => <Text strong>{name || '-'}</Text>,
    },
    {
      title: 'Token 类型',
      dataIndex: 'tokenType',
      width: 150,
      render: (v: string) => getTokenTypeLabel(v),
    },
    {
      title: '授权状态',
      dataIndex: 'authStatus',
      width: 100,
      render: (v: string) => {
        const { label, color } = getAuthStatusDisplay(v);
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: '默认',
      dataIndex: 'isDefault',
      width: 72,
      align: 'center',
      render: (v: boolean) => (v ? <Tag color="blue">默认</Tag> : '-'),
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 72,
      align: 'center',
      render: (v: boolean) => (
        v ? <Tag color="success">启用</Tag> : <Tag color="default">禁用</Tag>
      ),
    },
    {
      title: 'Token',
      dataIndex: 'accessTokenMasked',
      width: 140,
      render: (v: string | null) => (
        <Text code style={{ fontSize: 12 }}>{v || '—'}</Text>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 168,
      render: (v: string | null) => <Text type="secondary" style={{ fontSize: 12 }}>{fmtDate(v)}</Text>,
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 280,
      render: (_: unknown, record) => (
        <Space size={4} wrap>
          <Button
            type="link"
            size="small"
            icon={<SafetyCertificateOutlined />}
            loading={validatingId === record.id}
            onClick={() => handleValidate(record)}
          >
            验证
          </Button>
          <Button type="link" size="small" onClick={() => openEdit(record)}>编辑</Button>
          {!record.isDefault && record.enabled ? (
            <Popconfirm
              title="设为默认账号？"
              description={`将「${record.name}」设为系统默认 1688 账号。`}
              okText="确认"
              cancelText="取消"
              onConfirm={() => handleSetDefault(record)}
            >
              <Button type="link" size="small" loading={actionId === record.id}>设为默认</Button>
            </Popconfirm>
          ) : null}
          {getTokenTypeLabel(record.tokenType).includes('OAuth') ? (
            <Tooltip title="OAuth 账号重新授权">
              <Button type="link" size="small" icon={<LinkOutlined />} onClick={handleAuthorizeOAuth}>
                授权
              </Button>
            </Tooltip>
          ) : null}
          {record.enabled ? (
            <Popconfirm
              title="禁用此账号？"
              description="禁用后采购页将无法选择该账号，已有数据不受影响。"
              okText="确认禁用"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => handleDisable(record)}
            >
              <Button type="link" size="small" danger loading={actionId === record.id}>禁用</Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ], [actionId, validatingId, handleDisable, handleSetDefault, handleValidate]);

  return (
    <div style={{ maxWidth: 1200 }}>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #ff6a00, #ff9248)' }}
          >
            <span style={{ fontSize: 20 }}>🏭</span>
          </div>
          <div>
            <Title level={4} style={{ margin: 0, fontWeight: 700 }}>1688 开放平台</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>管理多个 1688 账号与企业自用永久 token</Text>
          </div>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={reload} loading={loading}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ background: '#ff6a00', borderColor: '#ff6a00' }}>
            添加 1688 账号
          </Button>
        </Space>
      </div>

      <Card style={{ borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }} bodyStyle={{ padding: 20 }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={accounts}
          loading={loading}
          size="middle"
          scroll={{ x: 'max-content' }}
          pagination={accounts.length > 10 ? { pageSize: 10, showSizeChanger: false } : false}
          locale={{ emptyText: '暂无 1688 账号，请点击「添加 1688 账号」' }}
        />
      </Card>

      <AlibabaAccountFormModal
        open={formOpen}
        editing={editing}
        submitting={submitting}
        onCancel={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}
