import { useState, useEffect } from 'react';
import { Modal, Form, InputNumber, Alert, message } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import request from '../lib/request';
import type { ProfitBreakdown } from './ProfitBreakdownPopover';

interface CostCorrectionModalProps {
  open:      boolean;
  pnk:       string;
  breakdown: ProfitBreakdown;
  currency:  string;
  onCancel:  () => void;
  onDone:    () => void;
}

export default function CostCorrectionModal({
  open, pnk, breakdown, currency, onCancel, onDone,
}: CostCorrectionModalProps) {
  const [form]       = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const hasAnyEstimate =
    !!breakdown.isEstimatedCommission || !!breakdown.isEstimatedFbe;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      commissionRate:
        breakdown.commissionRate != null
          ? +(breakdown.commissionRate * 100).toFixed(2)
          : undefined,
      fbeActual:
        breakdown.fbe != null ? +breakdown.fbe.toFixed(2) : undefined,
      returnLossRate:
        breakdown.returnLossRate != null
          ? +(breakdown.returnLossRate * 100).toFixed(2)
          : undefined,
    });
  }, [
    open,
    form,
    breakdown.commissionRate,
    breakdown.fbe,
    breakdown.returnLossRate,
  ]);

  const handleSubmit = async () => {
    try {
      await form.validateFields();
    } catch {
      return;
    }
    const values = form.getFieldsValue();
    const body: {
      commissionRate?: number;
      fbeActual?: number;
      returnLossRate?: number;
    } = {};

    if (values.commissionRate != null) {
      body.commissionRate = values.commissionRate / 100; // 百分比 → 小数
    }
    if (values.fbeActual != null) {
      body.fbeActual = values.fbeActual;
    }
    if (values.returnLossRate != null) {
      body.returnLossRate = values.returnLossRate / 100;
    }
    if (Object.keys(body).length === 0) {
      message.warning('请至少填写一个纠偏值');
      return;
    }

    setSubmitting(true);
    try {
      const { data: res } = await request.patch<{ code: number; message: string }>(
        `/store-products/${encodeURIComponent(pnk)}/cost-correction`,
        body,
      );
      if (res.code === 200) {
        message.success('纠偏数据已提交，列表将自动刷新');
        form.resetFields();
        onDone();
      } else {
        message.error(res.message || '提交失败');
      }
    } catch {
      message.error('提交失败，请检查网络或联系管理员');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  return (
    <Modal
      title={
        <span>
          <WarningOutlined style={{ color: '#faad14', marginRight: 8 }} />
          成本纠偏：{pnk}
        </span>
      }
      open={open}
      onCancel={handleCancel}
      onOk={handleSubmit}
      okText="保存并重算"
      cancelText="取消"
      confirmLoading={submitting}
      width={420}
      destroyOnClose
      maskClosable={false}
    >
      {hasAnyEstimate ? (
        <Alert
          type="warning"
          showIcon
          message="以下字段为系统估算值，请根据实际数据填入，提交后将重新计算毛利。"
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Alert
          type="info"
          showIcon
          message="修改实际成本参数后保存，将重新计算毛利。"
          style={{ marginBottom: 16 }}
        />
      )}
      <Form form={form} layout="vertical">
        <Form.Item
          name="commissionRate"
          label="佣金率（实际）"
          rules={[
            { type: 'number', min: 0, max: 100, message: '佣金率应在 0-100 之间' },
          ]}
        >
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            max={100}
            precision={2}
            addonAfter="%"
            placeholder="例：18.00"
          />
        </Form.Item>
        <Form.Item
          name="fbeActual"
          label={`FBE 运费（实际）${currency ? ` (${currency})` : ''}`}
          rules={[{ type: 'number', min: 0, message: '运费不能为负数' }]}
        >
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            precision={2}
            addonAfter={currency || 'RON'}
            placeholder="例：4.46"
          />
        </Form.Item>
        <Form.Item
          name="returnLossRate"
          label="退货损耗率（实际）"
          rules={[
            { type: 'number', min: 0, max: 100, message: '退货损耗率应在 0-100 之间' },
          ]}
        >
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            max={100}
            precision={2}
            addonAfter="%"
            placeholder="例：2.50"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
