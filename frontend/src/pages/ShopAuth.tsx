import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Tag, Button, Modal, Input, Space, message,
  Empty, Switch, Tooltip, Steps, Result, Spin, Popconfirm, Badge, Select,
} from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import {
  PlusOutlined, SafetyCertificateOutlined, DeleteOutlined,
  ReloadOutlined,
  LinkOutlined, ShopOutlined, EditOutlined,
} from '@ant-design/icons';
import request from '../lib/request';

// ─── 类型 ────────────────────────────────────────────────────────

interface ShopRecord {
  id: number;
  platform: string;
  shopName: string;
  region?: string | null;
  site?: string | null;
  businessModel: string;
  apiKey: string;
  apiSecret: string;
  accessToken: string | null;
  refreshToken: string | null;
  supplierId: string | null;
  expiresAt: string | null;
  status: string;
  isSandbox: boolean;
  createdAt: string;
}

// eMAG 站点选项
const EMAG_SITE_OPTIONS = [
  { value: 'RO', label: '罗马尼亚', flag: '🇷🇴' },
  { value: 'BG', label: '保加利亚', flag: '🇧🇬' },
  { value: 'HU', label: '匈牙利', flag: '🇭🇺' },
];

// 站点映射（表格渲染用）
const SITE_MAP: Record<string, string> = {
  RO: '🇷🇴 罗马尼亚',
  BG: '🇧🇬 保加利亚',
  HU: '🇭🇺 匈牙利',
};

// 判断凭证是否为脱敏/占位（未真实修改）
function isMaskedUsername(val: string | undefined): boolean {
  return !val || String(val).includes('****');
}
function isMaskedPassword(val: string | undefined): boolean {
  const s = String(val ?? '').trim();
  return s === '' || s === '........' || s === '********' || /^\.+$/.test(s);
}

// ─── 平台配置 ────────────────────────────────────────────────────

type BizModel = 'TRADITIONAL' | 'FULLY_MANAGED';

interface PlatformDef {
  key: string;
  label: string;
  color: string;
  desc: string;
  bizModel: BizModel;
  badge?: string;
  subLabel?: string;
}

const PLATFORMS: PlatformDef[] = [
  { key: 'eMAG',       label: 'eMAG',       color: '#ff6600', desc: '罗马尼亚 / 保加利亚 / 匈牙利',  bizModel: 'TRADITIONAL' },
  { key: 'Shein',      label: 'Shein',      color: '#000000', desc: '全球快时尚 — 全品类扩展',       bizModel: 'FULLY_MANAGED', badge: '全托管', subLabel: 'Gegehu / 尊豪系统授权' },
  { key: 'Temu',       label: 'Temu',       color: '#f45a2a', desc: '拼多多跨境 — 全品类',           bizModel: 'FULLY_MANAGED', badge: '全托管', subLabel: '卖家中心 / 全托管入口' },
  { key: 'Amazon',     label: 'Amazon',     color: '#ff9900', desc: '欧洲 / 北美 / 日本',            bizModel: 'TRADITIONAL' },
  { key: 'AliExpress', label: 'AliExpress', color: '#ff4747', desc: '全球速卖通',                    bizModel: 'TRADITIONAL' },
  { key: 'Other',      label: '其他平台',    color: '#8c8c8c', desc: '手动配置 API 凭证',             bizModel: 'TRADITIONAL' },
];

interface FieldDef { key: string; label: string; required: boolean; secret?: boolean; placeholder?: string; }

interface PlatformFieldConfig {
  fields: FieldDef[];
  tip?: React.ReactNode;
}

