import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Checkbox, Form, Input, message, Modal, Select } from 'antd';
import { fetchAssignableUsers } from '../employeeTasks/api';
import { createReminderTemplate, getBackendMessage, updateReminderTemplate } from './api';
import type {
  CreateReminderTemplatePayload,
  DailyReminderTemplateDto,
  ReminderCategory,
  ReminderFrequency,
  ReminderPriority,
} from './types';
import { REMINDER_CATEGORY_LABELS, REMINDER_FREQUENCY_LABELS, REMINDER_PRIORITY_LABELS } from './types';

const { TextArea } = Input;

interface FormValues {
  title: string;
  category: ReminderCategory;
  priority: ReminderPriority;
  frequency: ReminderFrequency;
  weekdays?: number[];
  platform?: string;
  description?: string;
  userIds?: number[];
}

const PLATFORM_OPTIONS = [
  { value: 'SHEIN', label: 'SHEIN' },
  { value: 'TEMU', label: 'TEMU' },
  { value: 'ALIEXPRESS', label: 'AliExpress' },
  { value: 'EMAG', label: 'eMAG' },
  { value: 'AMAZON', label: 'Amazon' },
  { value: 'OTHER', label: '其他' },
];

const WEEKDAY_OPTIONS = [
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
  { label: '周日', value: 7 },
];

export default function ReminderTemplateFormModal({
  open,
  template,
  onCancel,
  onSuccess,
}: {
  open: boolean;
  template?: DailyReminderTemplateDto | null;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [users, setUsers] = useState<{ id: number; name: string; roleName?: string | null }[]>([]);
  const editing = Boolean(template?.id);
  const frequency = Form.useWatch('frequency', form);

  const userOptions = useMemo(
    () => users.map((user) => ({ value: user.id, label: `${user.name}${user.roleName ? ` (${user.roleName})` : ''}` })),
    [users],
  );

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      setUsers(await fetchAssignableUsers());
    } catch (err) {
      message.error(getBackendMessage(err, '加载可分配员工失败'));
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    loadUsers();
    const userIds = Array.isArray(template?.assignments)
      ? template.assignments.filter((item) => item.targetType === 'USER' && item.userId).map((item) => item.userId as number)
      : [];
    if (template) {
      form.setFieldsValue({
        title: template.title,
        category: template.category,
        priority: template.priority,
        frequency: template.frequency,
        weekdays: Array.isArray(template.weekdays) ? template.weekdays : [],
        platform: template.platform ?? undefined,
        description: template.description ?? undefined,
        userIds,
      });
    } else {
      form.setFieldsValue({ priority: 'P1', frequency: 'DAILY', userIds: [] });
    }
  }, [form, loadUsers, open, template]);

  const buildPayload = (values: FormValues): CreateReminderTemplatePayload => ({
    title: values.title.trim(),
    category: values.category,
    priority: values.priority,
    frequency: values.frequency,
    weekdays: values.frequency === 'WEEKLY' ? values.weekdays ?? [] : undefined,
    platform: values.platform,
    description: values.description?.trim() || undefined,
    assignments: (values.userIds ?? []).map((userId) => ({ targetType: 'USER', userId })),
  });

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      if (editing && template) {
        await updateReminderTemplate(template.id, buildPayload(values));
        message.success('提醒模板已更新');
      } else {
        await createReminderTemplate(buildPayload(values));
        message.success('提醒模板已创建');
      }
      form.resetFields();
      onSuccess();
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(getBackendMessage(err, editing ? '更新提醒模板失败' : '创建提醒模板失败'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={editing ? '编辑提醒模板' : '新建提醒模板'}
      width={760}
      okText={editing ? '保存修改' : '创建模板'}
      cancelText="取消"
      confirmLoading={submitting}
      destroyOnHidden
      onCancel={onCancel}
      onOk={handleSubmit}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="提醒标题" rules={[{ required: true, message: '请输入提醒标题' }]}>
          <Input placeholder="例如：检查平台消息 / 违规通知" />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
          <Form.Item name="category" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
            <Select options={Object.entries(REMINDER_CATEGORY_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="priority" label="优先级" rules={[{ required: true, message: '请选择优先级' }]}>
            <Select options={Object.entries(REMINDER_PRIORITY_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="frequency" label="频率" rules={[{ required: true, message: '请选择频率' }]}>
            <Select options={Object.entries(REMINDER_FREQUENCY_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="platform" label="平台（可选）">
            <Select allowClear options={PLATFORM_OPTIONS} />
          </Form.Item>
          <Form.Item label="店铺（第一期暂不填写）">
            <Input disabled placeholder="第一期先按用户 / 角色分配" />
          </Form.Item>
        </div>

        {frequency === 'WEEKLY' && (
          <Form.Item name="weekdays" label="每周执行日" rules={[{ required: true, message: '请选择每周执行日' }]}>
            <Checkbox.Group options={WEEKDAY_OPTIONS} />
          </Form.Item>
        )}

        <Form.Item name="description" label="SOP 说明">
          <TextArea rows={3} placeholder="填写检查路径、判断标准和异常处理建议" />
        </Form.Item>

        <Form.Item name="userIds" label="适用员工（USER 分配）">
          <Select
            mode="multiple"
            allowClear
            showSearch
            loading={usersLoading}
            optionFilterProp="label"
            options={userOptions}
            placeholder="选择需要接收该提醒的员工"
          />
        </Form.Item>

        <Alert type="info" showIcon message="角色分配后续开放" description="后端已支持 ROLE 分配，前端第一期先支持 USER 分配；待角色列表接口确认后补齐角色选择。" />
      </Form>
    </Modal>
  );
}
