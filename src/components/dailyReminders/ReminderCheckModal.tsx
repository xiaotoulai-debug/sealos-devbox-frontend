import { Form, Input, Modal } from 'antd';
import type { DailyReminderTodayItem } from './types';

const { TextArea } = Input;

export default function ReminderCheckModal({
  open,
  reminder,
  submitting,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  reminder?: DailyReminderTodayItem | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (note: string) => void;
}) {
  const [form] = Form.useForm<{ note: string }>();

  const handleOk = async () => {
    const values = await form.validateFields();
    onSubmit(values.note.trim());
  };

  return (
    <Modal
      open={open}
      title="提交异常说明"
      okText="提交异常"
      cancelText="取消"
      confirmLoading={submitting}
      destroyOnHidden
      onCancel={onCancel}
      onOk={handleOk}
      afterOpenChange={(visible) => {
        if (visible) form.setFieldsValue({ note: reminder?.note ?? '' });
        if (!visible) form.resetFields();
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item label="提醒事项">
          <Input value={reminder?.title ?? '-'} disabled />
        </Form.Item>
        <Form.Item
          name="note"
          label="异常说明"
          rules={[
            { required: true, message: '请填写异常说明' },
            { whitespace: true, message: '请填写异常说明' },
          ]}
        >
          <TextArea rows={4} placeholder="请说明异常情况、影响范围或后续处理计划" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
