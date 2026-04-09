import { useEffect, useState, useCallback, useMemo } from 'react';
import type { Key } from 'react';
import {
  Table, Button, Modal, Form, Input, Space, Popconfirm,
  message, Tag, Typography, Drawer, Skeleton, Empty, Tree, Spin, Alert,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SafetyCertificateOutlined,
  TeamOutlined, ApartmentOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import request from '../lib/request';
import { ALL_MENU_ITEMS, buildPermissionTree, collectGroupKeys } from '../lib/menuConfig';

const { Text } = Typography;
const { TextArea } = Input;

// ─── 类型 ─────────────────────────────────────────────────────

interface Role {
  id:          number;
  name:        string;
  description: string | null;
  userCount?:  number;
  createdAt:   string;
}

// ─── 主组件 ──────────────────────────────────────────────────

export default function RoleManagement() {
  const [roles,          setRoles]          = useState<Role[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [deleting,       setDeleting]       = useState<number | null>(null);

  // 新增/编辑弹窗
  const [modalOpen,      setModalOpen]      = useState(false);
  const [editingRole,    setEditingRole]    = useState<Role | null>(null);
  const [form]                              = Form.useForm<{ name: string; description?: string }>();

  // 分配权限抽屉
  const [permDrawerOpen, setPermDrawerOpen] = useState(false);
  const [permTargetRole, setPermTargetRole] = useState<Role | null>(null);

  // ── 获取角色列表 ─────────────────────────────────────────

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await request.get<{ code: number; data?: Role[]; message?: string }>('/roles');
      if (res.code === 200 && Array.isArray(res.data)) {
        setRoles(res.data);
      } else {
        message.error(res.message ?? '获取角色列表失败');
        setRoles([]);
      }
    } catch {
      message.error('请求失败，请检查网络或后端服务');
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  // ── 打开新增/编辑弹窗 ────────────────────────────────────

  const openCreate = useCallback(() => {
    setEditingRole(null);
    form.resetFields();
    setModalOpen(true);
  }, [form]);

  const openEdit = useCallback((role: Role) => {
    setEditingRole(role);
    form.setFieldsValue({ name: role.name, description: role.description ?? '' });
    setModalOpen(true);
  }, [form]);

  const handleModalOk = useCallback(async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editingRole) {
        const { data: res } = await request.put<{ code: number; message: string }>(
          `/roles/${editingRole.id}`, values,
        );
        if (res.code === 200) {
          message.success('角色更新成功');
          setModalOpen(false);
          fetchRoles();
        } else {
          message.error(res.message ?? '更新失败');
        }
      } else {
        const { data: res } = await request.post<{ code: number; message: string }>(
          '/roles', values,
        );
        if (res.code === 200) {
          message.success('角色创建成功');
          setModalOpen(false);
          fetchRoles();
        } else {
          message.error(res.message ?? '创建失败');
        }
      }
    } catch {
      message.error('请求失败，请检查网络或后端服务');
    } finally {
      setSaving(false);
    }
  }, [editingRole, form, fetchRoles]);

  // ── 删除角色 ─────────────────────────────────────────────

  const handleDelete = useCallback(async (role: Role) => {
    setDeleting(role.id);
    try {
      const { data: res } = await request.delete<{ code: number; message: string }>(`/roles/${role.id}`);
      if (res.code === 200) {
        message.success('角色已删除');
        fetchRoles();
      } else {
        message.error(res.message ?? '删除失败');
      }
    } catch {
      message.error('请求失败，请检查网络或后端服务');
    } finally {
      setDeleting(null);
    }
  }, [fetchRoles]);

  // ── 分配权限 ─────────────────────────────────────────────

  const openPermDrawer = useCallback((role: Role) => {
    setPermTargetRole(role);
    setPermDrawerOpen(true);
  }, []);

  // ── 表格列 ───────────────────────────────────────────────

  const columns = useMemo<ColumnsType<Role>>(() => [
    {
      title: 'ID', dataIndex: 'id', width: 70,
      render: (v: number) => <Text type="secondary" style={{ fontSize: 13, fontFamily: 'monospace' }}>#{v}</Text>,
    },
    {
      title: '角色名称', dataIndex: 'name', width: 160,
      render: (v: string) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <TeamOutlined style={{ color: '#1890ff', fontSize: 13 }} />
          </div>
          <Text strong style={{ fontSize: 13 }}>{v}</Text>
        </div>
      ),
    },
    {
      title: '描述', dataIndex: 'description', ellipsis: true,
      render: (v: string | null) => v
        ? <Text style={{ fontSize: 13 }}>{v}</Text>
        : <Text type="secondary" style={{ fontSize: 13 }}>—</Text>,
    },
    {
      title: '成员数', dataIndex: 'userCount', width: 90, align: 'center',
      render: (v: number | undefined) => (
        <Tag bordered={false} color="blue" style={{ fontWeight: 500, borderRadius: 6 }}>
          {v ?? 0} 人
        </Tag>
      ),
    },
    {
      title: '创建时间', dataIndex: 'createdAt', width: 170,
      render: (v: string) => (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {new Date(v).toLocaleString('zh-CN')}
        </Text>
      ),
    },
    {
      title: '操作', key: 'actions', width: 200, fixed: 'right',
      render: (_: unknown, record: Role) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<SafetyCertificateOutlined />}
            onClick={() => openPermDrawer(record)}
            style={{ color: '#52c41a', padding: '0 4px' }}
          >
            分配权限
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
            style={{ padding: '0 4px' }}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description={<span>确定要删除角色「{record.name}」吗？<br />该角色下的用户将失去对应权限。</span>}
            onConfirm={() => handleDelete(record)}
            okText="删除"
            okType="danger"
            cancelText="取消"
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={deleting === record.id}
              style={{ padding: '0 4px' }}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ], [openPermDrawer, openEdit, handleDelete, deleting]);

  // ── 渲染 ─────────────────────────────────────────────────

  return (
    <div className="min-h-full">
      {/* 页头 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 m-0 flex items-center gap-2">
            <SafetyCertificateOutlined style={{ color: '#1890ff', fontSize: 20 }} />
            角色管理
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            共 <span className="font-semibold text-gray-700 text-base">{roles.length}</span> 个角色
          </p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreate}
          style={{ borderRadius: 8, fontWeight: 500 }}
        >
          新增角色
        </Button>
      </div>

      {/* 角色列表 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <SkeletonRows />
        ) : (
          <Table
            rowKey="id"
            dataSource={roles}
            columns={columns}
            loading={false}
            pagination={false}
            size="large"
            scroll={{ x: 900 }}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无角色" style={{ padding: '48px 0' }} /> }}
            rowClassName="align-middle"
          />
        )}
      </div>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <TeamOutlined style={{ color: '#1890ff' }} />
            <span>{editingRole ? '编辑角色' : '新增角色'}</span>
          </div>
        }
        open={modalOpen}
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
        okText={editingRole ? '保存' : '创建'}
        cancelText="取消"
        confirmLoading={saving}
        destroyOnClose
        width={480}
      >
        <p className="text-gray-400 text-sm mt-1 mb-4">
          {editingRole ? '修改角色信息后，该角色下所有账号的权限将同步更新。' : '创建角色后，可前往「分配权限」配置该角色能访问的功能模块。'}
        </p>
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="name"
            label="角色名称"
            rules={[
              { required: true, message: '请输入角色名称' },
              { max: 20, message: '角色名称最多 20 个字符' },
            ]}
          >
            <Input placeholder="如：运营专员、数据分析师" maxLength={20} showCount />
          </Form.Item>
          <Form.Item name="description" label="描述（可选）">
            <TextArea
              placeholder="简述该角色的职能范围和主要权限"
              maxLength={120}
              showCount
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 分配权限抽屉 */}
      <PermissionDrawer
        open={permDrawerOpen}
        role={permTargetRole}
        onClose={() => setPermDrawerOpen(false)}
        onSaved={() => { setPermDrawerOpen(false); fetchRoles(); }}
      />
    </div>
  );
}

