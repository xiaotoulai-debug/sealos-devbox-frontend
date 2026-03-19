import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Table, Tag, Button, Tooltip, Space, Input, InputNumber, Divider,
  Modal, message, Empty, Image, Typography, Spin,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table/interface';
import {
  SearchOutlined, ShoppingOutlined, ReloadOutlined,
  StarFilled, LinkOutlined,
  ExclamationCircleFilled, DeleteOutlined, SaveOutlined,
  RocketOutlined, CheckCircleOutlined, BarcodeOutlined,
} from '@ant-design/icons';
import request from '../lib/request';

const { Text } = Typography;
const { confirm } = Modal;

// ─── 类型 ─────────────────────────────────────────────────────

interface PrivateProduct {
  id:            number;
  pnk:           string;
  title:         string;
  brand:         string | null;
  category:      string | null;
  categoryL2:    string | null;
  price:         number | null;
  imageUrl:      string | null;
  productUrl:    string | null;
  linkTag:       string | null;
  rating:        number | null;
  reviewCount:   number | null;
  purchasePrice: number | null;
  purchaseUrl:   string | null;
  actualWeight:  number | null;
  length:        number | null;
  width:         number | null;
  height:        number | null;
  freightCost:   number | null;
  fbeFee:        number | null;
  margin:        number | null;
  sku:              string | null;
  chineseName:      string | null;
  developer:        string | null;
  purchaseQuantity: number | null;
  purchasePeriod:   number | null;
  handlingTime:     number;
  vat:              number;
  publishStatus:    string;
  collectedAt:   string | null;
  updatedAt:     string;
}

// ─── 共享常量 & 工具 ──────────────────────────────────────────

const COMMISSION_RATE = 0.23;
const DEFAULT_EXCHANGE_RATE = 1.6;
const HEAD_FREIGHT_PER_KG = 17;

function getTargetMargin(price: number): number {
  if (price < 50)  return 40;
  if (price <= 150) return 35;
  return 30;
}

// ─── 重新核算弹窗 ─────────────────────────────────────────────

interface RecalcModalProps {
  product: PrivateProduct | null;
  onClose: () => void;
  onSave:   (id: number) => void;
  onReject: (id: number) => void;
}

function getAuthUserName(): string {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return '';
    const u = JSON.parse(raw) as { name?: string; username?: string };
    return u.name || u.username || '';
  } catch { return ''; }
}

