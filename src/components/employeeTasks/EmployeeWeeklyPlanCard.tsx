import { Button, Card, Input, Spin, Tag, Typography, message } from 'antd';
import { SaveOutlined, SendOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { fetchEmployeeWeeklyPlan, getBackendMessage, saveEmployeeWeeklyPlan } from './api';
import type { EmployeeWeeklyPlanData } from './types';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const CARD_STYLE = {
  marginTop: 16,
  borderRadius: 14,
  border: '1px solid #eef2f7',
  background: '#ffffff',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
} as const;

const FIELD_STYLE = {
  fontSize: 14,
  lineHeight: 1.6,
  minHeight: 80,
  maxHeight: 90,
  resize: 'none' as const,
  borderRadius: 10,
};

function sanitizePlanError(err: unknown, fallback: string): string {
  const raw = getBackendMessage(err, fallback);
  if (/employee_weekly_plans|migration|尚未创建/i.test(raw)) {
    console.error('[EmployeeWeeklyPlanCard] migration not applied:', raw, err);
    return '计划功能尚未启用，请联系管理员执行数据库 migration 后再试。';
  }
  if (/id.*正整数|id must be|must be a positive integer/i.test(raw)) {
    console.error('[EmployeeWeeklyPlanCard] backend id validation error:', raw, err);
    return '计划模块暂时无法加载，请联系管理员检查接口配置。';
  }
  if (raw === 'INVALID_WEEK_START') {
    console.error('[EmployeeWeeklyPlanCard] invalid weekStart');
    return '计划模块暂时无法加载，请刷新页面后重试。';
  }
  return raw;
}

function PlanField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      style={{
        border: '1px solid #eef2f7',
        borderRadius: 12,
        padding: '10px 12px',
        background: '#fafbfc',
      }}
    >
      <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13, color: '#0f172a' }}>
        {label}
      </Text>
      <TextArea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        style={FIELD_STYLE}
      />
    </div>
  );
}

interface EmployeeWeeklyPlanCardProps {
  weekStart: string;
}

export default function EmployeeWeeklyPlanCard({ weekStart }: EmployeeWeeklyPlanCardProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [planData, setPlanData] = useState<EmployeeWeeklyPlanData | null>(null);
  const [nextWeekPlan, setNextWeekPlan] = useState('');
  const [problems, setProblems] = useState('');
  const [supportNeeded, setSupportNeeded] = useState('');

  const syncForm = useCallback((data: EmployeeWeeklyPlanData | null) => {
    setNextWeekPlan(String(data?.nextWeekPlan ?? '').trim());
    setProblems(String(data?.problems ?? '').trim());
    setSupportNeeded(String(data?.supportNeeded ?? '').trim());
  }, []);

  const loadPlan = useCallback(async () => {
    const normalizedWeekStart = String(weekStart ?? '').trim();
    if (!normalizedWeekStart) {
      setLoadError('计划模块暂时无法加载，请刷新页面后重试。');
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const data = await fetchEmployeeWeeklyPlan(normalizedWeekStart);
      setPlanData(data);
      syncForm(data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setPlanData(null);
        syncForm(null);
        return;
      }
      const msg = sanitizePlanError(err, '加载下周计划失败');
      console.error('[EmployeeWeeklyPlanCard] load failed:', err);
      setLoadError(msg);
      setPlanData(null);
      syncForm(null);
    } finally {
      setLoading(false);
    }
  }, [syncForm, weekStart]);

  useEffect(() => {
    const normalizedWeekStart = String(weekStart ?? '').trim();
    if (!normalizedWeekStart) {
      setPlanData(null);
      syncForm(null);
      setLoadError('');
      return;
    }
    loadPlan();
  }, [loadPlan, syncForm, weekStart]);

  const handleSave = async (submit: boolean) => {
    const normalizedWeekStart = String(weekStart ?? '').trim();
    if (!normalizedWeekStart) {
      message.error('计划模块暂时无法保存，请刷新页面后重试。');
      return;
    }
    const payload = {
      weekStart: normalizedWeekStart,
      nextWeekPlan: nextWeekPlan.trim(),
      problems: problems.trim(),
      supportNeeded: supportNeeded.trim(),
      submit,
    };
    if (submit && !payload.nextWeekPlan && !payload.problems && !payload.supportNeeded) {
      message.warning('请至少填写一项内容后再提交');
      return;
    }
    if (submit) setSubmitting(true);
    else setSaving(true);
    try {
      const saved = await saveEmployeeWeeklyPlan(payload);
      setPlanData(saved);
      syncForm(saved);
      message.success(submit ? '已提交，AI 生成本周复盘时会参考这部分内容' : '草稿已保存');
    } catch (err) {
      const msg = sanitizePlanError(err, submit ? '提交失败' : '保存草稿失败');
      message.error(msg);
      console.error('[EmployeeWeeklyPlanCard] save failed:', err);
    } finally {
      setSaving(false);
      setSubmitting(false);
    }
  };

  const isSubmitted = Boolean(planData?.submittedAt);
  const statusTag = isSubmitted
    ? <Tag color="success" style={{ marginInlineEnd: 0 }}>已提交</Tag>
    : <Tag color="default" style={{ marginInlineEnd: 0 }}>草稿</Tag>;

  return (
    <Card
      size="small"
      title={(
        <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
          我的下周计划与问题
        </span>
      )}
      extra={statusTag}
      style={CARD_STYLE}
      styles={{
        header: { borderBottom: '1px solid #f1f5f9', minHeight: 48 },
        body: { padding: '14px 16px 16px' },
      }}
    >
      <Spin spinning={loading}>
        <Paragraph type="secondary" style={{ marginBottom: 14, fontSize: 13, lineHeight: 1.6 }}>
          这部分内容会作为 AI 周报参考，帮助主管了解你的计划、问题和需要支持的事项。
        </Paragraph>

        {loadError ? (
          <div
            style={{
              marginBottom: 14,
              padding: '10px 12px',
              borderRadius: 10,
              background: '#fffbeb',
              border: '1px solid #fde68a',
              color: '#92400e',
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {loadError}
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <PlanField
              label="下周重点计划"
              value={nextWeekPlan}
              onChange={setNextWeekPlan}
              placeholder="请输入你下周最重要的 1-3 件工作，例如：完成美国站半托管上架、跟进 FBE 入库单"
            />
          </div>
          <PlanField
            label="本周遇到的问题"
            value={problems}
            onChange={setProblems}
            placeholder="例如：任务推进卡点、资料缺失、跨部门协同问题"
          />
          <PlanField
            label="需要主管协助"
            value={supportNeeded}
            onChange={setSupportNeeded}
            placeholder="例如：需要确认策略、资源支持、优先级判断"
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <Button
            icon={<SaveOutlined />}
            loading={saving}
            disabled={submitting || loading}
            onClick={() => handleSave(false)}
          >
            保存草稿
          </Button>
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={submitting}
            disabled={saving || loading}
            onClick={() => handleSave(true)}
          >
            提交给主管
          </Button>
        </div>
      </Spin>
    </Card>
  );
}
