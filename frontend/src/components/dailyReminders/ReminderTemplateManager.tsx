import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Drawer, Empty, message, Modal, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  deleteReminderTemplate,
  fetchReminderTemplateDetail,
  fetchReminderTemplates,
  getBackendMessage,
  isReminderTemplateDeleteHistoryConflict,
  updateReminderTemplateStatus,
} from './api';
import ReminderTemplateFormModal from './ReminderTemplateFormModal';
import type { DailyReminderAssignmentDto, DailyReminderTemplateDto } from './types';
import { REMINDER_CATEGORY_LABELS, REMINDER_FREQUENCY_LABELS, REMINDER_PRIORITY_LABELS } from './types';

const { Text } = Typography;

function assignmentSummary(assignments?: DailyReminderAssignmentDto[]): string {
  const list = Array.isArray(assignments) ? assignments : [];
  if (list.length === 0) return '未指定';
  const users = list.filter((item) => item.targetType === 'USER').map((item) => item.userName).filter(Boolean);
  const roles = list.filter((item) => item.targetType === 'ROLE').map((item) => item.roleName).filter(Boolean);
  return [...users, ...roles].slice(0, 3).join('、') || `${list.length} 个对象`;
}

function priorityColor(priority: string) {
  if (priority === 'P0') return 'red';
  if (priority === 'P1') return 'orange';
  return 'blue';
}

export default function ReminderTemplateManager({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<DailyReminderTemplateDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DailyReminderTemplateDto | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const loadTemplates = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError('');
    try {
      setRows(await fetchReminderTemplates());
    } catch (err) {
      const msg = getBackendMessage(err, '加载提醒模板失败');
      setError(msg.includes('403') || msg.includes('权限') ? '暂无管理提醒模板权限' : msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const openEdit = async (record: DailyReminderTemplateDto) => {
    setActionLoadingId(record.id);
    try {
      setEditing(await fetchReminderTemplateDetail(record.id));
      setFormOpen(true);
    } catch (err) {
      message.error(getBackendMessage(err, '加载提醒模板详情失败'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const toggleStatus = async (record: DailyReminderTemplateDto) => {
    setActionLoadingId(record.id);
    try {
      await updateReminderTemplateStatus(record.id, !(record.isActive ?? false));
      message.success(record.isActive ? '模板已停用' : '模板已启用');
      await loadTemplates();
      onChanged();
    } catch (err) {
      message.error(getBackendMessage(err, '更新模板状态失败'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const refreshAfterDelete = async (successMessage: string) => {
    message.success(successMessage);
    await loadTemplates();
    onChanged();
  };

  const confirmForceDelete = (record: DailyReminderTemplateDto) => {
    Modal.confirm({
      title: '该模板已有历史处理记录，是否强制删除？',
      content: '强制删除会同时清理该模板的历史处理记录和适用对象。仅建议删除测试数据。正式运营模板建议停用，不建议强制删除。',
      okText: '强制删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setActionLoadingId(record.id);
        try {
          await deleteReminderTemplate(record.id, { force: true });
          await refreshAfterDelete('提醒模板已强制删除');
        } catch (err) {
          message.error(getBackendMessage(err, '强制删除提醒模板失败'));
          throw err;
        } finally {
          setActionLoadingId(null);
        }
      },
    });
  };

  const handleDelete = async (record: DailyReminderTemplateDto) => {
    setActionLoadingId(record.id);
    try {
      await deleteReminderTemplate(record.id);
      await refreshAfterDelete('提醒模板已删除');
    } catch (err) {
      if (isReminderTemplateDeleteHistoryConflict(err)) {
        confirmForceDelete(record);
        return;
      }
      message.error(getBackendMessage(err, '删除提醒模板失败'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleFormSuccess = async () => {
    setFormOpen(false);
    setEditing(null);
    await loadTemplates();
    onChanged();
  };

  const columns: ColumnsType<DailyReminderTemplateDto> = [
    {
      title: '标题',
      dataIndex: 'title',
      width: 220,
      render: (value: string) => <Text strong ellipsis style={{ maxWidth: 210 }}>{value}</Text>,
    },
    {
      title: '分类',
      dataIndex: 'category',
      width: 100,
      render: (value: DailyReminderTemplateDto['category'], record) => record.categoryName || REMINDER_CATEGORY_LABELS[value],
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 90,
      render: (value: DailyReminderTemplateDto['priority'], record) => <Tag color={priorityColor(value)}>{record.priorityName || REMINDER_PRIORITY_LABELS[value]}</Tag>,
    },
    {
      title: '频率',
      dataIndex: 'frequency',
      width: 90,
      render: (value: DailyReminderTemplateDto['frequency'], record) => record.frequencyName || REMINDER_FREQUENCY_LABELS[value],
    },
    {
      title: '建议时间',
      dataIndex: 'suggestedTime',
      width: 95,
      render: (value?: string | null) => value || '-',
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      width: 80,
      render: (value?: boolean | null) => <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '停用'}</Tag>,
    },
    {
      title: '适用对象',
      dataIndex: 'assignments',
      width: 150,
      render: (value?: DailyReminderAssignmentDto[]) => assignmentSummary(value),
    },
    {
      title: '操作',
      width: 190,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Button size="small" loading={actionLoadingId === record.id} onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title={record.isActive ? '确认停用该模板？' : '确认启用该模板？'} onConfirm={() => toggleStatus(record)}>
            <Button size="small" danger={record.isActive === true} loading={actionLoadingId === record.id}>
              {record.isActive ? '停用' : '启用'}
            </Button>
          </Popconfirm>
          <Popconfirm
            title="确认删除该提醒模板？"
            description="删除后不可恢复。若模板已有历史处理记录，将需要再次确认。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record)}
          >
            <Button size="small" danger type="link" loading={actionLoadingId === record.id}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Drawer
        open={open}
        width={980}
        title="管理提醒模板"
        onClose={onClose}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={loadTemplates}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setFormOpen(true); }}>新建模板</Button>
          </Space>
        }
      >
        {error && <Alert type="warning" showIcon message={error} style={{ borderRadius: 12, marginBottom: 12 }} />}
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={Array.isArray(rows) ? rows : []}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无提醒模板" /> }}
          pagination={false}
          scroll={{ x: 980, y: 'calc(100vh - 260px)' }}
        />
      </Drawer>
      <ReminderTemplateFormModal
        open={formOpen}
        template={editing}
        onCancel={() => { setFormOpen(false); setEditing(null); }}
        onSuccess={handleFormSuccess}
      />
    </>
  );
}
