import { useState, type ReactNode } from 'react';
import { Popover, Button, Descriptions, Divider, Tag, Tooltip } from 'antd';
import { WarningOutlined, EditOutlined } from '@ant-design/icons';
import CostCorrectionModal from './CostCorrectionModal';

// ─── 毛利推演明细类型（export 供 StoreProduct 接口使用） ────────────────────────
export interface ProfitBreakdown {
  salePrice?:             number | null;
  commissionRate?:        number | null;
  isEstimatedCommission?: boolean;
  fbe?:                   number | null;
  isEstimatedFbe?:        boolean;
  headFreightCny?:        number | null;
  purchaseCostCny?:       number | null;
  returnLossRate?:        number | null;
  profitCny?:             number | null;
  profitMarginPct?:       number | null;
  isMissingVolumeWeight?: boolean;          // true = 缺体积重量，头程运费未计入
}

// ─── Props：父组件负责萃取字段，子组件只负责渲染 ────────────────────────────────
interface ProfitBreakdownPopoverProps {
  pnk:              string;
  breakdown:        ProfitBreakdown | null;  // 由父组件读 r.profit_breakdown 传入
  profitLocal:      number | null;           // r.estimated_profit 或 r.estimatedProfitLocal
  profitCny:        number | null;
  marginPct:        number | null;           // 后端返回的数值（小数或百分比整数均可）
  price:            number | null;           // 售价（用于前端口算降级）
  currency:         string;
  purchaseCost:     number | null;           // 由父组件从 inventoryMap 预查后传入
  onCorrectionDone: () => void;
}

// ── 单行展示组件（flex 布局） ────────────────────────────────────────────────────
function DetailRow({
  label, children, warning,
}: { label: ReactNode; children: ReactNode; warning?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '3px 0', fontSize: 13,
    }}>
      <span style={{ color: '#64748b', flexShrink: 0, marginRight: 8 }}>{label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFeatureSettings: '"tnum"', fontWeight: 500 }}>
        {children}
        {warning && (
          <Tag color="orange" bordered={false}
            style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>
            估算
          </Tag>
        )}
      </span>
    </div>
  );
}

