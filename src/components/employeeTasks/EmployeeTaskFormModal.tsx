import { useCallback, useEffect, useState } from 'react';
import { DatePicker, Empty, Form, Input, message, Modal, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { createEmployeeTask, fetchAssignableUsers, getBackendMessage, updateEmployeeTask } from './api';
import type {
  AssignableUser,
  CreateEmployeeTaskPayload,
  EmployeeTaskDto,
  EmployeeTaskPlatform,
  EmployeeTaskPriority,
  EmployeeTaskType,
} from './types';
import { PLATFORM_LABELS, PRIORITY_LABELS, TASK_TYPE_LABELS } from './types';

const { TextArea } = Input;

interface TaskFormValues {
  title: string;
  taskType: EmployeeTaskType;
  assigneeId: number;
  platform: EmployeeTaskPlatform;
  dueDate: Dayjs;
  priority: EmployeeTaskPriority;
  description?: string;
  relatedSkuText?: string;
  remark?: string;
}

export default function EmployeeTaskFormModal({
  open,
  task,
  initialAssigneeId,
  onCancel,
  onSuccess,
}: {
  open: boolean;
  task?: EmployeeTaskDto | null;
  initialAssigneeId?: number;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [form] = Form.useForm<TaskFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const editing = Boolean(task?.id);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      setUsers(await fetchAssignableUsers());
    } catch (err) {
      message.error(getBackendMessage(err, '加载可指派用户失败'));
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    loadUsers();
    if (task) {
      form.setFieldsValue({
        title: task.title,
        taskType: task.taskType,
        assigneeId: task.assigneeId,
        platform: task.platform ?? undefined,
        dueDate: task.dueDate ? dayjs(task.dueDate) : dayjs(),
        priority: task.priority,
        description: task.description ?? undefined,
        relatedSkuText: task.relatedSkuText ?? undefined,
        remark: task.remark ?? undefined,
      });
    } else {
      form.setFieldsValue({
        priority: 'MEDIUM',
        dueDate: dayjs(),
        ...(initialAssigneeId != null ? { assigneeId: initialAssigneeId } : {}),
      });
    }
  }, [form, initialAssigneeId, loadUsers, open, task]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload: CreateEmployeeTaskPayload = {
        title: values.title.trim(),
        taskType: values.taskType,
        assigneeId: values.assigneeId,
        platform: values.platform,
        dueDate: values.dueDate.format('YYYY-MM-DD'),
        priority: values.priority,
        description: values.description?.trim() || undefined,
        relatedSkuText: values.relatedSkuText?.trim() || undefined,
        remark: values.remark?.trim() || undefined,
      };
      setSubmitting(true);
      if (editing && task) {
        await updateEmployeeTask(task.id, payload);
        message.success('任务已更新');
      } else {
        await createEmployeeTask(payload);
        message.success('任务创建成功');
      }
      form.resetFields();
      onSuccess();
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(getBackendMessage(err, editing ? '更新任务失败' : '创建任务失败'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={editing ? '编辑任务' : '新建任务'}
      width={720}
      onCancel={onCancel}
      onOk={handleSubmit}
      confirmLoading={submitting}
      destroyOnHidden
      okText={editing ? '保存修改' : '创建任务'}
      cancelText="取消"
    >
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="任务标题" rules={[{ required: true, message: '请输入任务标题' }]}>
          <Input placeholder="请输入任务标题" />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
          <Form.Item name="taskType" label="任务类型" rules={[{ required: true, message: '请选择任务类型' }]}>
            <Select options={Object.entries(TASK_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="assigneeId" label="指派给谁" rules={[{ required: true, message: '请选择指派人' }]}>
            <Select
              showSearch
              loading={usersLoading}
              optionFilterProp="label"
              notFoundContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可指派用户" />}
              options={users.map((user) => ({ value: user.id, label: `${user.name}${user.roleName ? ` (${user.roleName})` : ''}` }))}
            />
          </Form.Item>
          <Form.Item
            name="platform"
            label="平台"
            rules={[{ required: true, message: '请选择平台' }]}
          >
            <Select options={Object.entries(PLATFORM_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="dueDate" label="截止日期" rules={[{ required: true, message: '请选择截止日期' }]}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="priority" label="优先级" rules={[{ required: true, message: '请选择优先级' }]}>
            <Select options={Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item label="店铺（第一期暂不填写）">
            <Input disabled placeholder="第一期先聚焦任务本身" />
          </Form.Item>
        </div>
        <Form.Item name="description" label="任务说明">
          <TextArea rows={3} placeholder="填写任务背景、目标和要求" />
        </Form.Item>
        <Form.Item name="relatedSkuText" label="相关 SKU / SKC">
          <TextArea rows={2} placeholder="多个 SKU / SKC 请用英文逗号分隔，例如：SKU001, SKC002" />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <TextArea rows={2} placeholder="可填写补充说明" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
