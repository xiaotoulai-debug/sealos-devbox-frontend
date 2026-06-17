import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Modal, Button, Tag, InputNumber, message } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import request from '../lib/request';

// ─── 公共数据行类型（调用方负责构造）────────────────────────────
export interface RepeatPurchaseRow {
  id:               number;   // 库存产品 ID（必须是本地库存 ID，非平台产品 ID）
  imageUrl:         string | null;
  sku:              string | null;
  chineseName:      string | null;
  purchasePrice:    number | null;
  purchaseQuantity: number;
}

export interface RepeatPurchaseModalProps {
  open:      boolean;
  rows:      RepeatPurchaseRow[];
  onCancel:  () => void;
  onSuccess: () => void;
}

const rpthStyle: React.CSSProperties = {
  padding: '12px 14px', textAlign: 'left', fontSize: 12,
  color: '#e2e8f0', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase',
  whiteSpace: 'nowrap',
};
const rptdStyle: React.CSSProperties = {
  padding: '10px 14px', verticalAlign: 'middle',
};

export default function RepeatPurchaseModal({ open, rows, onCancel, onSuccess }: RepeatPurchaseModalProps) {
  const [editData,   setEditData]   = useState<RepeatPurchaseRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setEditData(rows.map((r) => ({ ...r, purchaseQuantity: r.purchaseQuantity || 1 })));
    }
  }, [open, rows]);

  const updateRow = useCallback((idx: number, field: 'purchasePrice' | 'purchaseQuantity', val: number | null) => {
    setEditData((prev) => prev.map((row, i) => i === idx ? { ...row, [field]: val } : row));
  }, []);

  const grandTotal = useMemo(
    () => editData.reduce((sum, r) => sum + (r.purchasePrice ?? 0) * (r.purchaseQuantity ?? 0), 0),
    [editData],
  );

  const handleConfirm = async () => {
    const hasZero = editData.some((r) => !r.purchaseQuantity || r.purchaseQuantity <= 0);
    if (hasZero) { message.warning('每个产品的采购数量必须大于 0'); return; }
    setSubmitting(true);
    try {
      const items = editData.map((r) => ({
        id:               r.id,
        purchasePrice:    r.purchasePrice,
        purchaseQuantity: r.purchaseQuantity,
      }));
      const { data: res } = await request.put<{ code: number; message: string; data: { count: number } }>(
        '/products/batch-to-purchasing', { items },
      );
      if (res.code === 200) {
        message.success(res.message || '已推送');
        onSuccess();
      } else {
        message.error(res.message || '推送失败');
      }
    } catch {
      message.error('推送失败，请检查网络');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileTextOutlined style={{ color: '#52c41a', fontSize: 18 }} />
          <span style={{ fontWeight: 600, fontSize: 16 }}>创建采购计划（返单采购）</span>
          <Tag color="green" bordered={false} style={{ fontWeight: 600, fontSize: 13, borderRadius: 6 }}>
            🔄 {rows.length} 款产品
          </Tag>
        </div>
      }
      open={open} onCancel={onCancel} width={780} destroyOnClose maskClosable={false}
      footer={[
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button key="ok" type="primary" loading={submitting} onClick={handleConfirm}
          style={{ background: '#52c41a', borderColor: '#52c41a' }}
        >
          确认推送
        </Button>,
      ]}
    >
      <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 14 }}>
        请核对每个产品的采购单价与采购数量。已在采购计划中的产品将自动累加数量。
      </div>

      <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #e8e8e8', borderRadius: 10, background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#1e293b', position: 'sticky', top: 0, zIndex: 1 }}>
              <th style={{ ...rpthStyle, width: 200, borderRadius: '10px 0 0 0' }}>产品</th>
              <th style={{ ...rpthStyle, width: 180 }}>中文名</th>
              <th style={{ ...rpthStyle, width: 140 }}>采购单价 (¥)</th>
              <th style={{ ...rpthStyle, width: 120 }}>采购数量</th>
              <th style={{ ...rpthStyle, width: 120, borderRadius: '0 10px 0 0' }}>小计</th>
            </tr>
          </thead>
          <tbody>
            {editData.map((row, idx) => {
              const subtotal = (row.purchasePrice ?? 0) * (row.purchaseQuantity ?? 0);
              return (
                <tr key={row.id}
                  style={{ borderBottom: '1px solid #f0f0f0', transition: 'background 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
                >
                  <td style={{ ...rptdStyle, background: '#f9fafb', borderRight: '1px solid #f0f0f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {row.imageUrl
                        ? <img src={row.imageUrl} width={36} height={36} referrerPolicy="no-referrer"
                            style={{ borderRadius: 6, objectFit: 'cover', border: '1px solid #e8e8e8', flexShrink: 0 }} />
                        : <div style={{ width: 36, height: 36, borderRadius: 6, background: '#f0f0f0', flexShrink: 0 }} />}
                      <span style={{ fontFamily: "'Inter', monospace", fontSize: 12, fontWeight: 500, letterSpacing: 0.3, color: '#1e293b' }}>
                        {row.sku || '—'}
                      </span>
                    </div>
                  </td>
                  <td style={rptdStyle}>
                    <span style={{ fontSize: 13, color: '#475569' }}>{row.chineseName || '—'}</span>
                  </td>
                  <td style={rptdStyle}>
                    <InputNumber size="middle" value={row.purchasePrice}
                      onChange={(v) => updateRow(idx, 'purchasePrice', v)}
                      min={0} precision={2} style={{ width: '100%' }} prefix="¥" />
                  </td>
                  <td style={rptdStyle}>
                    <InputNumber size="middle" value={row.purchaseQuantity}
                      onChange={(v) => updateRow(idx, 'purchaseQuantity', v ?? 0)}
                      min={1} precision={0} style={{ width: '100%' }} suffix="件" />
                  </td>
                  <td style={{ ...rptdStyle, textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, color: '#d4380d', fontFeatureSettings: '"tnum"', fontSize: 13 }}>
                      ¥{subtotal.toFixed(2)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{
        background: '#f6f8fa', borderRadius: 10, padding: '14px 20px', marginTop: 16,
        display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 8,
      }}>
        <span style={{ fontSize: 14, color: '#595959' }}>
          本次共推送 <b style={{ color: '#1e293b', fontSize: 16 }}>{editData.length}</b> 款产品，总计金额：
        </span>
        <span style={{ fontSize: 22, fontWeight: 700, color: '#d4380d', fontFeatureSettings: '"tnum"' }}>
          ¥{grandTotal.toFixed(2)}
        </span>
      </div>
    </Modal>
  );
}
