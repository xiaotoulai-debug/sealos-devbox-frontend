import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Tag, Space, Typography, Modal, Form,
  Input, Select, Switch, message, Popconfirm, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import {
  PlusOutlined, EditOutlined, ReloadOutlined,
  CheckCircleOutlined, StopOutlined, UnorderedListOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import request from '../lib/request';

const { Title, Text } = Typography;
const { TextArea } = Input;

// ─── 类型 ────────────────────────────────────────────────────────
type WarehouseType   = 'LOCAL' | 'THIRD_PARTY' | 'OVERSEAS';
type WarehouseStatus = 'ACTIVE' | 'DISABLED';

interface Warehouse {
  id:         number;
  name:       string;
  type:       WarehouseType;
  status:     WarehouseStatus;
  remark?:    string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  /** 库存 SKU 种类数 */
  skuCount?:      number | null;
  /** 库存总件数 */
  totalQuantity?: number | null;
  /** 库存总货值（人民币） */
  totalValue?:    number | null;
  /** 在途总货值（人民币） */
  inTransitTotalValue?: number | null;
}

interface ApiResp<T = unknown> {
  code:    number;
  message?: string;
  data:    T;
}

// ─── 常量 ────────────────────────────────────────────────────────
const TYPE_META: Record<WarehouseType, { label: string; color: string }> = {
  LOCAL:       { label: '本地仓',   color: 'blue'   },
  THIRD_PARTY: { label: '第三方仓', color: 'orange' },
  OVERSEAS:    { label: '海外仓',   color: 'purple' },
};

const TYPE_OPTIONS = Object.entries(TYPE_META).map(([value, { label }]) => ({ value, label }));

const STATUS_META: Record<WarehouseStatus, { label: string; color: string }> = {
  ACTIVE:   { label: '正常', color: 'success' },
  DISABLED: { label: '停用', color: 'error'   },
};

const VALID_TYPES: WarehouseType[] = ['LOCAL', 'THIRD_PARTY', 'OVERSEAS'];

function normalizeWarehouseType(v: unknown): WarehouseType {
  if (typeof v === 'string' && VALID_TYPES.includes(v as WarehouseType)) return v as WarehouseType;
  return 'LOCAL';
}

function apiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string } | undefined;
    if (typeof data?.message === 'string' && data.message.trim()) return data.message;
  }
  return fallback;
}

/** 人民币数值：千分位逗号 + 两位小数（与运营报表习惯一致） */
const rmbFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatTotalValueRMB(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '-';
  return `¥ ${rmbFormatter.format(Number(v))}`;
}

// ─── 编辑弹窗 ────────────────────────────────────────────────────
interface UpsertModalProps {
  open:      boolean;
  editing:   Warehouse | null;
  onClose:   () => void;
  onSuccess: () => void;
}