// ─── 工具：将 PermTreeNode[] 转为 Ant Design Tree 的 DataNode[] ──
// PermTreeNode 的 key 已经是 string（code 或 group:xxx），直接透传。
import type { PermTreeNode } from '../lib/menuConfig';

function toAntTreeData(nodes: PermTreeNode[]): DataNode[] {
  return nodes.map((n) => ({
    key:      n.key,
    title:    n.title,
    children: n.children ? toAntTreeData(n.children) : undefined,
  }));
}

// ─── 分配权限抽屉 ─────────────────────────────────────────────

interface PermissionDrawerProps {
  open:    boolean;
  role:    Role | null;
  onClose: () => void;
  onSaved: () => void;
}

function PermissionDrawer({ open, role, onClose, onSaved }: PermissionDrawerProps) {
  // ── 权限树：从前端菜单配置动态生成，无需请求后端 ─────────────
  // 每次菜单配置新增页面，这里自动同步，无需任何手工维护。
  const permTree     = useMemo(() => buildPermissionTree(ALL_MENU_ITEMS), []);
  const treeData     = useMemo(() => toAntTreeData(permTree), [permTree]);
  const groupKeys    = useMemo(() => collectGroupKeys(permTree), [permTree]);
  const expandedInit = useMemo(() => treeData.map((n) => n.key), [treeData]);

  const [checkedKeys,     setCheckedKeys]     = useState<Key[]>([]);
  const [halfCheckedKeys, setHalfCheckedKeys] = useState<Key[]>([]);
  const [expandedKeys,    setExpandedKeys]    = useState<Key[]>(expandedInit);
  const [loadingRole,     setLoadingRole]     = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [loadError,       setLoadError]       = useState<string | null>(null);

  // 每次打开时，仅拉取当前角色已有权限码并回显
  useEffect(() => {
    if (!open || !role) return;
    let cancelled = false;
    setLoadError(null);
    setLoadingRole(true);
    setCheckedKeys([]);
    setHalfCheckedKeys([]);
    setExpandedKeys(expandedInit);

    request.get<{
      code: number;
      data?: {
        permissionCodes?: string[];
        codes?: string[];
        permissions?: { code?: string; name?: string; id?: number }[];
        role?: { permissions?: { code?: string; name?: string }[] };
      };
      message?: string;
    }>(`/roles/${role.id}`)
      .then(({ data: res }) => {
        if (cancelled) return;
        if (res.code !== 200) {
          message.warning(res.message ?? '无法获取当前角色权限，已默认全部不选');
          return;
        }
        const d = res.data;
        let existingCodes: string[] = [];

        if (Array.isArray(d?.permissionCodes)) {
          // 格式 1：{ permissionCodes: string[] }（推荐，与 PUT 提交字段对齐）
          existingCodes = d.permissionCodes.filter(Boolean);
        } else if (Array.isArray(d?.codes)) {
          // 格式 2：{ codes: string[] }
          existingCodes = d.codes.filter(Boolean);
        } else if (Array.isArray(d?.permissions)) {
          // 格式 3：{ permissions: [{ code, name }] }
          existingCodes = (d.permissions as { code?: string; name?: string }[])
            .map((p) => p.code ?? p.name ?? '')
            .filter(Boolean);
        } else if (Array.isArray(d?.role?.permissions)) {
          // 格式 4：{ role: { permissions: [{ code }] } }
          existingCodes = (d.role!.permissions as { code?: string; name?: string }[])
            .map((p) => p.code ?? p.name ?? '')
            .filter(Boolean);
        }

        // 只勾选叶子节点（排除分组 key），分组的半选状态由 Tree 自动推导
        setCheckedKeys(existingCodes.filter((c) => !groupKeys.includes(c)));
      })
      .catch(() => {
        if (!cancelled) setLoadError('请求失败，请检查网络或后端服务');
      })
      .finally(() => {
        if (!cancelled) setLoadingRole(false);
      });

    return () => { cancelled = true; };
  }, [open, role, expandedInit, groupKeys]);

  const handleCheck = useCallback(
    (keys: Key[] | { checked: Key[]; halfChecked: Key[] }, info: { halfCheckedKeys?: Key[] }) => {
      if (Array.isArray(keys)) {
        setCheckedKeys(keys);
      } else {
        setCheckedKeys(keys.checked);
      }
      setHalfCheckedKeys(info.halfCheckedKeys ?? []);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!role) return;
    setSaving(true);
    try {
      // 只提交叶子节点的 code（过滤掉 group:xxx 分组 key），payload 键名用 permissionCodes
      const allSelected = [...new Set([...checkedKeys, ...halfCheckedKeys])] as string[];
      const permissionCodes = allSelected.filter((k) => !groupKeys.includes(k as string));

      const { data: res } = await request.put<{ code: number; message: string }>(
        `/roles/${role.id}/permissions`,
        { permissionCodes },   // ← 改为 permissionCodes，与后端字段名对齐
      );
      if (res.code === 200) {
        message.success(`角色「${role.name}」权限已更新`);
        onSaved();
      } else {
        message.error(res.message ?? '保存失败');
      }
    } catch {
      message.error('请求失败，请检查网络或后端服务');
    } finally {
      setSaving(false);
    }
  }, [role, checkedKeys, halfCheckedKeys, groupKeys, onSaved]);

  const checkedCount = checkedKeys.length;

  return (
    <Drawer
      title={
        <div className="flex items-center gap-2 flex-wrap">
          <ApartmentOutlined style={{ color: '#52c41a', fontSize: 16 }} />
          <span className="font-semibold">分配权限</span>
          {role && (
            <Tag bordered={false} color="blue" style={{ marginLeft: 2, fontWeight: 500 }}>
              {role.name}
            </Tag>
          )}
        </div>
      }
      placement="right"
      width={480}
      open={open}
      onClose={onClose}
      destroyOnClose
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
      footer={
        <div className="flex items-center justify-between py-1">
          <span className="text-sm text-gray-400">
            已选 <span className="font-semibold text-gray-700">{checkedCount}</span> 个权限节点
          </span>
          <div className="flex gap-2">
            <Button onClick={onClose} disabled={saving}>取消</Button>
            <Button
              type="primary"
              loading={saving}
              disabled={loadingRole || !!loadError}
              onClick={handleSave}
              icon={<SafetyCertificateOutlined />}
            >
              保存权限
            </Button>
          </div>
        </div>
      }
    >
      {/* 引导语 */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <p className="text-sm text-gray-400 m-0">
          勾选该角色可访问的菜单与操作权限。父节点半选时将一并保存，确保路由可访问。
        </p>
      </div>

      {/* 树主体区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loadingRole ? (
          <div className="flex justify-center py-16">
            <Spin size="large" tip="加载角色权限..." />
          </div>
        ) : loadError ? (
          <Alert
            type="error"
            message={loadError}
            showIcon
            style={{ borderRadius: 8 }}
          />
        ) : treeData.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无权限数据"
            style={{ padding: '48px 0' }}
          />
        ) : (
          <Tree
            checkable
            treeData={treeData}
            checkedKeys={checkedKeys}
            expandedKeys={expandedKeys}
            onExpand={(keys) => setExpandedKeys(keys)}
            onCheck={handleCheck as Parameters<typeof Tree>[0]['onCheck']}
            selectable={false}
            style={{ fontSize: 14 }}
          />
        )}
      </div>
    </Drawer>
  );
}

// ─── 骨架屏 ──────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <div className="px-6 py-4 space-y-5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton.Input active size="small" style={{ width: 40 }} />
          <div className="flex items-center gap-2 flex-shrink-0" style={{ width: 140 }}>
            <Skeleton.Avatar active size={28} shape="square" />
            <Skeleton.Input active size="small" style={{ width: 80 }} />
          </div>
          <div className="flex-1">
            <Skeleton.Input active size="small" style={{ width: '60%' }} block />
          </div>
          <Skeleton.Input active size="small" style={{ width: 60 }} />
          <Skeleton.Input active size="small" style={{ width: 130 }} />
          <Skeleton.Button active size="small" style={{ width: 170 }} />
        </div>
      ))}
    </div>
  );
}
