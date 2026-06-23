import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, DatePicker, Form, Input, InputNumber, message, Modal, Spin, Tag, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { fetchWorkdayCalendar } from '../workdayCalendar/api';
import type { WorkdayStatus } from '../workdayCalendar/types';
import { createDailyReport, fetchMyDailyReport, getBackendMessage, updateDailyReport } from './api';
import type { DailyReport, DailyReportItem, DailyReportPayload, DailyWorkdayStatus } from './types';
import { FIXED_REPORT_ITEMS } from './types';

const { Text } = Typography;
const { TextArea } = Input;
const compactGridColumns = '108px 92px minmax(190px, 1.2fr) minmax(170px, 1fr) minmax(170px, 1fr)';

interface OperationLogFormValues {
  workDate: Dayjs;
  items: DailyReportItem[];
}

const emptyReport = (workDate: string): DailyReport => ({
  reportId: null,
  workDate,
  submitted: false,
  canEdit: true,
  editCount: 0,
  maxEditCount: 1,
  items: FIXED_REPORT_ITEMS.map((item) => ({
    ...item,
    quantity: 0,
    linksText: '',
    detail: '',
    blockerReason: '',
  })),
});

function toNonNegativeInt(value: unknown): number {
  const n = Math.floor(Number(value ?? 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizeReport(raw: DailyReport | null | undefined, fallbackDate: string): DailyReport {
  const backendItems = Array.isArray(raw?.items) ? raw.items : [];
  const items = FIXED_REPORT_ITEMS.map((fixed) => {
    const matched = backendItems.find((item) => item?.taskType === fixed.taskType);
    const rawLinks = (matched as DailyReportItem & { links?: unknown })?.links;
    const linksText = typeof matched?.linksText === 'string'
      ? matched.linksText
      : Array.isArray(rawLinks)
        ? rawLinks.map((line) => String(line ?? '').trim()).filter(Boolean).join(', ')
        : '';

    return {
      taskType: fixed.taskType,
      taskName: fixed.taskName,
      quantity: toNonNegativeInt(matched?.quantity),
      linksText,
      detail: matched?.detail ?? '',
      blockerReason: matched?.blockerReason ?? '',
    };
  });

  return {
    reportId: raw?.reportId ?? null,
    workDate: raw?.workDate ?? fallbackDate,
    submitted: raw?.submitted === true,
    canEdit: raw?.canEdit === true,
    editCount: toNonNegativeInt(raw?.editCount),
    maxEditCount: toNonNegativeInt(raw?.maxEditCount ?? 1),
    workdayStatus: raw?.workdayStatus ?? null,
    workdayHint: raw?.workdayHint ?? null,
    items,
  };
}

async function resolveWorkdayStatus(date: string, reportStatus?: DailyWorkdayStatus | null): Promise<WorkdayStatus> {
  if (reportStatus) return reportStatus;
  try {
    const payload = await fetchWorkdayCalendar(dayjs(date).year());
    const matched = Array.isArray(payload?.days)
      ? payload.days.find((day) => day?.date === date)
      : undefined;
    return matched?.status ?? 'PENDING';
  } catch {
    return 'PENDING';
  }
}

function splitLinks(value: unknown): string[] {
  return String(value ?? '')
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildPayload(values: OperationLogFormValues): DailyReportPayload {
  return {
    workDate: values.workDate.format('YYYY-MM-DD'),
    items: FIXED_REPORT_ITEMS.map((fixed, index) => {
      const row = values.items?.[index];
      if (fixed.taskType === 'OTHER') {
        return {
          taskType: fixed.taskType,
          quantity: 0,
          links: [],
          detail: row?.detail?.trim() || undefined,
          blockerReason: undefined,
        };
      }
      return {
        taskType: fixed.taskType,
        quantity: toNonNegativeInt(row?.quantity),
        links: splitLinks(row?.linksText),
        detail: row?.detail?.trim() || undefined,
        blockerReason: row?.blockerReason?.trim() || undefined,
      };
    }),
  };
}

export default function OperationLogModal({
  open,
  onCancel,
  onSuccess,
}: {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [form] = Form.useForm<OperationLogFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<DailyReport>(() => emptyReport(dayjs().format('YYYY-MM-DD')));
  const [workdayStatus, setWorkdayStatus] = useState<WorkdayStatus>('PENDING');

  const isSubmitted = report.submitted === true;
  const canEdit = report.canEdit === true;
  const isReadonly = isSubmitted && !canEdit;
  const okText = !isSubmitted ? '提交日报' : canEdit ? '修改日报' : '修改机会已用完';
  const effectiveWorkdayStatus = report.workdayStatus ?? workdayStatus;

  const workdayHint = useMemo(() => {
    if (report.workdayHint) return report.workdayHint;
    if (effectiveWorkdayStatus === 'REST') {
      return '今天为休息日，无需登记；如有运营工作，也可以补充登记。';
    }
    if (effectiveWorkdayStatus === 'PENDING') {
      return '今天运营日历待定，暂不强制登记。';
    }
    return '';
  }, [effectiveWorkdayStatus, report.workdayHint]);

  const statusMessage = useMemo(() => {
    if (!isSubmitted) return '今日尚未提交日报，没有做的事项保持 0 即可。';
    if (canEdit) return '今日日报已提交，还可修改 1 次。';
    return '今日日报已提交且修改机会已用完。';
  }, [canEdit, isSubmitted]);

  const loadReport = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const normalized = normalizeReport(await fetchMyDailyReport(date), date);
      const status = await resolveWorkdayStatus(date, normalized.workdayStatus);
      setReport(normalized);
      setWorkdayStatus(status);
      form.setFieldsValue({
        workDate: dayjs(normalized.workDate),
        items: normalized.items,
      });
    } catch (err) {
      message.error(getBackendMessage(err, '加载我的运营日报失败'));
      const fallback = emptyReport(date);
      const status = await resolveWorkdayStatus(date, fallback.workdayStatus);
      setReport(fallback);
      setWorkdayStatus(status);
      form.setFieldsValue({
        workDate: dayjs(date),
        items: fallback.items,
      });
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    if (!open) return;
    loadReport(dayjs().format('YYYY-MM-DD'));
  }, [loadReport, open]);

  const handleSubmit = async () => {
    if (isReadonly) {
      message.warning('今日日报已提交且修改机会已用完');
      return;
    }
    try {
      const values = await form.validateFields();
      const payload = buildPayload(values);
      setSubmitting(true);
      if (!isSubmitted) {
        await createDailyReport(payload);
        message.success('日报提交成功');
      } else if (canEdit && report.reportId != null) {
        await updateDailyReport(Number(report.reportId), payload);
        message.success('日报修改成功');
      } else {
        message.warning('今日日报已提交且修改机会已用完');
        return;
      }
      form.resetFields();
      onSuccess();
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(getBackendMessage(err, '保存运营日报失败'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="每日运营日报"
      width={1080}
      onCancel={onCancel}
      onOk={handleSubmit}
      confirmLoading={submitting}
      okButtonProps={{ disabled: isReadonly || loading }}
      destroyOnHidden
      okText={okText}
      cancelText="取消"
    >
      <Spin spinning={loading}>
        {workdayHint && (
          <Alert
            type="info"
            showIcon
            message={workdayHint}
            style={{ marginBottom: 12, borderRadius: 10 }}
          />
        )}
        <Form form={form} layout="vertical" disabled={isReadonly}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 12,
            padding: '8px 10px',
            background: '#f8fafc',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Form.Item name="workDate" rules={[{ required: true, message: '请选择日期' }]} style={{ marginBottom: 0 }}>
                <DatePicker
                  size="small"
                  style={{ width: 150 }}
                  format="YYYY-MM-DD"
                  allowClear={false}
                  onChange={(value) => value && loadReport(value.format('YYYY-MM-DD'))}
                />
              </Form.Item>
              <Tag color={isReadonly ? 'red' : isSubmitted ? 'blue' : 'green'} style={{ marginInlineEnd: 0 }}>
                {isReadonly ? '已锁定' : isSubmitted ? '可修改' : '未提交'}
              </Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {statusMessage} 修改次数：{report.editCount}/{report.maxEditCount}
              </Text>
            </div>
            <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              每日仅提交一次，提交后可修改一次；未做事项保持 0。
            </Text>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: compactGridColumns,
            gap: 8,
            alignItems: 'center',
            padding: '0 10px 6px',
            color: '#64748b',
            fontSize: 12,
            fontWeight: 600,
          }}>
            <span>事项</span>
            <span>数量</span>
            <span>父体SKU / 单条SKC</span>
            <span>平台</span>
            <span>备注</span>
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            {FIXED_REPORT_ITEMS.map((item, index) => (
              <div
                key={item.taskType}
                style={{
                  display: 'grid',
                  gridTemplateColumns: compactGridColumns,
                  gap: 8,
                  alignItems: 'start',
                  padding: '8px 10px',
                  minHeight: 74,
                  border: '1px solid #eef2f7',
                  borderRadius: 10,
                  background: index % 2 === 0 ? '#ffffff' : '#fafafa',
                }}
              >
                <div style={{ paddingTop: 6 }}>
                  <Text strong>{item.taskName}</Text>
                </div>
                <Form.Item name={['items', index, 'taskType']} hidden initialValue={item.taskType}>
                  <Input />
                </Form.Item>
                <Form.Item name={['items', index, 'taskName']} hidden initialValue={item.taskName}>
                  <Input />
                </Form.Item>
                {item.taskType === 'OTHER' ? (
                  <Form.Item name={['items', index, 'detail']} style={{ gridColumn: '2 / -1', marginBottom: 0 }}>
                    <TextArea autoSize={{ minRows: 1, maxRows: 2 }} placeholder="填写其他事项说明，可为空" />
                  </Form.Item>
                ) : (
                  <>
                    <Form.Item
                      name={['items', index, 'quantity']}
                      style={{ marginBottom: 0 }}
                      rules={[{ required: true, message: '请输入数量' }]}
                    >
                      <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name={['items', index, 'linksText']} style={{ marginBottom: 0 }}>
                      <TextArea autoSize={{ minRows: 1, maxRows: 2 }} placeholder="多个父体SKU / 单条SKC 请用英文逗号分隔，例如：PARENT001, SKC002" />
                    </Form.Item>
                    <Form.Item name={['items', index, 'detail']} style={{ marginBottom: 0 }}>
                      <TextArea autoSize={{ minRows: 1, maxRows: 2 }} placeholder="填写平台，如 SHEIN / TEMU / AliExpress / eMAG / Amazon，可为空" />
                    </Form.Item>
                    <Form.Item name={['items', index, 'blockerReason']} style={{ marginBottom: 0 }}>
                      <TextArea autoSize={{ minRows: 1, maxRows: 2 }} placeholder="填写备注，可为空" />
                    </Form.Item>
                  </>
                )}
              </div>
            ))}
          </div>
          <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
            没有做的事项保持 0 即可；多个父体SKU / 单条SKC 请用英文逗号分隔，未填写也可以提交。
          </Text>
        </Form>
      </Spin>
    </Modal>
  );
}