function UpsertModal({ open, editing, onClose, onSuccess }: UpsertModalProps) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (editing) {
        form.setFieldsValue({
          name:   editing.name,
          type:   editing.type,
          status: editing.status === 'ACTIVE',
          remark: editing.remark ?? '',
        });
      } else {
        form.resetFields();
        form.setFieldsValue({ status: true, type: 'LOCAL' });
      }
    }
  }, [open, editing, form]);

  const handleOk = async () => {
    let values: { name: string; type?: unknown; status?: boolean; remark?: string };
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    // 与 Prisma Enum 对齐：type 必须为 'LOCAL' | 'THIRD_PARTY' | 'OVERSEAS'；status 为 WarehouseStatus 字符串
    const payload = {
      name:   values.name.trim(),
      type:   normalizeWarehouseType(values.type),
      status: values.status === true ? 'ACTIVE' : 'DISABLED',
      remark: values.remark?.trim() || null,
    };

    setSubmitting(true);
    try {
      const { data: res } = editing
        ? await request.put<ApiResp>(`/warehouses/${editing.id}`, payload)
        : await request.post<ApiResp>('/warehouses', payload);
      if (res.code === 200 || res.code === 201) {
        message.success(editing ? '仓库信息已更新' : '仓库创建成功');
        onSuccess();
        onClose();
      } else {
        message.error(res.message || '操作失败');
      }
    } catch (err: unknown) {
      message.error(apiErrorMessage(err, '提交失败，请重试'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={editing ? '编辑仓库' : '新增仓库'}
      onCancel={onClose}
      onOk={handleOk}
      okText={editing ? '保存修改' : '确认新增'}
      cancelText="取消"
      confirmLoading={submitting}
      maskClosable={false}
      width={480}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 8 }}
      >
        <Form.Item
          name="name"
          label="仓库名称"
          rules={[
            { required: true, message: '请输入仓库名称' },
            { max: 100, message: '名称不超过 100 个字符' },
          ]}
        >
          <Input placeholder="例：eMAG罗马尼亚海外仓" allowClear />
        </Form.Item>

        <Form.Item
          name="type"
          label="仓库类型"
          rules={[{ required: true, message: '请选择仓库类型' }]}
        >
          <Select
            placeholder="请选择仓库类型"
            options={TYPE_OPTIONS}
            optionFilterProp="label"
            getPopupContainer={(n) => n.parentElement ?? document.body}
          />
        </Form.Item>

        <Form.Item name="status" label="仓库状态" valuePropName="checked">
          <Switch checkedChildren="正常" unCheckedChildren="停用" />
        </Form.Item>

        <Form.Item name="remark" label="备注">
          <TextArea rows={3} placeholder="选填，简述仓库用途或地址等" maxLength={500} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ─── 主页面 ──────────────────────────────────────────────────────
interface WarehouseListProps {
  onViewInventory?: (warehouse: Warehouse) => void;
}

export default function WarehouseList({ onViewInventory }: WarehouseListProps) {
  const [list,     setList]     = useState<Warehouse[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing,  setEditing]  = useState<Warehouse | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await request.get<ApiResp<Warehouse[]>>('/warehouses');
      if (res.code === 200) {
        setList(res.data ?? []);
      } else {
        message.error(res.message || '加载仓库列表失败');
      }
    } catch (err: unknown) {
      message.error(apiErrorMessage(err, '加载失败，请刷新重试'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleToggleStatus = useCallback(async (record: Warehouse) => {
    const next: WarehouseStatus = record.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    setToggling(record.id);
    try {
      const { data: res } = await request.put<ApiResp>(`/warehouses/${record.id}`, { status: next });
      if (res.code === 200) {
        message.success(next === 'ACTIVE' ? '仓库已启用' : '仓库已停用');
        fetchList();
      } else {
        message.error(res.message || '操作失败');
      }
    } catch (err: unknown) {
      message.error(apiErrorMessage(err, '操作失败，请重试'));
    } finally {
      setToggling(null);
    }
  }, [fetchList]);

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit   = (r: Warehouse) => { setEditing(r); setModalOpen(true); };

  const columns: ColumnsType<Warehouse> = [
    {
      title:     '仓库名称',
      dataIndex: 'name',
      key:       'name',
      width:     220,
      fixed:     'left',
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title:  '仓库类型',
      key:    'type',
      width:  110,
      align:  'center',
      render: (_: unknown, r: Warehouse) => {
        const meta = TYPE_META[r.type] ?? { label: r.type, color: 'default' };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title:  '状态',
      key:    'status',
      width:  90,
      align:  'center',
      render: (_: unknown, r: Warehouse) => {
        const meta = STATUS_META[r.status] ?? { label: r.status, color: 'default' };
        return (
          <Tag
            icon={r.status === 'ACTIVE' ? <CheckCircleOutlined /> : <StopOutlined />}
            color={meta.color}
          >
            {meta.label}
          </Tag>
        );
      },
    },
    {
      title:     '库存种类 (SKU数)',
      key:       'skuCount',
      width:     130,
      align:     'right',
      render: (_: unknown, r: Warehouse) => {
        const n = r.skuCount;
        if (n == null || Number.isNaN(Number(n))) return <Text type="secondary">-</Text>;
        return (
          <span style={{ fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{Number(n)}</span>
        );
      },
    },
    {
      title:     '库存总量 (件)',
      key:       'totalQuantity',
      width:     120,
      align:     'right',
      render: (_: unknown, r: Warehouse) => {
        const n = r.totalQuantity;
        if (n == null || Number.isNaN(Number(n))) return <Text type="secondary">-</Text>;
        return (
          <span style={{ fontWeight: 600, fontFeatureSettings: '"tnum"', color: '#334155' }}>{Number(n)}</span>
        );
      },
    },
    {
      title:     '库存总货值 (RMB)',
      key:       'totalValue',
      width:     150,
      align:     'right',
      render: (_: unknown, r: Warehouse) => (
        <Text strong style={{ color: '#1677ff', fontFeatureSettings: '"tnum"' }}>
          {formatTotalValueRMB(r.totalValue)}
        </Text>
      ),
    },
    {
      title:     '在途总货值 (RMB)',
      key:       'inTransitTotalValue',
      width:     160,
      align:     'right',
      render: (_: unknown, r: Warehouse) => (
        <Text strong style={{ color: '#fa8c16', fontFeatureSettings: '"tnum"' }}>
          {formatTotalValueRMB(r.inTransitTotalValue)}
        </Text>
      ),
    },
    {
      title:     '备注',
      dataIndex: 'remark',
      key:       'remark',
      ellipsis:  true,
      render: (v: string | null) => v ? (
        <Tooltip title={v}>
          <Text type="secondary" ellipsis style={{ maxWidth: 260 }}>{v}</Text>
        </Tooltip>
      ) : <Text type="secondary">-</Text>,
    },
    {
      title:  '创建时间',
      key:    'createdAt',
      width:  160,
      render: (_: unknown, r: Warehouse) =>
        r.createdAt
          ? new Date(r.createdAt).toLocaleString('zh-CN', { hour12: false })
          : '-',
    },
    {
      title:  '操作',
      key:    'action',
      width:  onViewInventory ? 250 : 160,
      fixed:  'right',
      align:  'center',
      render: (_: unknown, r: Warehouse) => (
        <Space size={6}>
          {onViewInventory && (
            <Button
              size="small"
              type="primary"
              ghost
              icon={<UnorderedListOutlined />}
              onClick={() => onViewInventory(r)}
            >
              库存明细
            </Button>
          )}
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(r)}
          >
            编辑
          </Button>
          <Popconfirm
            title={r.status === 'ACTIVE' ? `确定停用「${r.name}」吗？` : `确定启用「${r.name}」吗？`}
            okText="确定"
            cancelText="取消"
            okButtonProps={{ danger: r.status === 'ACTIVE' }}
            onConfirm={() => handleToggleStatus(r)}
          >
            <Button
              size="small"
              danger={r.status === 'ACTIVE'}
              loading={toggling === r.id}
              icon={r.status === 'ACTIVE' ? <StopOutlined /> : <CheckCircleOutlined />}
            >
              {r.status === 'ACTIVE' ? '停用' : '启用'}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '0 2px' }}>
      {/* 顶栏 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>仓库列表</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchList} loading={loading}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增仓库
          </Button>
        </Space>
      </div>

      {/* 表格 */}
      <Table<Warehouse>
        rowKey="id"
        columns={columns}
        dataSource={list}
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        scroll={{ x: 'max-content', y: 'calc(100vh - 230px)' }}
        locale={{ emptyText: '暂无仓库数据，点击「新增仓库」开始建仓' }}
        size="middle"
        bordered={false}
      />

      {/* 新增 / 编辑弹窗 */}
      <UpsertModal
        open={modalOpen}
        editing={editing}
        onClose={() => setModalOpen(false)}
        onSuccess={fetchList}
      />
    </div>
  );
}