// ── 主组件 ───────────────────────────────────────────────────────────────────────
export default function ProfitBreakdownPopover({
  pnk, breakdown, profitLocal, profitCny, marginPct, price, currency, purchaseCost, onCorrectionDone,
}: ProfitBreakdownPopoverProps) {
  const [popoverOpen,    setPopoverOpen]    = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);

  const c            = currency.trim();
  const bd           = breakdown;
  const hasEstimates = !!(bd?.isEstimatedCommission || bd?.isEstimatedFbe);

  // ── 利润展示值：后端优先，前端口算降级 ───────────────────────────────────────
  const hasBe       = profitLocal != null;
  const fallback    = (!hasBe && price != null && purchaseCost != null)
    ? Number(price) - Number(purchaseCost) : null;
  const displayLocal = hasBe ? profitLocal : fallback;

  // 毛利率归一化（兼容后端返回小数 0.4475 或百分比整数 44.75）
  const marginNorm = marginPct != null ? (marginPct > 1 ? marginPct / 100 : marginPct) : null;
  const fallbackMargin = (!hasBe && fallback != null && price != null && Number(price) !== 0)
    ? fallback / Number(price) : null;
  const displayMargin = hasBe ? marginNorm : fallbackMargin;

  // CNY：优先 breakdown.profitCny，次选 profitCny prop
  const displayCny = bd?.profitCny ?? profitCny;

  // ── 完全无数据且无 breakdown：静默灰色占位 ────────────────────────────────────
  if (displayLocal == null && !bd) {
    return <span style={{ color: '#94a3b8', fontSize: 13 }}>—</span>;
  }

  const profitColor = (displayLocal ?? 0) >= 0 ? '#52c41a' : '#ff4d4f';
  const localStr    = displayLocal != null ? `${displayLocal.toFixed(2)}${c ? ' ' + c : ''}` : null;
  const cnyStr      = displayCny != null ? `￥${displayCny.toFixed(2)}` : null;
  const marginStr   = displayMargin != null ? `(${(displayMargin * 100).toFixed(1)}%)` : null;

  // ── Popover 内容：breakdown 存在则渲染 Descriptions 明细表 ──────────────────
  const popoverContent = (
    <div style={{ width: 300 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b', marginBottom: 8 }}>
        毛利推演明细
      </div>

      {bd ? (
        // ─ 有 breakdown 数据：渲染完整推演表 ─
        <>
          <Descriptions column={1} size="small" colon={false}
            labelStyle={{ color: '#64748b', paddingBottom: 2, paddingLeft: 0 }}
            contentStyle={{ fontFeatureSettings: '"tnum"', paddingBottom: 2, justifyContent: 'flex-end' }}
          >
            {bd.salePrice != null && (
              <Descriptions.Item label="售价">
                {bd.salePrice.toFixed(2)} {c}
              </Descriptions.Item>
            )}
            {bd.commissionRate != null && bd.salePrice != null && (
              <Descriptions.Item label={
                <span>
                  佣金 ({(bd.commissionRate * 100).toFixed(1)}%)
                  {bd.isEstimatedCommission && (
                    <Tag color="orange" bordered={false} style={{ marginLeft: 4, fontSize: 10, padding: '0 3px' }}>估算</Tag>
                  )}
                </span>
              }>
                <span style={{ color: '#ef4444' }}>
                  −{(bd.salePrice * bd.commissionRate).toFixed(2)} {c}
                </span>
              </Descriptions.Item>
            )}
            {bd.fbe != null && (
              <Descriptions.Item label={
                <span>
                  FBE 运费
                  {bd.isEstimatedFbe && (
                    <Tag color="orange" bordered={false} style={{ marginLeft: 4, fontSize: 10, padding: '0 3px' }}>估算</Tag>
                  )}
                </span>
              }>
                <span style={{ color: '#ef4444' }}>−{bd.fbe.toFixed(2)} {c}</span>
              </Descriptions.Item>
            )}
            {(bd.headFreightCny != null || bd.isMissingVolumeWeight) && (
              <Descriptions.Item label={
                <span>
                  头程运费
                  {bd.isMissingVolumeWeight && (
                    <Tooltip title="缺少体积重量，头程运费未计入，实际成本可能偏低">
                      <WarningOutlined style={{ marginLeft: 5, color: '#faad14', cursor: 'help' }} />
                    </Tooltip>
                  )}
                </span>
              }>
                {bd.isMissingVolumeWeight ? (
                  <span style={{ color: '#faad14', fontWeight: 500 }}>未计入</span>
                ) : (
                  <span style={{ color: '#ef4444' }}>−¥{bd.headFreightCny!.toFixed(2)}</span>
                )}
              </Descriptions.Item>
            )}
            {bd.purchaseCostCny != null && (
              <Descriptions.Item label="采购成本">
                <span style={{ color: '#ef4444' }}>−¥{bd.purchaseCostCny.toFixed(2)}</span>
              </Descriptions.Item>
            )}
            {bd.returnLossRate != null && (
              <Descriptions.Item label="退货损耗">
                {(bd.returnLossRate * 100).toFixed(2)}%
              </Descriptions.Item>
            )}
          </Descriptions>

          <Divider style={{ margin: '8px 0' }} />

          {/* 汇总行 */}
          <DetailRow label="预估毛利">
            <span style={{ color: profitColor, fontWeight: 700 }}>
              {localStr ?? '—'}{cnyStr ? ` / ${cnyStr}` : ''}
            </span>
          </DetailRow>
          {(bd.profitMarginPct ?? displayMargin) != null && (
            <DetailRow label="毛利率">
              <span style={{ color: profitColor, fontWeight: 700 }}>
                {((bd.profitMarginPct ?? (displayMargin! * 100))).toFixed(2)}%
              </span>
            </DetailRow>
          )}

          {bd && (
            <>
              <Divider style={{ margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: hasEstimates ? '#92400e' : '#64748b' }}>
                  {hasEstimates ? (
                    <>
                      <WarningOutlined style={{ marginRight: 4 }} />
                      含估算项，数据仅供参考
                    </>
                  ) : (
                    <>可修改佣金、FBE、退货率等参数</>
                  )}
                </span>
                <Button size="small" type="link" icon={<EditOutlined />}
                  onClick={() => { setPopoverOpen(false); setCorrectionOpen(true); }}
                  style={{ padding: 0, fontSize: 12 }}
                >
                  {hasEstimates ? '去纠偏' : '修改成本'}
                </Button>
              </div>
            </>
          )}
        </>
      ) : (
        // ─ breakdown 为 null：展示可用的扁平字段汇总 ─
        <>
          {localStr && (
            <DetailRow label="预估毛利">
              <span style={{ color: profitColor, fontWeight: 700 }}>{localStr}</span>
            </DetailRow>
          )}
          {cnyStr && (
            <DetailRow label="折算人民币">
              <span style={{ color: '#64748b' }}>{cnyStr}</span>
            </DetailRow>
          )}
          {marginStr && (
            <DetailRow label="毛利率">
              <span style={{ color: '#ff4d4f', fontWeight: 600 }}>{marginStr}</span>
            </DetailRow>
          )}
          <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 12 }}>
            {hasBe ? '推演明细待后端重算后展示' : '来源：前端口算（售价 − 采购价）'}
          </div>
        </>
      )}
    </div>
  );

  // ── 单元格触发区（Click 触发 Popover） ────────────────────────────────────────
  const cellTrigger = (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer' }}>
      {localStr ? (
        <span style={{ fontWeight: 700, color: profitColor, fontFeatureSettings: '"tnum"', fontSize: 14, lineHeight: 1.2 }}>
          {localStr}
        </span>
      ) : (
        <span style={{ color: '#94a3b8', fontSize: 13 }}>待计算</span>
      )}
      {(cnyStr || marginStr || hasEstimates) && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {cnyStr && <span style={{ fontSize: 11, color: '#64748b', fontFeatureSettings: '"tnum"' }}>{cnyStr}</span>}
          {marginStr && <span style={{ fontSize: 11, color: '#ff4d4f', fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{marginStr}</span>}
          {hasEstimates && <WarningOutlined style={{ fontSize: 10, color: '#faad14' }} />}
        </span>
      )}
    </div>
  );

  return (
    <>
      <Popover
        content={popoverContent}
        trigger="click"
        open={popoverOpen}
        onOpenChange={setPopoverOpen}
        placement="leftTop"
        overlayStyle={{ maxWidth: 340 }}
      >
        {cellTrigger}
      </Popover>

      {bd && (
        <CostCorrectionModal
          open={correctionOpen}
          pnk={pnk}
          breakdown={bd}
          currency={c}
          onCancel={() => setCorrectionOpen(false)}
          onDone={() => { setCorrectionOpen(false); onCorrectionDone(); }}
        />
      )}
    </>
  );
}
