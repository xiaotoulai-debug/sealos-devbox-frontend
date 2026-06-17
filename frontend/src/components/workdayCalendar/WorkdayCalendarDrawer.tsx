import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Calendar,
  ConfigProvider,
  DatePicker,
  Drawer,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Spin,
  Typography,
  message,
} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import {
  batchUpdateWorkdayCalendar,
  fetchWorkdayCalendar,
  getBackendMessage,
  updateWorkdayCalendarDay,
} from './api';
import type { WorkdayCalendarDayDto, WorkdayStatus } from './types';
import { WORKDAY_STATUS_LABELS, WORKDAY_STATUS_STYLES } from './types';

dayjs.locale('zh-cn');

const { Text } = Typography;
const { RangePicker } = DatePicker;

const MONTH_OPTIONS = Array.from({ length: 12 }).map((_, index) => ({
  label: `${index + 1}月`,
  value: index,
}));

function buildDayMap(days?: WorkdayCalendarDayDto[]) {
  const map = new Map<string, WorkdayCalendarDayDto>();
  if (!Array.isArray(days)) return map;
  days.forEach((day) => {
    if (day?.date) map.set(day.date, day);
  });
  return map;
}

function enumerateDates(start: Dayjs, end: Dayjs): string[] {
  const dates: string[] = [];
  let cursor = start.startOf('day');
  const last = end.startOf('day');
  while (cursor.isBefore(last) || cursor.isSame(last, 'day')) {
    dates.push(cursor.format('YYYY-MM-DD'));
    cursor = cursor.add(1, 'day');
  }
  return dates;
}

function StatusBadge({ status }: { status: WorkdayStatus }) {
  const style = WORKDAY_STATUS_STYLES[status];
  return (
    <span
      style={{
        display: 'inline-block',
        marginTop: 4,
        padding: '0 6px',
        borderRadius: 6,
        fontSize: 11,
        lineHeight: '18px',
        ...style,
      }}
    >
      {WORKDAY_STATUS_LABELS[status]}
    </span>
  );
}