const PLATFORM_FIELDS: Record<string, PlatformFieldConfig> = {
  eMAG: {
    fields: [
      { key: 'apiKey',    label: 'Username (API 账号)', required: true,  placeholder: 'eMAG Marketplace → My Account → API Settings' },
      { key: 'apiSecret', label: 'Password (API 密码)', required: true,  secret: true, placeholder: 'HTTP Basic Auth 密码' },
    ],
    tip: (
      <>
        <strong>eMAG 对接指引：</strong><br />
        登录 eMAG Marketplace 后台 &rarr; My Account &rarr; API Settings &rarr; 获取 Username / Password。<br />
        eMAG 使用 HTTP Basic Auth 鉴权，无需 OAuth Token。
      </>
    ),
  },
  Shein: {
    fields: [
      { key: 'supplierId', label: '供应商 ID (Supplier ID)',  required: true,  placeholder: 'Gegehu/尊豪系统中的供应商编号' },
      { key: 'apiKey',     label: '开放平台 App Key',         required: true,  placeholder: 'Shein Open Platform App Key' },
      { key: 'apiSecret',  label: '开放平台 App Secret',      required: true,  secret: true, placeholder: 'App Secret' },
      { key: 'accessToken', label: 'Access Token',            required: false, secret: true, placeholder: 'OAuth 授权后的 Access Token (可后续补填)' },
    ],
    tip: (
      <>
        <strong>Shein 全托管对接指引：</strong><br />
        1. 登录 <b>Gegehu / 尊豪系统</b>，在供应商设置中获取 Supplier ID。<br />
        2. 在 Shein 开放平台 (open.shein.com) 创建应用，获取 App Key / Secret。<br />
        3. 全托管模式下，订单同步走「<b>备货单 → 发货至备货仓</b>」流程，而非直发买家。
      </>
    ),
  },
  Temu: {
    fields: [
      { key: 'supplierId',  label: 'Supplier ID (供应商编号)', required: true,  placeholder: 'Temu 卖家中心 → 账号设置 → 供应商 ID' },
      { key: 'accessToken', label: 'Access Token',            required: true,  secret: true, placeholder: 'Temu Open API Access Token' },
      { key: 'apiKey',      label: 'App Key (可选)',           required: false, placeholder: '如使用开放 API 则填写' },
      { key: 'apiSecret',   label: 'App Secret (可选)',        required: false, secret: true, placeholder: 'App Secret' },
    ],
    tip: (
      <>
        <strong>Temu 全托管对接指引：</strong><br />
        1. 登录 <b>Temu 卖家中心</b> (seller.temu.com)，进入「全托管」入口。<br />
        2. 在账号设置中获取 Supplier ID；在开放平台获取 Access Token。<br />
        3. 全托管模式下，订单同步走「<b>备货单 → 发货至备货仓</b>」流程，平台负责终端配送。
      </>
    ),
  },
  Amazon: {
    fields: [
      { key: 'apiKey',      label: 'Client ID (LWA)',            required: true,  placeholder: 'Login with Amazon Client ID' },
      { key: 'apiSecret',   label: 'Client Secret (LWA)',        required: true,  secret: true, placeholder: 'Client Secret' },
      { key: 'accessToken', label: 'Refresh Token (SP-API)',     required: false, secret: true, placeholder: 'SP-API Refresh Token' },
    ],
    tip: (
      <>
        <strong>Amazon SP-API 对接指引：</strong><br />
        在 Seller Central &rarr; Apps &amp; Services &rarr; Develop Apps 中获取 LWA 凭证和 Refresh Token。
      </>
    ),
  },
  AliExpress: {
    fields: [
      { key: 'apiKey',      label: 'App Key',      required: true,  placeholder: 'AliExpress App Key' },
      { key: 'apiSecret',   label: 'App Secret',   required: true,  secret: true, placeholder: 'App Secret' },
      { key: 'accessToken', label: 'Access Token',  required: false, secret: true, placeholder: 'OAuth Access Token' },
    ],
  },
  Other: {
    fields: [
      { key: 'apiKey',    label: 'API Key / 账号',     required: true,  placeholder: '平台 API Key 或登录账号' },
      { key: 'apiSecret', label: 'API Secret / 密码',  required: true, secret: true, placeholder: '密码或密钥' },
    ],
  },
};

function platformColor(p: string) {
  return PLATFORMS.find((x) => x.key === p)?.color ?? '#8c8c8c';
}

function platformDef(p: string) {
  return PLATFORMS.find((x) => x.key === p);
}

// ─── 列表主组件 ──────────────────────────────────────────────────

