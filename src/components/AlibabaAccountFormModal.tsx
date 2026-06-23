import { Form, Input, Modal, Switch } from 'antd';
import type { AlibabaAccount, AlibabaAccountFormValues } from '../types/alibabaAccount';

interface AlibabaAccountFormModalProps {
  open: boolean;
  editing: AlibabaAccount | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: AlibabaAccountFormValues) => void;
}

function buildEditInitialValues(editing: AlibabaAccount): Partial<AlibabaAccountFormValues> {
  return {
    accountName: editing.name,
    loginId: editing.loginId ?? undefined,
    memberId: editing.memberId ?? undefined,
    remark: editing.remark ?? undefined,
    isDefault: editing.isDefault,
    enabled: editing.enabled,
  };
}

export default function AlibabaAccountFormModal({
  open,
  editing,
  submitting,
  onCancel,
  onSubmit,
}: AlibabaAccountFormModalProps) {
  const [form] = Form.useForm<AlibabaAccountFormValues>();
  const formKey = editing ? `edit-${editing.id}` : 'create';

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      onSubmit(values);
    } catch {
      // validation failed
    }
  };

  return (
    <Modal
      title={editing ? '编辑 1688 账号' : '添加 1688 账号'}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={submitting}
      destroyOnClose
      width={520}
      okText={editing ? '保存' : '添加'}
      afterClose={() => form.resetFields()}
    >
      <Form
        key={formKey}
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={editing ? buildEditInitialValues(editing) : { isDefault: false, enabled: true }}
      >
        <Form.Item
          label="账号名称"
          name="accountName"
          rules={[{ required: true, message: '请输入账号名称' }]}
        >
          <Input placeholder="如：深圳市小狮子" maxLength={64} />
        </Form.Item>

        <Form.Item
          label="企业自用 accessToken"
          name="accessToken"
          rules={editing ? [] : [{ required: true, message: '请输入 accessToken' }]}
          extra={editing ? '留空表示不修改 token' : undefined}
        >
          <Input.Password
            placeholder={editing ? '留空表示不修改' : '粘贴 1688 开放平台生成的永久 token'}
            autoComplete="new-password"
          />
        </Form.Item>

        <Form.Item label="loginId" name="loginId">
          <Input placeholder="可选" />
        </Form.Item>

        <Form.Item label="memberId" name="memberId">
          <Input placeholder="可选" />
        </Form.Item>

        <Form.Item label="备注" name="remark">
          <Input.TextArea rows={2} placeholder="可选" maxLength={200} />
        </Form.Item>

        <Form.Item
          label="设为默认账号"
          name="isDefault"
          valuePropName="checked"
          extra={
            editing?.isDefault
              ? '当前为默认账号；如需更换，请在列表中将其他账号设为默认'
              : undefined
          }
        >
          <Switch disabled={editing?.isDefault === true} />
        </Form.Item>

        {editing ? (
          <Form.Item label="启用" name="enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
        ) : null}
      </Form>
    </Modal>
  );
}
