import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Tag, Space,
  Popconfirm, Avatar, message, Badge, Tooltip, Typography, Skeleton,
} from 'antd';
import {
  UserAddOutlined, EditOutlined, StopOutlined,
  CheckCircleOutlined, DeleteOutlined, UserOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import request from '../lib/request';

const { Text } = Typography;

interface Role { id: number; name: string; }

interface UserRecord {
  id:        number;
  username:  string;
  name:      string;
  avatar:    string | null;
  status:    'ACTIVE' | 'INACTIVE';
  role:      Role;
  createdAt: string;
}

function getSelfId(): number | null {
  try {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as { id: number }).id : null;
  } catch { return null; }
}

// ── 骨架屏行（模拟 5 行用户数据） ───────────────────────────
function SkeletonRows() {
  return (
    <div className="px-6 py-4 space-y-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton.Avatar active size={36} />
          <div className="flex-1">
            <Skeleton.Input active size="small" style={{ width: '40%', marginBottom: 6 }} block />
            <Skeleton.Input active size="small" style={{ width: '25%' }} block />
          </div>
          <Skeleton.Input active size="small" style={{ width: 80 }} />
          <Skeleton.Input active size="small" style={{ width: 60 }} />
          <Skeleton.Input active size="small" style={{ width: 130 }} />
          <Skeleton.Button active size="small" style={{ width: 90 }} />
        </div>
      ))}
    </div>
  );
}