export default function ShopAuth() {
  const [shops, setShops]       = useState<ShopRecord[]>([]);
  const [loading, setLoading]   = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ShopRecord | null>(null);

  const fetchShops = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await request.get<{ code: number; data: ShopRecord[] }>('/shops', {
        params: { _t: Date.now() },
      });
      setShops(Array.isArray(res.data) ? res.data : []);
    } catch { message.error('加载店铺列表失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchShops(); }, [fetchShops]);

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/shops/${id}`);
      message.success('已删除');
      fetchShops();
    } catch { message.error('删除失败'); }
  };

  const handleVerify = async (id: number) => {
    const hide = message.loading('正在验证连接...', 0);
    try {
      const { data: res } = await request.post<{ code: number; data: { verified: boolean; detail: string }; message: string }>(`/shops/${id}/verify`);
      hide();
      if (res.data?.verified) {
        Modal.success({ title: '验证通过', content: res.data.detail, okText: '好的' });
      } else {
        Modal.warning({ title: '验证未通过', content: res.data?.detail ?? res.message, okText: '我知道了', width: 480 });
      }
      fetchShops();
    } catch { hide(); message.error('验证请求失败'); }
  };

  const columns: ColumnsType<ShopRecord> = [
    {
      title: '平台', dataIndex: 'platform', width: 140,
      render: (v: string, r: ShopRecord) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Tag style={{ borderColor: platformColor(v), color: platformColor(v), fontWeight: 600, fontSize: 13, padding: '2px 12px', borderRadius: 6 }} bordered>
            {v}
          </Tag>
          {r.businessModel === 'FULLY_MANAGED' && (
            <Tag color="volcano" bordered={false} style={{ fontSize: 11, fontWeight: 600, borderRadius: 4 }}>全托管</Tag>
          )}
        </div>
      ),
    },
    {
      title: '站点', dataIndex: 'region', key: 'region', width: 120, align: 'center',
      render: (_: unknown, r: ShopRecord) => {
        if (r.platform !== 'eMAG') return <span style={{ color: '#bfbfbf' }}>—</span>;
        return <span>{SITE_MAP[r.region as string] || '—'}</span>;
      },
    },
    {
      title: '店铺名称', dataIndex: 'shopName', width: 200,
      render: (v: string, r: ShopRecord) => (
        <div>
          <span style={{ fontWeight: 600, color: '#1e293b' }}>{v}</span>
          {r.isSandbox && <Tag color="orange" bordered={false} style={{ marginLeft: 8, fontSize: 11 }}>沙箱</Tag>}
        </div>
      ),
    },
    {
      title: '运营模式', dataIndex: 'businessModel', width: 120, align: 'center',
      render: (v: string) => v === 'FULLY_MANAGED'
        ? <Tag color="volcano" bordered={false} style={{ fontWeight: 600 }}>全托管</Tag>
        : <Tag bordered={false} style={{ color: '#64748b' }}>自营发货</Tag>,
    },
    {
      title: '凭证摘要', dataIndex: 'apiKey', width: 170,
      render: (v: string, r: ShopRecord) => (
        <div>
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{v}</span>
          {r.supplierId && (
            <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 2 }}>供应商: {r.supplierId}</div>
          )}
        </div>
      ),
    },
    {
      title: '过期时间', dataIndex: 'expiresAt', width: 160,
      render: (v: string | null) => {
        if (!v) return <span style={{ color: '#bfbfbf' }}>永久有效</span>;
        const d = new Date(v);
        const isExpired = d < new Date();
        return <span style={{ color: isExpired ? '#ff4d4f' : '#52c41a', fontWeight: 500 }}>{d.toLocaleDateString('zh-CN')} {d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>;
      },
    },
    {
      title: '状态', dataIndex: 'status', width: 100, align: 'center',
      render: (v: string) => {
        const map: Record<string, { color: string; text: string }> = {
          active:  { color: 'success', text: '正常' },
          expired: { color: 'error',   text: '已过期' },
          error:   { color: 'warning', text: '异常' },
        };
        const s = map[v] ?? map.error;
        return (
          <Badge
            status={s.color as 'success' | 'processing' | 'default' | 'error' | 'warning'}
            text={<span style={{ fontWeight: 500 }}>{s.text}</span>}
          />
        );
      },
    },
    {
      title: '操作', key: 'actions', width: 160, fixed: 'right',
      render: (_: unknown, r: ShopRecord) => (
        <Space size={4}>
          <Tooltip title="验证连接"><Button type="text" icon={<SafetyCertificateOutlined style={{ color: '#2563eb' }} />} onClick={() => handleVerify(r.id)} /></Tooltip>
          <Tooltip title="编辑">
            <Button type="text" icon={<EditOutlined style={{ color: '#2563eb' }} />} onClick={() => { setEditingRecord(r); setModalOpen(true); }} />
          </Tooltip>
          <Popconfirm title="确定要删除此店铺授权吗？" onConfirm={() => handleDelete(r.id)} okText="确定" cancelText="取消">
            <Tooltip title="删除"><Button type="text" danger icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShopOutlined style={{ color: '#2563eb' }} /> 店铺授权管理
          </h2>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>
            管理所有跨境电商平台的 API 凭证，支持传统自营与全托管模式
          </p>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchShops} loading={loading}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingRecord(null); setModalOpen(true); }}
            style={{ boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}
          >
            新增授权
          </Button>
        </Space>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
        <Table<ShopRecord>
          dataSource={shops} columns={columns} rowKey="id" loading={loading}
          pagination={false} scroll={{ x: 1320 }}
          locale={{ emptyText: <Empty description="暂无授权店铺" style={{ padding: 40 }} /> }}
        />
      </div>

      <AddShopModal
        open={modalOpen}
        editRecord={editingRecord}
        onCancel={() => { setModalOpen(false); setEditingRecord(null); }}
        onDone={() => { setModalOpen(false); setEditingRecord(null); fetchShops(); }}
      />
    </div>
  );
}

// ─── 新增/编辑店铺弹窗 (分步向导) ───────────────────────────────────

interface AddShopModalProps {
  open: boolean;
  editRecord?: ShopRecord | null;
  onCancel: () => void;
  onDone: () => void;
}

function AddShopModal({ open, editRecord, onCancel, onDone }: AddShopModalProps) {
  const isEdit = !!editRecord;
  const [step, setStep]           = useState(0);
  const [platform, setPlatform]   = useState('');
  const [shopName, setShopName]   = useState('');
  const [site, setSite]           = useState<string>('RO');
  const [isSandbox, setIsSandbox] = useState(false);
  const [fields, setFields]       = useState<Record<string, string>>({});
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ verified: boolean; detail: string } | null>(null);
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    if (open) {
      if (editRecord) {
        setStep(1);
        setPlatform(editRecord.platform);
        setShopName(editRecord.shopName ?? '');
        setSite((editRecord.region ?? editRecord.site ?? 'RO') as string);
        setIsSandbox(editRecord.isSandbox ?? false);
        setFields({
          apiKey: editRecord.apiKey ?? '',
          apiSecret: editRecord.apiSecret ?? '',
          accessToken: editRecord.accessToken ?? '',
          refreshToken: editRecord.refreshToken ?? '',
          supplierId: editRecord.supplierId ?? '',
        });
        setVerifyResult(null);
      } else {
        setStep(0);
        setPlatform('');
        setShopName('');
        setSite('RO');
        setIsSandbox(false);
        setFields({});
        setVerifyResult(null);
      }
    }
  }, [open, editRecord]);

  const pDef = platformDef(platform);
  const pFields = PLATFORM_FIELDS[platform] ?? PLATFORM_FIELDS.Other;
  const currentFields = pFields.fields;
  const isFullyManaged = pDef?.bizModel === 'FULLY_MANAGED';

  const handleSave = async () => {
    if (!shopName.trim()) { message.warning('请填写店铺名称'); return; }
    if (platform === 'eMAG' && !site) { message.warning('请选择站点区域'); return; }
    if (!isEdit) {
      for (const f of currentFields) {
        if (f.required && !fields[f.key]?.trim()) { message.warning(`请填写 ${f.label}`); return; }
      }
    } else {
      for (const f of currentFields) {
        if (f.required) {
          const val = fields[f.key]?.trim() ?? '';
          if (f.key === 'apiKey' && isMaskedUsername(val)) continue;
          if (f.key === 'apiSecret' && isMaskedPassword(val)) continue;
          if (!val) { message.warning(`请填写 ${f.label}`); return; }
        }
      }
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        platform, shopName: shopName.trim(), isSandbox,
        businessModel: pDef?.bizModel ?? 'TRADITIONAL',
      };
      if (platform === 'eMAG') { payload.region = site; payload.site = site; }
      if (isEdit) {
        if (!isMaskedUsername(fields.apiKey)) payload.apiKey = fields.apiKey ?? '';
        if (!isMaskedPassword(fields.apiSecret)) payload.apiSecret = fields.apiSecret ?? '';
        if (fields.accessToken?.trim() && !isMaskedPassword(fields.accessToken)) payload.accessToken = fields.accessToken;
        if (fields.refreshToken?.trim() && !isMaskedPassword(fields.refreshToken)) payload.refreshToken = fields.refreshToken;
        if (fields.supplierId?.trim()) payload.supplierId = fields.supplierId;
      } else {
        payload.apiKey = fields.apiKey ?? '';
        payload.apiSecret = fields.apiSecret ?? '';
        payload.accessToken = fields.accessToken || undefined;
        payload.refreshToken = fields.refreshToken || undefined;
        payload.supplierId = fields.supplierId || undefined;
      }
      if (isEdit && editRecord?.id) {
        const { data: res } = await request.put<{ code: number; message?: string }>(`/shops/${editRecord.id}`, payload);
        if (res.code === 200) {
          message.success('更新成功');
          onDone();
        } else {
          const errMsg = res.message ?? '';
          const isCredErr = /凭证|账号|密码|auth|invalid|unauthorized/i.test(String(errMsg));
          message.error(isCredErr ? 'API账号或密码错误，请重新输入真实的凭证' : errMsg);
        }
      } else {
        const { data: res } = await request.post<{ code: number; data: { id: number }; message: string }>('/shops', payload);
        if (res.code === 200) {
          const shopId = res.data.id;
          setStep(2);
          setVerifying(true);
          try {
            const { data: vr } = await request.post<{ code: number; data: { verified: boolean; detail: string } }>(`/shops/${shopId}/verify`);
            setVerifyResult(vr.data);
          } catch {
            setVerifyResult({ verified: false, detail: '验证请求失败，请稍后手动验证' });
          }
          setVerifying(false);
        } else { message.error(res.message); }
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '';
      const isCredentialError = /凭证|账号|密码|auth|invalid|unauthorized/i.test(String(msg));
      if (isEdit && isCredentialError) {
        message.error('API账号或密码错误，请重新输入真实的凭证');
      } else {
        message.error(msg || (isEdit ? '更新失败' : '保存失败'));
      }
    }
    finally { setSaving(false); }
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LinkOutlined style={{ color: '#2563eb', fontSize: 18 }} />
          <span style={{ fontWeight: 600, fontSize: 16 }}>{isEdit ? '更新店铺授权' : '新增店铺授权'}</span>
        </div>
      }
      open={open} onCancel={onCancel} width={680} destroyOnClose maskClosable={false}
      footer={
        step === 2 ? (
          <Button type="primary" size="large" onClick={onDone} style={{ minWidth: 120 }}>完成</Button>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button onClick={step === 0 ? onCancel : () => setStep(step - 1)} size="large" disabled={isEdit && step === 1}>
              {step === 0 ? '取消' : '上一步'}
            </Button>
            {step === 0 && !isEdit && (
              <Button type="primary" size="large" disabled={!platform}
                onClick={() => setStep(1)} style={{ minWidth: 100 }}>
                下一步
              </Button>
            )}
            {step === 1 && (
              <Button type="primary" size="large" loading={saving}
                onClick={handleSave} style={{ minWidth: 140, boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
                {isEdit ? '保存更新' : '保存并验证'}
              </Button>
            )}
          </div>
        )
      }
    >
      {!isEdit && (
        <Steps current={step} size="small" style={{ marginBottom: 28 }}
          items={[
            { title: '选择平台' },
            { title: '填写凭证' },
            { title: '验证结果' },
          ]}
        />
      )}

      {/* ── Step 0: 选择平台 ── */}
      {step === 0 && (
        <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {PLATFORMS.map((p) => {
            const selected = platform === p.key;
            return (
              <div
                key={p.key}
                onClick={() => setPlatform(p.key)}
                style={{
                  padding: '16px 18px', borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s',
                  border: selected ? `2px solid ${p.color}` : '2px solid #f0f0f0',
                  background: selected ? `${p.color}08` : '#fafafa',
                  boxShadow: selected ? `0 0 0 3px ${p.color}20` : 'none',
                  position: 'relative', overflow: 'hidden',
                }}
              >
                {p.badge && (
                  <div style={{
                    position: 'absolute', top: 0, right: 0,
                    background: '#ff4d4f', color: '#fff', fontSize: 10, fontWeight: 700,
                    padding: '2px 10px 2px 14px', borderRadius: '0 10px 0 8px',
                    letterSpacing: 1,
                  }}>
                    {p.badge}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `${p.color}15`, color: p.color, fontWeight: 800, fontSize: 15, flexShrink: 0,
                  }}>
                    {p.label.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{p.label}</div>
                    {p.subLabel && (
                      <div style={{ fontSize: 11, color: p.color, fontWeight: 600, marginTop: 1 }}>{p.subLabel}</div>
                    )}
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{p.desc}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {/* eMAG 选中时立即显示站点选择 */}
        {platform === 'eMAG' && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              站点区域 <span style={{ color: '#ff4d4f' }}>*</span>
            </div>
            <Select
              size="large"
              value={site}
              onChange={setSite}
              options={EMAG_SITE_OPTIONS.map((o) => ({ value: o.value, label: `${o.flag} ${o.label}` }))}
              style={{ width: '100%' }}
              placeholder="请选择站点区域"
              allowClear={false}
            />
          </div>
        )}
        </div>
      )}

      {/* ── Step 1: 填写凭证 ── */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* 全托管醒目横幅 */}
          {isFullyManaged && (
            <div style={{
              padding: '10px 16px', borderRadius: 8,
              background: 'linear-gradient(135deg, #fff1f0 0%, #fff7e6 100%)',
              border: '1px solid #ffccc7', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Tag color="volcano" style={{ fontWeight: 700, fontSize: 13, borderRadius: 6, margin: 0 }}>全托管模式</Tag>
              <span style={{ fontSize: 13, color: '#8c4a2f' }}>
                订单同步将指向「<b>备货单 → 发货至备货仓</b>」，平台负责终端物流配送。
              </span>
            </div>
          )}

          {/* eMAG 站点区域 */}
          {platform === 'eMAG' && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                站点区域 <span style={{ color: '#ff4d4f' }}>*</span>
              </div>
              <Select
                size="large"
                value={site}
                onChange={setSite}
                options={EMAG_SITE_OPTIONS.map((o) => ({ value: o.value, label: `${o.flag} ${o.label}` }))}
                style={{ width: '100%' }}
                placeholder="请选择站点区域"
                allowClear={false}
              />
            </div>
          )}

          {/* 店铺名称 */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              店铺名称 <span style={{ color: '#ff4d4f' }}>*</span>
            </div>
            <Input
              size="large" value={shopName} onChange={(e) => setShopName(e.target.value)}
              placeholder={`例如：我的${platform}${platform === 'eMAG' ? ` · ${EMAG_SITE_OPTIONS.find((o) => o.value === site)?.label ?? ''}` : ''}${isFullyManaged ? '全托管' : ''}店`} maxLength={50}
            />
          </div>

          {/* 沙箱开关 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: '#fffbe6', borderRadius: 8, border: '1px solid #ffe58f' }}>
            <span style={{ fontSize: 13, color: '#8c6d1f' }}>测试环境 (Sandbox)</span>
            <Switch checked={isSandbox} onChange={setIsSandbox} size="small" />
            <span style={{ fontSize: 12, color: '#bfbfbf' }}>{isSandbox ? '当前为沙箱模式' : '正式环境'}</span>
          </div>

          {/* 动态凭证字段 */}
          {currentFields.map((f) => (
            <div key={f.key}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                {f.label} {f.required && <span style={{ color: '#ff4d4f' }}>*</span>}
              </div>
              {f.secret ? (
                <Input.Password
                  size="large" value={fields[f.key] ?? ''}
                  onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                />
              ) : (
                <Input
                  size="large" value={fields[f.key] ?? ''}
                  onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                />
              )}
            </div>
          ))}

          {/* 平台专属提示 */}
          {pFields.tip && (
            <div style={{ padding: '10px 14px', background: '#f0f5ff', borderRadius: 8, border: '1px solid #d6e4ff', fontSize: 12, color: '#4080ff', lineHeight: 1.8 }}>
              {pFields.tip}
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: 验证结果 ── */}
      {step === 2 && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          {verifying ? (
            <Spin size="large" tip="正在验证连接..." style={{ padding: 40 }}>
              <div style={{ height: 80 }} />
            </Spin>
          ) : verifyResult?.verified ? (
            <Result
              status="success"
              title="店铺授权验证通过"
              subTitle={verifyResult.detail}
            />
          ) : (
            <Result
              status="warning"
              title="店铺已保存，但验证未通过"
              subTitle={verifyResult?.detail ?? '请检查凭证后重试'}
              extra={<span style={{ fontSize: 13, color: '#8c8c8c' }}>你可以在列表页重新点击「验证连接」按钮</span>}
            />
          )}
        </div>
      )}
    </Modal>
  );
}