function RecalculateModal({ product, onClose, onSave, onReject }: RecalcModalProps) {
  const [sku,         setSku]         = useState('');
  const [skuLoading,  setSkuLoading]  = useState(false);
  const [cnName,      setCnName]      = useState('');
  const [len,         setLen]         = useState<number | null>(null);
  const [wid,         setWid]         = useState<number | null>(null);
  const [hei,         setHei]         = useState<number | null>(null);
  const [weight,      setWeight]      = useState<number | null>(null);
  const [cost,        setCost]        = useState<number | null>(null);
  const [fbe,         setFbe]         = useState<number | null>(null);
  const [rate,        setRate]        = useState<number | null>(DEFAULT_EXCHANGE_RATE);
  const [purchaseUrl, setPurchaseUrl] = useState('');
  const [saving,      setSaving]      = useState(false);
  const [rejecting,   setRejecting]   = useState(false);

  const open = product !== null;

  useEffect(() => {
    if (product) {
      setCnName(product.chineseName ?? '');
      setLen(product.length ?? null);
      setWid(product.width ?? null);
      setHei(product.height ?? null);
      setWeight(product.actualWeight);
      setCost(product.purchasePrice);
      setFbe(product.fbeFee);
      setRate(DEFAULT_EXCHANGE_RATE);
      setPurchaseUrl(product.purchaseUrl ?? '');
      setSaving(false);
      setRejecting(false);

      if (product.sku) {
        setSku(product.sku);
        setSkuLoading(false);
      } else {
        setSku('');
        setSkuLoading(true);
        request.get<{ code: number; data: { sku: string } }>('/products/private/generate-sku', {
          params: { originalCat: product.categoryL2 ?? product.category ?? '' },
        }).then(({ data: res }) => {
          if (res.code === 200 && res.data?.sku) setSku(res.data.sku);
        }).catch(() => {}).finally(() => setSkuLoading(false));
      }
    }
  }, [product]);

  const price = product?.price ?? 0;
  const er    = rate || DEFAULT_EXCHANGE_RATE;

  const calc = useMemo(() => {
    const l = len ?? 0, w = wid ?? 0, h = hei ?? 0;
    const rw = weight ?? 0, pp = cost ?? 0, f = fbe ?? 0;
    const volWeight   = (l * w * h) / 6000;
    const chargeWt    = Math.max(rw, volWeight);
    const headFreight = chargeWt * HEAD_FREIGHT_PER_KG;
    const profit      = (price * 0.84) - (pp / er) - (price * COMMISSION_RATE) - f - (headFreight / er);
    const margin      = price > 0 ? (profit / price) * 100 : 0;
    return {
      volWeight:   isFinite(volWeight)   ? volWeight   : 0,
      chargeWt:    isFinite(chargeWt)    ? chargeWt    : 0,
      headFreight: isFinite(headFreight) ? headFreight : 0,
      profit:      isFinite(profit)      ? profit      : 0,
      margin:      isFinite(margin)      ? margin      : 0,
    };
  }, [price, er, len, wid, hei, weight, cost, fbe]);

  const targetMargin = getTargetMargin(price);
  const allFilled    = [len, wid, hei, weight, cost, fbe].every((v) => v != null);
  const urlFilled    = purchaseUrl.trim().length > 0;
  const canSave      = allFilled && urlFilled && calc.margin > targetMargin;
  const profitColor  = calc.margin > targetMargin ? '#52c41a' : calc.margin > 0 ? '#faad14' : '#ff4d4f';

  const numField = (
    label: string, val: number | null, set: (v: number | null) => void, suffix: string,
  ) => (
    <div>
      <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>{label}</div>
      <InputNumber value={val} onChange={set} style={{ width: '100%' }} min={0} precision={2} addonAfter={suffix} placeholder="请输入" />
    </div>
  );

  const skuFilled = sku.trim().length > 0;
  const canSaveAll = canSave && skuFilled;

  const handleSave = async () => {
    if (!product) return;
    setSaving(true);
    try {
      const { data: res } = await request.put<{ code: number; message: string }>(
        `/products/${product.id}/recalculate`,
        { sku: sku.trim(), purchasePrice: cost ?? 0, purchaseUrl: purchaseUrl.trim(), chineseName: cnName.trim(), developer: getAuthUserName(), actualWeight: weight ?? 0, freightCost: calc.headFreight, fbeFee: fbe ?? 0, margin: parseFloat(calc.margin.toFixed(2)), length: len, width: wid, height: hei },
      );
      if (res.code === 200) { message.success('产品建库成功！'); onSave(product.id); }
      else message.error(res.message);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg ?? '保存失败');
    }
    finally { setSaving(false); }
  };

  const handleReject = () => {
    if (!product) return;
    confirm({
      title: '样品核算失败？', icon: <ExclamationCircleFilled style={{ color: '#ff4d4f' }} />,
      content: '确定将此产品淘汰回公海吗？相关的采购数据将被清除，此操作不可撤销。',
      okText: '确定淘汰', okType: 'danger', cancelText: '取消',
      async onOk() {
        setRejecting(true);
        try {
          const { data: res } = await request.delete<{ code: number; message: string }>(`/products/${product.id}/reject`);
          if (res.code === 200) { message.success('已淘汰回公海'); onReject(product.id); }
          else message.error(res.message);
        } catch { message.error('淘汰失败'); }
        finally { setRejecting(false); }
      },
    });
  };

  return (
    <Modal
      title={<span><BarcodeOutlined style={{ marginRight: 8, color: '#1890ff' }} />产品建库 — 规格核算</span>}
      open={open} onCancel={onClose} width={580} destroyOnClose maskClosable={false}
      footer={[
        <Button key="reject" danger icon={<DeleteOutlined />} loading={rejecting} onClick={handleReject} style={{ float: 'left' }}>淘汰退回公海</Button>,
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button key="save" type="primary" loading={saving} disabled={!canSaveAll} icon={<CheckCircleOutlined />} onClick={handleSave}
          style={canSaveAll ? { background: '#52c41a', borderColor: '#52c41a' } : undefined}
        >
          {canSaveAll ? '✓ 确认建库' : !skuFilled ? '请确认 SKU' : !allFilled ? '请填写所有数值' : !urlFilled ? '请填写采购链接' : `毛利率须 >${targetMargin}%`}
        </Button>,
      ]}
    >
      <div style={{ background: '#f6f8fa', borderRadius: 10, padding: '14px 20px', marginBottom: 20, display: 'flex', gap: 32, alignItems: 'center' }}>
        <div><div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 2 }}>PNK 码</div><div style={{ fontWeight: 600, fontSize: 15, fontFamily: "'Inter', monospace", letterSpacing: 0.5 }}>{product?.pnk}</div></div>
        <div style={{ width: 1, height: 36, background: '#e0e0e0' }} />
        <div><div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 2 }}>售价(含税) (RON)</div><div style={{ fontWeight: 700, fontSize: 18, color: '#1890ff' }}>{price.toFixed(2)}</div></div>
        {product?.brand && (<><div style={{ width: 1, height: 36, background: '#e0e0e0' }} /><div><div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 2 }}>品牌</div><Tag color="blue" bordered={false} style={{ fontWeight: 500 }}>{product.brand}</Tag></div></>)}
      </div>
      {/* ── 产品 SKU ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>产品 SKU <span style={{ color: '#ff4d4f' }}>*</span></div>
        <Spin spinning={skuLoading} size="small">
          <Input
            value={sku} onChange={(e) => setSku(e.target.value)}
            placeholder="自动生成中..."
            allowClear
            prefix={<BarcodeOutlined style={{ color: '#bfbfbf' }} />}
            style={{ fontFamily: "'Inter', monospace", fontWeight: 600, fontSize: 15, letterSpacing: 1, borderRadius: 8 }}
          />
        </Spin>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px', marginBottom: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>尺寸 (cm)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <InputNumber value={len} onChange={setLen} placeholder="长" min={0} precision={1} style={{ flex: 1 }} />
            <span style={{ color: '#bfbfbf', fontSize: 13, userSelect: 'none' }}>×</span>
            <InputNumber value={wid} onChange={setWid} placeholder="宽" min={0} precision={1} style={{ flex: 1 }} />
            <span style={{ color: '#bfbfbf', fontSize: 13, userSelect: 'none' }}>×</span>
            <InputNumber value={hei} onChange={setHei} placeholder="高" min={0} precision={1} style={{ flex: 1 }} />
            <span style={{ color: '#8c8c8c', fontSize: 12, whiteSpace: 'nowrap', marginLeft: 2 }}>cm</span>
          </div>
        </div>
        {numField('实重', weight, setWeight, 'kg')}{numField('采购价', cost, setCost, 'RMB')}{numField('FBE 费', fbe, setFbe, 'RON')}
        <div><div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>汇率</div><InputNumber value={rate} onChange={setRate} style={{ width: '100%' }} min={0.01} step={0.01} precision={2} addonAfter="RON/RMB" /></div>
      </div>
      <div style={{ marginBottom: 4 }}><div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>采购链接 <span style={{ color: '#ff4d4f' }}>*</span></div><Input value={purchaseUrl} onChange={(e) => setPurchaseUrl(e.target.value)} placeholder="请粘贴 1688 / 拼多多 采购链接（必填）" allowClear style={{ borderRadius: 6 }} status={!urlFilled && allFilled ? 'error' : undefined} /></div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>中文名</div>
        <Input value={cnName} onChange={(e) => setCnName(e.target.value)} placeholder="请输入采购规格或颜色（如：蓝色/大号/基础版）" allowClear style={{ borderRadius: 6 }} />
      </div>
      <div style={{ marginBottom: 4, fontSize: 12, color: '#b0b0b0' }}>
        开发人员：<span style={{ fontWeight: 500, color: '#8c8c8c' }}>{getAuthUserName() || '未知'}</span>
        <span style={{ marginLeft: 6, color: '#d9d9d9' }}>（自动获取）</span>
      </div>
      <Divider style={{ margin: '16px 0 12px' }} dashed><span style={{ fontSize: 12, color: '#8c8c8c' }}>计算明细</span></Divider>
      <div style={{ display: 'flex', gap: 20, marginBottom: 16, color: '#595959', fontSize: 13, flexWrap: 'wrap' }}>
        <span>体积重: <b>{calc.volWeight.toFixed(2)}</b> kg</span><span>计费重 N: <b>{calc.chargeWt.toFixed(2)}</b> kg</span><span>头程费: <b>{calc.headFreight.toFixed(2)}</b> RMB</span><span style={{ color: '#8c8c8c' }}>佣金: {(COMMISSION_RATE * 100).toFixed(0)}%</span>
      </div>
      <div style={{ display: 'flex', background: '#fafafa', borderRadius: 12, overflow: 'hidden', border: '1px solid #f0f0f0' }}>
        <div style={{ flex: 1, textAlign: 'center', padding: '20px 16px' }}><div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>毛利润 (RON)</div><div style={{ fontSize: 30, fontWeight: 700, color: profitColor, fontFeatureSettings: '"tnum"', lineHeight: 1.2 }}>{calc.profit.toFixed(2)}</div></div>
        <div style={{ width: 1, background: '#f0f0f0' }} />
        <div style={{ flex: 1, textAlign: 'center', padding: '20px 16px' }}><div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>毛利率</div><div style={{ fontSize: 30, fontWeight: 700, color: profitColor, fontFeatureSettings: '"tnum"', lineHeight: 1.2 }}>{calc.margin.toFixed(2)}%</div></div>
      </div>
      <div style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: canSave ? '#52c41a' : '#8c8c8c', fontWeight: 500 }}>
        目标及格线：毛利率 &gt; {targetMargin}%
        <span style={{ marginLeft: 8, fontSize: 11, color: '#bfbfbf' }}>（售价{price < 50 ? '<50' : price <= 150 ? '50~150' : '>150'} RON 适用）</span>
      </div>
      {allFilled && calc.margin <= targetMargin && (
        <div style={{ textAlign: 'center', color: '#ff4d4f', marginTop: 6, fontSize: 13, fontWeight: 500 }}>⚠ 毛利率 {calc.margin.toFixed(2)}% 未达到 {targetMargin}% 门槛</div>
      )}
    </Modal>
  );
}

// ─── 采购配置台弹窗 ───────────────────────────────────────────

interface PublishModalProps {
  product: PrivateProduct | null;
  onClose: () => void;
  onSuccess: () => void;
}

function PublishModal({ product, onClose, onSuccess }: PublishModalProps) {
  const [cnName,       setCnName]       = useState('');
  const [dimLen,       setDimLen]       = useState<number | null>(null);
  const [dimWid,       setDimWid]       = useState<number | null>(null);
  const [dimHei,       setDimHei]       = useState<number | null>(null);
  const [dimWgt,       setDimWgt]       = useState<number | null>(null);
  const [purchPrice,   setPurchPrice]   = useState<number | null>(null);
  const [stock,        setStock]        = useState<number | null>(20);
  const [publishing,   setPublishing]   = useState(false);

  const open = product !== null;
  const sku = product?.sku ?? '';

  useEffect(() => {
    if (!product) return;
    setCnName(product.chineseName ?? '');
    setDimLen(product.length ?? null);
    setDimWid(product.width ?? null);
    setDimHei(product.height ?? null);
    setDimWgt(product.actualWeight ?? null);
    setPurchPrice(product.purchasePrice ?? null);
    setStock(product.purchaseQuantity ?? 20);
    setPublishing(false);
  }, [product]);

  const totalAmount = (purchPrice != null && stock != null) ? purchPrice * stock : null;
  const canPublish = sku.trim().length > 0 && purchPrice != null && purchPrice > 0 && stock != null && stock >= 0;

  const handlePublish = async () => {
    if (!product || !canPublish) return;
    setPublishing(true);
    try {
      const { data: res } = await request.put<{ code: number; message: string }>(
        `/products/${product.id}/publish`,
        { sku: sku.trim(), cnName: cnName.trim(), stock, price: purchPrice, length: dimLen, width: dimWid, height: dimHei, weight: dimWgt, purchaseType: 'FIRST' },
      );
      if (res.code === 200) {
        message.success('已加入首批采购！');
        onSuccess();
      } else {
        message.error(res.message);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg ?? '首批采购失败');
    } finally {
      setPublishing(false);
    }
  };

  const formItem = (label: string, child: React.ReactNode) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6, fontWeight: 500 }}>{label}</div>
      {child}
    </div>
  );

  return (
    <Modal
      title={<span><RocketOutlined style={{ marginRight: 8, color: '#1890ff' }} />首批采购配置台</span>}
      open={open} onCancel={onClose} width={520} destroyOnClose maskClosable={false}
      footer={[
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button key="publish" type="primary" loading={publishing} disabled={!canPublish}
          icon={<CheckCircleOutlined />} onClick={handlePublish}
          style={canPublish ? { background: '#1890ff' } : undefined}
        >
          确认采购
        </Button>,
      ]}
    >
      {/* ── 产品信息卡 ── */}
      <div style={{
        background: '#f6f8fa', borderRadius: 10, padding: '14px 20px',
        marginBottom: 24, display: 'flex', gap: 16, alignItems: 'center',
      }}>
        {product?.imageUrl && (
          <Image src={product.imageUrl} width={56} height={56}
            style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid #f0f0f0', flexShrink: 0 }}
            preview={false}
            fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56'%3E%3Crect fill='%23f5f5f5' width='56' height='56'/%3E%3C/svg%3E"
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#262626', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {product?.title}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12, color: '#8c8c8c' }}>
            <span>PNK: <b style={{ color: '#262626', fontFamily: "'Inter', monospace" }}>{product?.pnk}</b></span>
            {product?.brand && <span>品牌: <Tag color="blue" bordered={false} style={{ fontSize: 11 }}>{product.brand}</Tag></span>}
            {product?.purchaseUrl ? (
              <a onClick={() => window.open(product.purchaseUrl!, '_blank', 'noreferrer,noopener')}
                style={{ fontSize: 13, color: '#1890ff', fontWeight: 400, marginLeft: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >🔗 采购链接</a>
            ) : (
              <span style={{ fontSize: 13, color: '#bfbfbf', marginLeft: 12, whiteSpace: 'nowrap' }}>🔗 采购链接</span>
            )}
          </div>
        </div>
      </div>

      {/* ── SKU ── */}
      {formItem(
        '产品 SKU（建库阶段已确定）',
        <Input
          value={sku} readOnly
          prefix={<BarcodeOutlined style={{ color: '#bfbfbf' }} />}
          style={{ fontFamily: "'Inter', monospace", fontWeight: 600, fontSize: 15, letterSpacing: 1, borderRadius: 8, background: '#f6f8fa', color: '#262626' }}
        />,
      )}

      {/* ── 中文名 ── */}
      {formItem(
        '中文名',
        <Input
          value={cnName} onChange={(e) => setCnName(e.target.value)}
          placeholder="请务必输入采购链接对应的规格或颜色（如：黑色/大号/加强版）"
          allowClear style={{ borderRadius: 8 }}
        />,
      )}

      {/* ── 尺寸 & 实重 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
        {formItem('尺寸 (cm)', <div style={{ display: 'flex', gap: 6 }}>
          <InputNumber value={dimLen} onChange={setDimLen} placeholder="长" min={0} precision={1} style={{ flex: 1 }} />
          <InputNumber value={dimWid} onChange={setDimWid} placeholder="宽" min={0} precision={1} style={{ flex: 1 }} />
          <InputNumber value={dimHei} onChange={setDimHei} placeholder="高" min={0} precision={1} style={{ flex: 1 }} />
        </div>)}
        {formItem('实重 (kg)', <InputNumber value={dimWgt} onChange={setDimWgt} placeholder="实重" min={0} precision={2} style={{ width: '100%' }} addonAfter="kg" />)}
      </div>

      {/* ── 表单网格 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
        {formItem('采购价 (RMB)', <InputNumber value={purchPrice} onChange={setPurchPrice} style={{ width: '100%' }} min={0} precision={2} addonAfter="¥" />)}
        {formItem('采购数量', <InputNumber value={stock} onChange={setStock} style={{ width: '100%' }} min={0} precision={0} addonAfter="件" />)}
        {formItem('采购总金额 (RMB)',
          <InputNumber
            value={totalAmount != null ? parseFloat(totalAmount.toFixed(2)) : null}
            disabled
            style={{ width: '100%', fontWeight: 700, fontSize: 15, color: '#d4380d' }}
            precision={2}
            prefix="¥"
          />,
        )}
      </div>
    </Modal>
  );
}

// ─── 主组件 ───────────────────────────────────────────────────

interface PrivatePoolProps {
  onNavigate?: (key: string) => void;
}

export default function PrivatePool({ onNavigate }: PrivatePoolProps) {
  const [products, setProducts] = useState<PrivateProduct[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total,    setTotal]    = useState(0);

  const [recalcTarget,  setRecalcTarget]  = useState<PrivateProduct | null>(null);
  const [publishTarget, setPublishTarget] = useState<PrivateProduct | null>(null);

  const fetchProducts = useCallback(async (p: number, ps: number) => {
    setLoading(true);
    try {
      const { data: res } = await request.get<{
        code: number;
        data: { list: PrivateProduct[]; total: number };
        message: string;
      }>('/products/private', { params: { page: p, pageSize: ps } });
      if (res.code === 200 && res.data) {
        setProducts(Array.isArray(res.data.list) ? res.data.list : []);
        setTotal(res.data.total ?? 0);
      } else { message.error(res.message || '获取失败'); }
    } catch { message.error('请求失败，请检查网络或后端服务'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchProducts(1, 20); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePageChange = useCallback((pag: TablePaginationConfig) => {
    const np = pag.current ?? 1; const ns = pag.pageSize ?? pageSize;
    setPage(np); setPageSize(ns); fetchProducts(np, ns);
  }, [fetchProducts, pageSize]);

  const refresh = useCallback(() => { fetchProducts(page, pageSize); }, [fetchProducts, page, pageSize]);

  const columns = useMemo<ColumnsType<PrivateProduct>>(() => [
    {
      title: '图片', dataIndex: 'imageUrl', width: 72,
      render: (url: string | null) =>
        url ? (
          <Image src={url} width={48} height={48}
            style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid #f0f0f0' }}
            preview={{ mask: <SearchOutlined style={{ fontSize: 12 }} /> }}
            fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect fill='%23f5f5f5' width='48' height='48'/%3E%3C/svg%3E"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center"><ShoppingOutlined className="text-gray-300" /></div>
        ),
    },
    {
      title: '品牌', dataIndex: 'brand', width: 110,
      render: (v: string | null) => v
        ? <Tag color="blue" bordered={false} style={{ borderRadius: 6, fontWeight: 500, fontSize: 13 }}>{v}</Tag>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '产品名称', dataIndex: 'title', width: 240, ellipsis: { showTitle: false },
      render: (v: string, row) => {
        const openUrl = () => {
          const raw = row.productUrl || `https://www.emag.ro/pd/${row.pnk}/`;
          const url = raw.startsWith('http') ? raw : raw.startsWith('//') ? `https:${raw}` : `https://${raw}`;
          window.open(url, '_blank', 'noreferrer,noopener');
        };
        return (
          <Tooltip title={v} placement="topLeft" mouseEnterDelay={0.4}>
            <span onClick={openUrl} style={{ display: 'block', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: 220, color: '#1890ff', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '3px', fontSize: 14, fontWeight: 500 }}>{v}</span>
          </Tooltip>
        );
      },
    },
    {
      title: 'PNK 码', dataIndex: 'pnk', width: 185,
      render: (v: string) => (
        <span className="pnk-cell">
          <Text copyable={{ tooltips: ['复制 PNK', '已复制！'] }} style={{
            fontSize: 13, fontWeight: 400,
            fontFamily: "'Inter','-apple-system','BlinkMacSystemFont','Segoe UI','PingFang SC','Microsoft YaHei',sans-serif",
            color: '#262626', background: '#f5f5f5',
            border: '1px solid #d9d9d9', borderRadius: 6,
            padding: '3px 10px', whiteSpace: 'nowrap', letterSpacing: '0.5px',
          }}>{v}</Text>
        </span>
      ),
    },
    {
      title: 'SKU', dataIndex: 'sku', width: 185,
      render: (v: string | null) => v
        ? <span className="pnk-cell">
            <span style={{
              fontSize: 13, fontWeight: 400,
              fontFamily: "'Inter','-apple-system','BlinkMacSystemFont','Segoe UI','PingFang SC','Microsoft YaHei',sans-serif",
              color: '#262626', background: '#f5f5f5',
              border: '1px solid #d9d9d9', borderRadius: 6,
              padding: '3px 10px', whiteSpace: 'nowrap', letterSpacing: '0.5px',
              display: 'inline-block',
            }}>{v}</span>
          </span>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '售价(含税)', dataIndex: 'price', width: 100, align: 'right',
      sorter: (a, b) => (a.price ?? 0) - (b.price ?? 0),
      render: (v: number | null) => {
        const n = typeof v === 'string' ? parseFloat(v) : v;
        return n != null && !isNaN(n) && n > 0
          ? <span className="font-semibold text-gray-800 tabular-nums">{n.toFixed(2)}</span>
          : <span className="text-gray-300">—</span>;
      },
    },
    {
      title: '定价', key: 'basePrice', width: 90, align: 'right',
      render: (_: unknown, record: PrivateProduct) => {
        const n = record.price;
        return n != null && n > 0
          ? <span style={{ color: '#d97706', fontWeight: 400, fontFeatureSettings: '"tnum"' }}>{(n * 0.83).toFixed(2)}</span>
          : <span className="text-gray-300">—</span>;
      },
    },
    {
      title: '采购价', dataIndex: 'purchasePrice', width: 100, align: 'right',
      render: (v: number | null) => v != null
        ? <span style={{ fontWeight: 600, fontSize: 13, color: '#d4380d', fontFeatureSettings: '"tnum"' }}>¥{v.toFixed(2)}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '货源', dataIndex: 'purchaseUrl', width: 70, align: 'center',
      render: (v: string | null) => v
        ? <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => window.open(v, '_blank', 'noreferrer,noopener')} style={{ padding: 0, fontWeight: 500 }}>链接</Button>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '毛利率', dataIndex: 'margin', width: 100, align: 'center',
      sorter: (a, b) => (a.margin ?? 0) - (b.margin ?? 0),
      render: (v: number | null) => {
        if (v == null) return <span className="text-gray-300">—</span>;
        const color = v > 35 ? '#52c41a' : v > 20 ? '#faad14' : '#ff4d4f';
        return <Tag bordered={false} style={{ background: v > 35 ? '#f6ffed' : v > 20 ? '#fffbe6' : '#fff2f0', color, fontWeight: 700, fontSize: 13, borderRadius: 8, padding: '2px 10px', fontFeatureSettings: '"tnum"' }}>{v.toFixed(1)}%</Tag>;
      },
    },
    {
      title: '开发人员', dataIndex: 'developer', width: 100, align: 'center',
      render: (v: string | null) => v
        ? <span style={{ fontSize: 13, color: '#475569' }}>{v}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '状态', key: 'status', width: 90, align: 'center',
      render: (_: unknown, record: PrivateProduct) => {
        if (record.publishStatus === 'PUBLISHED')
          return <Tag color="success" bordered={false} icon={<CheckCircleOutlined />} style={{ borderRadius: 6, fontWeight: 600 }}>已采购</Tag>;
        const constructed = !!(record.sku && record.sku.trim());
        return constructed
          ? <Tag color="green" bordered={false} style={{ borderRadius: 6, fontWeight: 600 }}>已建库</Tag>
          : <Tag color="red" bordered={false} style={{ borderRadius: 6, fontWeight: 600 }}>未建库</Tag>;
      },
    },
    {
      title: '操作', key: 'action', width: 240, fixed: 'right',
      render: (_: unknown, record: PrivateProduct) => {
        const constructed = !!(record.sku && record.sku.trim());
        const isMAN = constructed && record.sku!.toUpperCase().startsWith('MAN-');
        return (
          <Space size={6} wrap>
            {/* 建库按钮：未建库时可点击，已建库后置灰提示 */}
            {constructed ? (
              <Tooltip title={`SKU：${record.sku}`}>
                <Button
                  size="small"
                  icon={<CheckCircleOutlined />}
                  disabled
                  style={{ borderRadius: 6, color: '#52c41a', borderColor: '#b7eb8f', background: '#f6ffed', cursor: 'default' }}
                >
                  已建库
                </Button>
              </Tooltip>
            ) : (
              <Button size="small" icon={<BarcodeOutlined />} style={{ borderRadius: 6 }} onClick={() => setRecalcTarget(record)}>
                🗃️ 建库
              </Button>
            )}

            {/* 采购区：已采购 / 首批采购 / 置灰 */}
            {record.publishStatus === 'PUBLISHED' ? (
              <Button size="small" disabled icon={<CheckCircleOutlined />} style={{ borderRadius: 6 }}>已采购</Button>
            ) : constructed && !isMAN ? (
              <Button size="small" type="primary" icon={<RocketOutlined />} style={{ borderRadius: 6 }} onClick={() => setPublishTarget(record)}>
                🚀 首批采购
              </Button>
            ) : (
              <Tooltip title={isMAN ? 'MAN- 前缀产品无需采购计划' : '请先完成「建库」生成 SKU'}>
                <Button size="small" type="primary" disabled icon={<RocketOutlined />} style={{ borderRadius: 6 }}>
                  🚀 首批采购
                </Button>
              </Tooltip>
            )}

            {/* 去采购计划：已建库且非 MAN- 前缀时显示 */}
            {constructed && !isMAN && onNavigate && (
              <Tooltip title="跳转至采购计划页面">
                <Button
                  size="small"
                  icon={<ShoppingOutlined />}
                  style={{ borderRadius: 6 }}
                  onClick={() => onNavigate('sc-planning')}
                >
                  去采购
                </Button>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ], [onNavigate]);

  return (
    <div className="min-h-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 m-0 flex items-center gap-2">
            <StarFilled style={{ color: '#faad14', fontSize: 20 }} />
            意向产品池
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            共 <span className="font-semibold text-gray-700 text-base">{total}</span> 件已采集产品
          </p>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => { setPage(1); fetchProducts(1, pageSize); }}>刷新</Button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <Table
          rowKey="id" dataSource={products} columns={columns} loading={loading}
          scroll={{ x: 1700 }} size="large" onChange={handlePageChange}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'], showQuickJumper: true, showTotal: (t, r) => `第 ${r[0]}–${r[1]} 条 / 共 ${t} 条` }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无采集产品，快去公海产品池选品吧！" style={{ padding: '64px 0' }} /> }}
          rowClassName="align-middle"
        />
      </div>

      <RecalculateModal product={recalcTarget} onClose={() => setRecalcTarget(null)} onSave={() => { setRecalcTarget(null); refresh(); }} onReject={() => { setRecalcTarget(null); refresh(); }} />
      <PublishModal product={publishTarget} onClose={() => setPublishTarget(null)} onSuccess={() => { setPublishTarget(null); refresh(); }} />
    </div>
  );
}