export default function WorkdayCalendarDrawer({
  open,
  canEdit,
  onClose,
  onChanged,
}: {
  open: boolean;
  canEdit: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [year, setYear] = useState(dayjs().year());
  const [panelMonth, setPanelMonth] = useState(dayjs());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [days, setDays] = useState<WorkdayCalendarDayDto[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [viewDay, setViewDay] = useState<WorkdayCalendarDayDto | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editForm] = Form.useForm<{ status: WorkdayStatus; remark?: string }>();
  const [batchForm] = Form.useForm<{ range: [Dayjs, Dayjs]; status: WorkdayStatus; remark?: string }>();

  const dayMap = useMemo(() => buildDayMap(days), [days]);

  const loadCalendar = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError('');
    try {
      const payload = await fetchWorkdayCalendar(year);
      setDays(Array.isArray(payload?.days) ? payload.days : []);
    } catch (err) {
      setDays([]);
      setError(getBackendMessage(err, '加载运营日历失败'));
    } finally {
      setLoading(false);
    }
  }, [open, year]);

  useEffect(() => {
    if (!open) return;
    loadCalendar();
  }, [loadCalendar, open]);

  const getStatusForDate = (date: Dayjs): WorkdayStatus => {
    return dayMap.get(date.format('YYYY-MM-DD'))?.status ?? 'PENDING';
  };

  const openDayModal = (date: Dayjs) => {
    const key = date.format('YYYY-MM-DD');
    const existing = dayMap.get(key);
    const status = existing?.status ?? 'PENDING';
    setViewDay({
      date: key,
      status,
      remark: existing?.remark ?? null,
      updatedByName: existing?.updatedByName ?? null,
      updatedAt: existing?.updatedAt ?? null,
    });
    editForm.setFieldsValue({ status, remark: existing?.remark ?? undefined });
    setEditOpen(true);
  };

  const handleSaveDay = async () => {
    if (!viewDay || !canEdit) return;
    try {
      const values = await editForm.validateFields();
      setSubmitting(true);
      await updateWorkdayCalendarDay(viewDay.date, {
        status: values.status,
        remark: values.remark?.trim() || undefined,
      });
      message.success('运营日历已更新');
      setEditOpen(false);
      setViewDay(null);
      await loadCalendar();
      onChanged?.();
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(getBackendMessage(err, '更新运营日状态失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleBatchSave = async () => {
    if (!canEdit) return;
    try {
      const values = await batchForm.validateFields();
      const [start, end] = values.range;
      const dates = enumerateDates(start, end);
      if (dates.length === 0) {
        message.warning('请选择有效日期范围');
        return;
      }
      setSubmitting(true);
      await batchUpdateWorkdayCalendar({
        dates,
        status: values.status,
        remark: values.remark?.trim() || undefined,
      });
      message.success(`已批量更新 ${dates.length} 天`);
      setBatchOpen(false);
      batchForm.resetFields();
      await loadCalendar();
      onChanged?.();
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(getBackendMessage(err, '批量更新运营日状态失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const yearOptions = useMemo(() => {
    const current = dayjs().year();
    return [current - 1, current, current + 1].map((value) => ({ value, label: `${value}年` }));
  }, []);

  const calendarHeaderRender = useCallback(({
    value,
    type,
    onChange,
    onTypeChange,
  }: {
    value: Dayjs;
    type: string;
    onChange: (date: Dayjs) => void;
    onTypeChange: (type: string) => void;
  }) => {
    const current = dayjs(value);
    const currentYear = current.year();
    const currentMonth = current.month();
    const inlineYearOptions = Array.from({ length: 11 }).map((_, index) => {
      const y = currentYear - 5 + index;
      return { label: `${y}年`, value: y };
    });

    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          padding: '8px 0',
          flexWrap: 'wrap',
        }}
      >
        <Select
          size="small"
          value={currentYear}
          options={inlineYearOptions}
          style={{ width: 96 }}
          onChange={(nextYear) => {
            const next = current.year(nextYear);
            setYear(nextYear);
            setPanelMonth(next);
            onChange(next);
          }}
        />
        <Select
          size="small"
          value={currentMonth}
          options={MONTH_OPTIONS}
          style={{ width: 80 }}
          onChange={(nextMonth) => {
            const next = current.month(nextMonth);
            setPanelMonth(next);
            onChange(next);
          }}
        />
        <Radio.Group
          size="small"
          value={type}
          onChange={(event) => onTypeChange(event.target.value)}
          optionType="button"
          buttonStyle="solid"
          options={[
            { label: '月', value: 'month' },
            { label: '年', value: 'year' },
          ]}
        />
      </div>
    );
  }, []);

  return (
    <ConfigProvider locale={zhCN}>
      <>
      <Drawer
        open={open}
        width={760}
        title="运营日历表"
        onClose={onClose}
        extra={(
          <Space wrap>
            <Select
              value={year}
              style={{ width: 110 }}
              options={yearOptions}
              onChange={(value) => {
                setYear(value);
                setPanelMonth(dayjs(`${value}-01-01`));
              }}
            />
            <Button loading={loading} onClick={loadCalendar}>刷新</Button>
            {canEdit && (
              <>
                <Button onClick={() => { batchForm.setFieldsValue({ status: 'WORKDAY' }); setBatchOpen(true); }}>批量设置运营日</Button>
                <Button onClick={() => { batchForm.setFieldsValue({ status: 'REST' }); setBatchOpen(true); }}>批量设置休息日</Button>
                <Button onClick={() => { batchForm.setFieldsValue({ status: 'PENDING' }); setBatchOpen(true); }}>批量设置待定</Button>
              </>
            )}
          </Space>
        )}
      >
        <Spin spinning={loading}>
          {error && <Alert type="warning" showIcon message={error} style={{ marginBottom: 12, borderRadius: 10 }} />}
          <div style={{ marginBottom: 12 }}>
            <Space size={[12, 8]} wrap>
              {(Object.keys(WORKDAY_STATUS_LABELS) as WorkdayStatus[]).map((status) => (
                <StatusBadge key={status} status={status} />
              ))}
            </Space>
            <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
              未编辑日期默认显示为「待定」，颜色较淡；运营日代表需要进行每日任务登记的日期。{canEdit ? '点击日期可编辑状态。' : '当前为只读查看。'}
            </Text>
          </div>
          <Calendar
            value={panelMonth}
            fullscreen={false}
            onPanelChange={(value) => {
              setPanelMonth(value);
              if (value.year() !== year) setYear(value.year());
            }}
            onSelect={(value) => openDayModal(value)}
            headerRender={calendarHeaderRender}
            cellRender={(date, info) => {
              if (info.type !== 'date') return info.originNode;
              const status = getStatusForDate(date);
              const isCurrentMonth = date.month() === panelMonth.month();
              return (
                <div
                  style={{
                    minHeight: 68,
                    padding: 4,
                    borderRadius: 8,
                    opacity: isCurrentMonth ? 1 : 0.45,
                  }}
                >
                  <StatusBadge status={status} />
                </div>
              );
            }}
          />
        </Spin>
      </Drawer>

      <Modal
        open={editOpen}
        title={canEdit ? '编辑运营日状态' : '查看运营日状态'}
        onCancel={() => { setEditOpen(false); setViewDay(null); }}
        onOk={canEdit ? handleSaveDay : undefined}
        okText={canEdit ? '保存' : undefined}
        cancelText="关闭"
        confirmLoading={submitting}
        footer={canEdit ? undefined : [
          <Button key="close" onClick={() => { setEditOpen(false); setViewDay(null); }}>关闭</Button>,
        ]}
      >
        {viewDay && (
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>日期：{viewDay.date}</Text>
            {canEdit ? (
              <Form form={editForm} layout="vertical">
                <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
                  <Radio.Group>
                    {(Object.keys(WORKDAY_STATUS_LABELS) as WorkdayStatus[]).map((status) => (
                      <Radio.Button key={status} value={status}>{WORKDAY_STATUS_LABELS[status]}</Radio.Button>
                    ))}
                  </Radio.Group>
                </Form.Item>
                <Form.Item name="remark" label="备注">
                  <Input.TextArea rows={3} placeholder="可选，例如：端午节调休" />
                </Form.Item>
              </Form>
            ) : (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <div><Text type="secondary">状态：</Text><StatusBadge status={viewDay.status} /></div>
                <div><Text type="secondary">备注：</Text>{viewDay.remark || '—'}</div>
                <div><Text type="secondary">最后更新人：</Text>{viewDay.updatedByName || '—'}</div>
                <div><Text type="secondary">最后更新时间：</Text>{viewDay.updatedAt || '—'}</div>
              </Space>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={batchOpen}
        title="批量设置运营日状态"
        onCancel={() => { setBatchOpen(false); batchForm.resetFields(); }}
        onOk={handleBatchSave}
        okText="保存"
        confirmLoading={submitting}
      >
        <Form form={batchForm} layout="vertical">
          <Form.Item name="range" label="日期范围" rules={[{ required: true, message: '请选择日期范围' }]}>
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
            <Radio.Group>
              {(Object.keys(WORKDAY_STATUS_LABELS) as WorkdayStatus[]).map((status) => (
                <Radio.Button key={status} value={status}>{WORKDAY_STATUS_LABELS[status]}</Radio.Button>
              ))}
            </Radio.Group>
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>
      </>
    </ConfigProvider>
  );
}