export default function UserManagement() {
  const selfId = getSelfId();

  const [users,    setUsers]    = useState<UserRecord[]>([]);
  const [loading,  setLoading]  = useState(true);   // 初始 true，首屏直接骨架屏
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [total,    setTotal]    = useState(0);
  const [roles,    setRoles]    = useState<Role[]>([]);
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [form] = Form.useForm();

  // useCallback：避免每次渲染重新生成函数引用
  const fetchUsers = useCallback(async (p: number, ps: number) => {
    setLoading(true);
    try {
      const { data: res } = await request.get<{
        code: number;
        data: { list: UserRecord[]; total: number };
        message: string;
      }>('/users', { params: { page: p, pageSize: ps } });

      if (res.code === 200 && res.data) {
        setUsers(Array.isArray(res.data.list) ? res.data.list : []);
        setTotal(res.data.total ?? 0);
      } else {
        message.error(res.message || '获取用户列表失败');
        setUsers([]);
      }
    } catch {
      message.error('请求失败，请检查网络或后端服务');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRoles = useCallback(async () => {
    try {
      const { data: res } = await request.get<{ code: number; data: Role[]; message: string }>('/roles');
      if (res.code === 200 && Array.isArray(res.data)) setRoles(res.data);
    } catch { /* 静默，不阻塞主列表 */ }
  }, []);

  useEffect(() => {
    fetchUsers(1, 15);
    fetchRoles();
  }, [fetchUsers, fetchRoles]);

  const openCreate = useCallback(() => {
    setEditingUser(null);
    form.resetFields();
    setModalOpen(true);
  }, [form]);

  const openEdit = useCallback((record: UserRecord) => {
    setEditingUser(record);
    form.setFieldsValue({ username: record.username, name: record.name, roleId: record.role.id, password: '' });
    setModalOpen(true);
  }, [form]);

  const handleSubmit = useCallback(async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      if (editingUser) {
        const payload: Record<string, unknown> = { name: values.name, roleId: values.roleId };
        if (values.password) payload.password = values.password;
        const { data: res } = await request.patch<{ code: number; message: string }>(
          `/users/${editingUser.id}`, payload,
        );
        if (res.code === 200) {
          message.success('用户信息已更新');
          setModalOpen(false);
          fetchUsers(page, pageSize);
        } else { message.error(res.message); }
      } else {
        const { data: res } = await request.post<{ code: number; message: string }>('/users', values);
        if (res.code === 200) {
          message.success('用户创建成功');
          setModalOpen(false);
          setPage(1);
          fetchUsers(1, pageSize);
        } else { message.error(res.message); }
      }
    } catch {
      message.error('操作失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }, [form, editingUser, page, pageSize, fetchUsers]);

  const handleToggleStatus = useCallback(async (record: UserRecord) => {
    const newStatus = record.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const { data: res } = await request.patch<{ code: number; message: string }>(
        `/users/${record.id}`, { status: newStatus },
      );
      if (res.code === 200) {
        message.success(newStatus === 'ACTIVE' ? '账号已启用' : '账号已禁用');
        // 乐观更新：不重新请求，直接修改本地状态
        setUsers((prev) => prev.map((u) => u.id === record.id ? { ...u, status: newStatus } : u));
      } else { message.error(res.message); }
    } catch { message.error('操作失败'); }
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    try {
      const { data: res } = await request.delete<{ code: number; message: string }>(`/users/${id}`);
      if (res.code === 200) {
        message.success('用户已删除');
        // 乐观更新：直接从本地列表移除
        setUsers((prev) => prev.filter((u) => u.id !== id));
        setTotal((t) => t - 1);
      } else { message.error(res.message); }
    } catch { message.error('删除失败'); }
  }, []);

  // useMemo：columns 只在 selfId 变化时重新生成，避免每次数据刷新重绘整列
  const columns = useMemo<ColumnsType<UserRecord>>(() => [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 64,
      render: (v: number) => <Text type="secondary" style={{ fontSize: 12 }}>#{v}</Text>,
    },
    {
      title: '账号信息',
      key: 'info',
      render: (_: unknown, row) => (
        <Space size={12}>
          <Avatar
            size={36}
            icon={<UserOutlined />}
            src={row.avatar ?? undefined}
            style={{ background: row.status === 'ACTIVE' ? '#2563EB' : '#d1d5db', flexShrink: 0 }}
          />
          <div>
            <p className="text-sm font-medium text-gray-800 mb-0 leading-tight">{row.name}</p>
            <p className="text-xs text-gray-400 mt-0.5 leading-tight font-mono">{row.username}</p>
          </div>
        </Space>
      ),
    },
    {
      title: '角色',
      key: 'role',
      width: 140,
      render: (_: unknown, row) => (
        <Tag color="blue" bordered={false} style={{ borderRadius: 20, padding: '2px 12px' }}>
          {row.role.name}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v: 'ACTIVE' | 'INACTIVE') => (
        <Badge
          status={v === 'ACTIVE' ? 'success' : 'default'}
          text={
            <span className={v === 'ACTIVE' ? 'text-emerald-600 font-medium' : 'text-gray-400'}>
              {v === 'ACTIVE' ? '启用' : '禁用'}
            </span>
          }
        />
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (v: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {new Date(v).toLocaleString('zh-CN', { hour12: false })}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      fixed: 'right',
      render: (_: unknown, row) => {
        const isSelf = row.id === selfId;
        return (
          <Space size={6}>
            <Tooltip title="编辑信息">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} style={{ borderRadius: 6 }} />
            </Tooltip>
            <Tooltip title={isSelf ? '不能修改自己的状态' : (row.status === 'ACTIVE' ? '点击禁用' : '点击启用')}>
              <Button
                size="small"
                disabled={isSelf}
                icon={row.status === 'ACTIVE' ? <StopOutlined /> : <CheckCircleOutlined />}
                danger={row.status === 'ACTIVE'}
                onClick={() => handleToggleStatus(row)}
                style={{ borderRadius: 6 }}
              />
            </Tooltip>
            <Popconfirm
              title="确认删除"
              description={`确定要删除用户「${row.name}」吗？此操作不可撤销。`}
              okText="确认删除" cancelText="取消"
              okButtonProps={{ danger: true }}
              disabled={isSelf}
              onConfirm={() => handleDelete(row.id)}
            >
              <Tooltip title={isSelf ? '不能删除自己' : '删除用户'}>
                <Button size="small" danger disabled={isSelf} icon={<DeleteOutlined />} style={{ borderRadius: 6 }} />
              </Tooltip>
            </Popconfirm>
          </Space>
        );
      },
    },
  ], [selfId, openEdit, handleToggleStatus, handleDelete]);

  return (
    <div className="min-h-full">
      {/* 页头 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 m-0">用户管理</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {loading
              ? <Skeleton.Input active size="small" style={{ width: 80 }} />
              : <>共 <span className="font-medium text-gray-600">{total}</span> 个账号</>
            }
          </p>
        </div>
        <Button
          type="primary"
          icon={<UserAddOutlined />}
          onClick={openCreate}
          style={{ borderRadius: 8, background: '#2563EB' }}
        >
          新增用户
        </Button>
      </div>

      {/* 骨架屏 / 表格 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading && users.length === 0 ? (
          // 首次加载：全骨架屏，视觉上瞬间有内容
          <SkeletonRows />
        ) : (
          <Table
            rowKey="id"
            dataSource={users}
            columns={columns}
            loading={loading && users.length > 0
              ? { size: 'large', tip: '刷新中...' }
              : false
            }
            size="large"
            scroll={{ x: 800 }}
            pagination={{
              current:         page,
              pageSize:        pageSize,
              total:           total,
              showSizeChanger: true,
              pageSizeOptions: ['15', '30', '50'],
              showTotal: (t, r) => `第 ${r[0]}–${r[1]} 条 / 共 ${t} 条`,
              onChange: (newPage, newSize) => {
                setPage(newPage);
                setPageSize(newSize);
                fetchUsers(newPage, newSize);
              },
            }}
            locale={{
              emptyText: (
                <div className="py-12 text-center">
                  <UserOutlined style={{ fontSize: 36, color: '#d1d5db', display: 'block', marginBottom: 12 }} />
                  <p className="text-gray-400 text-sm">暂无用户数据</p>
                  <Button type="primary" size="small" onClick={openCreate} style={{ marginTop: 8 }}>
                    立即新增
                  </Button>
                </div>
              ),
            }}
            rowClassName={(row) => row.status === 'INACTIVE' ? 'opacity-50' : ''}
          />
        )}
      </div>

      {/* 新建 / 编辑 弹窗 */}
      <Modal
        title={
          <span className="text-base font-semibold">
            {editingUser ? `编辑用户 · ${editingUser.name}` : '新增用户'}
          </span>
        }
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText={editingUser ? '保存修改' : '创建用户'}
        cancelText="取消"
        confirmLoading={submitting}
        destroyOnClose
        width={480}
        styles={{ body: { paddingTop: 16 } }}
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="username" label="登录账号"
            rules={[{ required: true, message: '请输入登录账号' }, { min: 3, message: '至少 3 个字符' }]}
          >
            <Input size="large" placeholder="英文 / 数字，最少 3 位" disabled={!!editingUser} style={{ borderRadius: 8 }} />
          </Form.Item>
          <Form.Item name="name" label="员工姓名" rules={[{ required: true, message: '请输入员工姓名' }]}>
            <Input size="large" placeholder="真实姓名" style={{ borderRadius: 8 }} />
          </Form.Item>
          <Form.Item
            name="password"
            label={editingUser ? '重置密码（不填则不修改）' : '初始密码'}
            rules={editingUser ? [] : [{ required: true, message: '请设置初始密码' }, { min: 6, message: '至少 6 位' }]}
          >
            <Input.Password size="large" placeholder={editingUser ? '留空则不修改密码' : '至少 6 位'} style={{ borderRadius: 8 }} />
          </Form.Item>
          <Form.Item name="roleId" label="绑定角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select
              size="large" placeholder="选择角色" style={{ borderRadius: 8 }}
              options={roles.map((r) => ({ label: r.name, value: r.id }))}
              notFoundContent={<span className="text-gray-400 text-sm">暂无角色数据</span>}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
