import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Table, Tag, Button, Tooltip, message, Empty, Image, Typography, Space, Modal,
  InputNumber, Input, Divider, Select, Spin,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table/interface';
import {
  SearchOutlined, ShoppingOutlined, ReloadOutlined, LinkOutlined,
  FileTextOutlined, PlusOutlined, ToolOutlined, FileDoneOutlined,
  ExclamationCircleFilled, RollbackOutlined, EnvironmentOutlined,
} from '@ant-design/icons';
import request from '../lib/request';
import AlibabaMappingModal from '../components/AlibabaMappingModal';

const { Text } = Typography;

interface PurchasingProduct {
  id:               number;
  pnk:             string;
  title:           string;
  brand:           string | null;
  price:           number | null;
  imageUrl:        string | null;
  purchasePrice:   number | null;
  purchaseUrl:     string | null;
  margin:          number | null;
  sku:             string | null;
  chineseName:     string | null;
  purchaseQuantity: number | null;
  purchaseType:    string | null;
  purchasePeriod:  number | null;
  length:          number | null;
  width:           number | null;
  height:          number | null;
  actualWeight:    number | null;
  externalProductId: string | null;
  externalSkuId:     string | null;
  externalSynced:    boolean;
  externalOrderId:   string | null;
  updatedAt:       string;
}

export default function ProcurementPlanning() {
  const [products,        setProducts]        = useState<PurchasingProduct[]>([]);
  const [loading,         setLoading]         = useState(false);
  const [page,            setPage]            = useState(1);
  const [pageSize,        setPageSize]        = useState(20);
  const [total,           setTotal]           = useState(0);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [selectedRows,    setSelectedRows]    = useState<PurchasingProduct[]>([]);
  const [orderModalOpen,  setOrderModalOpen]  = useState(false);
  const [batchModalOpen,  setBatchModalOpen]  = useState(false);
  const [mappingTarget,   setMappingTarget]   = useState<PurchasingProduct | null>(null);

  const fetchProducts = useCallback(async (p: number, ps: number) => {
    setLoading(true);
    try {
      const { data: res } = await request.get<{
        code: number;
        data: { list: PurchasingProduct[]; total: number };
        message: string;
      }>('/products/purchasing', { params: { page: p, pageSize: ps } });
      if (res.code === 200 && res.data) {
        setProducts(Array.isArray(res.data.list) ? res.data.list : []);
        setTotal(res.data.total ?? 0);
      } else { message.error(res.message || '获取失败'); }
    } catch { message.error('请求失败，请检查网络或后端服务'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchProducts(1, 20); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePageChange = useCallback((pag: TablePaginationConfig) => {
    const np = pag.current ?? 1;
    const ns = pag.pageSize ?? pageSize;
    setPage(np);
    setPageSize(ns);
    fetchProducts(np, ns);
  }, [fetchProducts, pageSize]);

  const columns = useMemo<ColumnsType<PurchasingProduct>>(() => [
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
      title: 'SKU', dataIndex: 'sku', width: 120,
      render: (v: string | null) => v
        ? <span style={{ fontSize: 14, fontWeight: 400, fontFamily: "'Inter', monospace", letterSpacing: 0.5 }}>{v}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '中文名', dataIndex: 'chineseName', width: 180, ellipsis: true,
      render: (v: string | null) => v
        ? <Tooltip title={v} placement="topLeft"><span style={{ fontSize: 13 }}>{v}</span></Tooltip>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '采购类型', dataIndex: 'purchaseType', width: 110, align: 'center',
      render: (v: string | null) => {
        if (v === 'REPEAT') return <Tag color="green" bordered={false} style={{ borderRadius: 6, fontWeight: 600 }}>🔄 返单采购</Tag>;
        return <Tag color="blue" bordered={false} style={{ borderRadius: 6, fontWeight: 600 }}>🚀 首批采购</Tag>;
      },
    },
    {
      title: '物流规格', key: 'logistics', width: 170, align: 'center',
      render: (_: unknown, record: PurchasingProduct) => {
        const { length: l, width: w, height: h, actualWeight: wt } = record;
        const hasDim = l != null && w != null && h != null;
        const hasWt = wt != null;
        if (!hasDim && !hasWt) return <span className="text-gray-300">—</span>;
        return (
          <div style={{ lineHeight: 1.6, fontFeatureSettings: '"tnum"' }}>
            {hasDim && <div style={{ fontSize: 12, color: '#8c8c8c' }}>{l}×{w}×{h} cm</div>}
            {hasWt && <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{wt.toFixed(2)} kg</div>}
          </div>
        );
      },
    },
    {
      title: '货源', dataIndex: 'purchaseUrl', width: 100, align: 'center',
      render: (v: string | null) => v
        ? <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => window.open(v, '_blank', 'noreferrer,noopener')} style={{ padding: 0, fontWeight: 500 }}>点击跳转</Button>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '采购价', dataIndex: 'purchasePrice', width: 110, align: 'right',
      render: (v: number | null) => v != null
        ? <span style={{ fontWeight: 600, fontSize: 14, color: '#d4380d', fontFeatureSettings: '"tnum"' }}>¥{v.toFixed(2)}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '采购数量', dataIndex: 'purchaseQuantity', width: 100, align: 'center',
      render: (v: number | null) => v != null
        ? <span className="tabular-nums font-medium">{v}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '采购总金额', key: 'totalAmount', width: 130, align: 'right',
      render: (_: unknown, record: PurchasingProduct) => {
        const amount = (record.purchasePrice ?? 0) * (record.purchaseQuantity ?? 0);
        return amount > 0
          ? <span style={{ fontWeight: 700, fontSize: 14, color: '#d4380d', fontFeatureSettings: '"tnum"' }}>¥ {amount.toFixed(2)}</span>
          : <span className="text-gray-300">—</span>;
      },
    },
    {
      title: '1688', key: 'alibaba', width: 110, align: 'center',
      render: (_: unknown, record: PurchasingProduct) => {
        if (record.externalOrderId) {
          return (
            <Tooltip title={`1688 订单: ${record.externalOrderId}`}>
              <Tag color="green" bordered={false} style={{ borderRadius: 6, fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>
                已下单
              </Tag>
            </Tooltip>
          );
        }
        if (record.externalProductId) {
          return (
            <Tooltip title={`已绑定: #${record.externalProductId}`}>
              <Button type="link" size="small" onClick={() => setMappingTarget(record)}
                style={{ color: '#ff6a00', fontWeight: 600, padding: 0 }}
              >
                已关联
              </Button>
            </Tooltip>
          );
        }
        return (
          <Button type="link" size="small" onClick={() => setMappingTarget(record)}
            style={{ color: '#bfbfbf', padding: 0 }}
          >
            关联
          </Button>
        );
      },
    },
  ], []);

  return (
    <div className="min-h-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 m-0 flex items-center gap-2">
            <FileTextOutlined style={{ color: '#1890ff', fontSize: 20 }} />
            采购计划
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            共 <span className="font-semibold text-gray-700 text-base">{total}</span> 件待采购产品
          </p>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => { setPage(1); fetchProducts(1, pageSize); }}>刷新</Button>
      </div>

      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              if (selectedRowKeys.length === 0) { message.warning('请先选择需要采购的产品'); return; }
              setOrderModalOpen(true);
            }}
          >
            创建采购单
          </Button>
        </Space>
        <Space>
          <Button
            icon={<ToolOutlined />}
            disabled={selectedRowKeys.length === 0}
            onClick={() => setBatchModalOpen(true)}
          >
            批量处理{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}
          </Button>
        </Space>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <Table
          rowKey="id" dataSource={products} columns={columns} loading={loading}
          scroll={{ x: 1200 }} size="large" onChange={handlePageChange}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys, rows) => { setSelectedRowKeys(keys); setSelectedRows(rows); },
          }}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'], showQuickJumper: true, showTotal: (t, r) => `第 ${r[0]}–${r[1]} 条 / 共 ${t} 条` }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无采购中的产品" style={{ padding: '64px 0' }} /> }}
          rowClassName="align-middle"
        />
      </div>

      <OrderConfirmModal
        open={orderModalOpen}
        rows={selectedRows}
        onCancel={() => setOrderModalOpen(false)}
        onSuccess={() => {
          setOrderModalOpen(false);
          setSelectedRowKeys([]);
          setSelectedRows([]);
          fetchProducts(page, pageSize);
        }}
      />

      <BatchOperationModal
        open={batchModalOpen}
        rows={selectedRows}
        onCancel={() => setBatchModalOpen(false)}
        onDone={() => {
          setBatchModalOpen(false);
          setSelectedRowKeys([]);
          setSelectedRows([]);
          fetchProducts(page, pageSize);
        }}
      />

      <AlibabaMappingModal
        open={!!mappingTarget}
        productId={mappingTarget?.id ?? null}
        productSku={mappingTarget?.sku ?? null}
        purchaseUrl={mappingTarget?.purchaseUrl ?? null}
        currentOfferId={mappingTarget?.externalProductId ?? null}
        currentSpecId={mappingTarget?.externalSkuId ?? null}
        onCancel={() => setMappingTarget(null)}
        onDone={() => { setMappingTarget(null); fetchProducts(page, pageSize); }}
      />
    </div>
  );
}

// ─── 批量操作中心弹窗（多行编辑工作台）─────────────────────────

interface EditableRow {
  id:               number;
  imageUrl:         string | null;
  sku:              string | null;
  chineseName:      string | null;
  length:           number | null;
  width:            number | null;
  height:           number | null;
  actualWeight:     number | null;
  purchasePrice:    number | null;
  purchaseQuantity: number | null;
}

interface BatchOperationModalProps {
  open: boolean;
  rows: PurchasingProduct[];
  onCancel: () => void;
  onDone: () => void;
}

function BatchOperationModal({ open, rows, onCancel, onDone }: BatchOperationModalProps) {
  const [editData,  setEditData]  = useState<EditableRow[]>([]);
  const [applying,  setApplying]  = useState(false);
  const [rolling,   setRolling]   = useState(false);

  useEffect(() => {
    if (open) {
      setEditData(rows.map((r) => ({
        id:               r.id,
        imageUrl:         r.imageUrl,
        sku:              r.sku,
        chineseName:      r.chineseName,
        length:           r.length,
        width:            r.width,
        height:           r.height,
        actualWeight:     r.actualWeight,
        purchasePrice:    r.purchasePrice,
        purchaseQuantity: r.purchaseQuantity,
      })));
    }
  }, [open, rows]);

  const updateField = useCallback(<K extends keyof EditableRow>(idx: number, key: K, val: EditableRow[K]) => {
    setEditData((prev) => prev.map((row, i) => i === idx ? { ...row, [key]: val } : row));
  }, []);

  const buildDiff = useCallback(() => {
    const items: Record<string, unknown>[] = [];
    for (let i = 0; i < editData.length; i++) {
      const cur = editData[i];
      const orig = rows.find((r) => r.id === cur.id);
      if (!orig) continue;

      const diff: Record<string, unknown> = { id: cur.id };
      let changed = false;
      if (cur.chineseName      !== (orig.chineseName ?? null))      { diff.chineseName      = cur.chineseName;      changed = true; }
      if (cur.length           !== (orig.length ?? null))           { diff.length           = cur.length;           changed = true; }
      if (cur.width            !== (orig.width ?? null))            { diff.width            = cur.width;            changed = true; }
      if (cur.height           !== (orig.height ?? null))           { diff.height           = cur.height;           changed = true; }
      if (cur.actualWeight     !== (orig.actualWeight ?? null))     { diff.actualWeight     = cur.actualWeight;     changed = true; }
      if (cur.purchasePrice    !== (orig.purchasePrice ?? null))    { diff.purchasePrice    = cur.purchasePrice;    changed = true; }
      if (cur.purchaseQuantity !== (orig.purchaseQuantity ?? null)) { diff.purchaseQuantity = cur.purchaseQuantity; changed = true; }
      if (changed) items.push(diff);
    }
    return items;
  }, [editData, rows]);

  const handleApply = async () => {
    const items = buildDiff();
    if (items.length === 0) { message.info('没有检测到任何修改'); return; }
    setApplying(true);
    try {
      const { data: res } = await request.put<{ code: number; message: string; data: { count: number } }>('/products/batch-update', { items });
      if (res.code === 200) {
        message.success(`已更新 ${res.data?.count ?? 0} 个产品`);
        onDone();
      } else { message.error(res.message); }
    } catch { message.error('批量修改失败'); }
    finally { setApplying(false); }
  };

  const handleRollback = () => {
    const ids = rows.map((r) => r.id);
    Modal.confirm({
      title: '批量退回意向产品',
      icon: <ExclamationCircleFilled style={{ color: '#ff4d4f' }} />,
      content: `确定将已选的 ${ids.length} 个产品从「采购计划」退回到「意向产品」吗？退回后需重新确认采购。`,
      okText: '确定退回',
      okType: 'danger',
      cancelText: '取消',
      async onOk() {
        setRolling(true);
        try {
          const { data: res } = await request.put<{ code: number; message: string; data: { count: number } }>('/products/batch-rollback', { ids });
          if (res.code === 200) {
            message.success(res.message || `已退回 ${res.data?.count ?? 0} 个产品`);
            onDone();
          } else { message.error(res.message); }
        } catch { message.error('批量退回失败'); }
        finally { setRolling(false); }
      },
    });
  };

  const dimSep = <span style={{ color: '#c0c0c0', fontSize: 11, fontWeight: 300, userSelect: 'none', flexShrink: 0, lineHeight: 1 }}>×</span>;

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ToolOutlined style={{ color: '#1890ff', fontSize: 18 }} />
          <span style={{ fontWeight: 600, fontSize: 16 }}>批量编辑工作台</span>
          <Tag color="blue" bordered={false} style={{ fontWeight: 600, fontSize: 13, borderRadius: 6 }}>{rows.length} 款产品</Tag>
        </div>
      }
      open={open}
      onCancel={onCancel}
      width="85%"
      style={{ maxWidth: 1280, top: 40 }}
      destroyOnClose
      maskClosable={false}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button danger ghost icon={<RollbackOutlined />} loading={rolling} onClick={handleRollback} size="large">
              退回意向产品
            </Button>
            <span style={{ fontSize: 12, color: '#ff4d4f' }}>危险操作：退回后需重新确认采购</span>
          </div>
          <Space size={12}>
            <Button onClick={onCancel} size="large">取消</Button>
            <Button type="primary" loading={applying} onClick={handleApply} size="large"
              style={{ minWidth: 120, boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}
            >
              应用修改
            </Button>
          </Space>
        </div>
      }
    >
      <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 14 }}>
        直接在表格中逐行编辑，未修改的字段将保持原样。点击「应用修改」一次性提交所有变更。
      </div>

      <div style={{ maxHeight: 520, overflowY: 'auto', border: '1px solid #e8e8e8', borderRadius: 10, background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#1e293b', position: 'sticky', top: 0, zIndex: 1 }}>
              <th style={{ ...bthStyle, width: 170, borderRadius: '10px 0 0 0' }}>产品</th>
              <th style={{ ...bthStyle, width: 160 }}>中文名</th>
              <th style={{ ...bthStyle, width: 230 }}>尺寸 (cm)</th>
              <th style={{ ...bthStyle, width: 130 }}>实重 (kg)</th>
              <th style={{ ...bthStyle, width: 130 }}>采购价 (¥)</th>
              <th style={{ ...bthStyle, width: 110, borderRadius: '0 10px 0 0' }}>数量</th>
            </tr>
          </thead>
          <tbody>
            {editData.map((row, idx) => (
              <tr key={row.id} style={{ borderBottom: '1px solid #f0f0f0', transition: 'background 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
              >
                <td style={{ ...btdStyle, background: '#f9fafb', borderRight: '1px solid #f0f0f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {row.imageUrl
                      ? <img src={row.imageUrl} width={36} height={36} referrerPolicy="no-referrer" style={{ borderRadius: 6, objectFit: 'cover', border: '1px solid #e8e8e8', flexShrink: 0 }} />
                      : <div style={{ width: 36, height: 36, borderRadius: 6, background: '#f0f0f0', flexShrink: 0 }} />}
                    <span style={{ fontFamily: "'Inter', monospace", fontSize: 12, fontWeight: 500, letterSpacing: 0.3, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.sku || '—'}
                    </span>
                  </div>
                </td>
                <td style={btdStyle}>
                  <Input
                    size="middle" value={row.chineseName ?? ''}
                    onChange={(e) => updateField(idx, 'chineseName', e.target.value || null)}
                    placeholder="输入中文名" style={{ borderRadius: 6 }}
                  />
                </td>
                <td style={btdStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <InputNumber size="middle" value={row.length} onChange={(v) => updateField(idx, 'length', v)} placeholder="长" min={0} precision={1} style={{ width: 64 }} />
                    {dimSep}
                    <InputNumber size="middle" value={row.width} onChange={(v) => updateField(idx, 'width', v)} placeholder="宽" min={0} precision={1} style={{ width: 64 }} />
                    {dimSep}
                    <InputNumber size="middle" value={row.height} onChange={(v) => updateField(idx, 'height', v)} placeholder="高" min={0} precision={1} style={{ width: 64 }} />
                  </div>
                </td>
                <td style={btdStyle}>
                  <InputNumber size="middle" value={row.actualWeight} onChange={(v) => updateField(idx, 'actualWeight', v)} placeholder="0.00" min={0} precision={2} style={{ width: '100%' }} suffix="kg" />
                </td>
                <td style={btdStyle}>
                  <InputNumber size="middle" value={row.purchasePrice} onChange={(v) => updateField(idx, 'purchasePrice', v)} placeholder="0.00" min={0} precision={2} style={{ width: '100%' }} prefix="¥" />
                </td>
                <td style={btdStyle}>
                  <InputNumber size="middle" value={row.purchaseQuantity} onChange={(v) => updateField(idx, 'purchaseQuantity', v)} placeholder="0" min={1} precision={0} style={{ width: '100%' }} suffix="件" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

const bthStyle: React.CSSProperties = {
  padding: '12px 14px', textAlign: 'left', fontSize: 12,
  color: '#e2e8f0', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase',
  whiteSpace: 'nowrap',
};
const btdStyle: React.CSSProperties = {
  padding: '10px 14px', verticalAlign: 'middle',
};

// ─── 确认采购单弹窗 ───────────────────────────────────────────

interface OrderConfirmModalProps {
  open: boolean;
  rows: PurchasingProduct[];
  onCancel: () => void;
  onSuccess: () => void;
}

interface AliAddress {
  addressId: string;
  fullName: string;
  mobile: string;
  provinceText: string;
  cityText: string;
  areaText: string;
  townText: string;
  address: string;
  isDefault: boolean;
}

function OrderConfirmModal({ open, rows, onCancel, onSuccess }: OrderConfirmModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [alibabaResult, setAlibabaResult] = useState<{ success: boolean; aliOrderId?: string; errorMessage?: string } | null>(null);

  const [addresses, setAddresses] = useState<AliAddress[]>([]);
  const [addrLoading, setAddrLoading] = useState(false);
  const [selectedAddrId, setSelectedAddrId] = useState<string | undefined>(undefined);

  const linkedRows = useMemo(() => rows.filter((r) => r.externalProductId), [rows]);

  const grandTotal = useMemo(
    () => rows.reduce((sum, r) => sum + (r.purchasePrice ?? 0) * (r.purchaseQuantity ?? 0), 0),
    [rows],
  );

  useEffect(() => {
    if (!open || linkedRows.length === 0) return;
    setAddrLoading(true);
    request.get<{ code: number; data: AliAddress[] }>('/alibaba/addresses')
      .then(({ data: res }) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setAddresses(list);
        const defaultAddr = list.find((a) => a.isDefault) ?? list[0];
        if (defaultAddr) setSelectedAddrId(defaultAddr.addressId);
      })
      .catch(() => { setAddresses([]); })
      .finally(() => setAddrLoading(false));
  }, [open, linkedRows.length]);

  const handleConfirm = async () => {
    if (linkedRows.length > 0 && !selectedAddrId) {
      message.warning('请先选择收货地址');
      return;
    }
    setSubmitting(true);
    setAlibabaResult(null);
    try {
      const { data: res } = await request.post<{ code: number; message: string; data: { orderNo: string } }>('/orders', {
        productIds: rows.map((r) => r.id),
      });
      if (res.code !== 200) { message.error(res.message); return; }

      message.success(`${res.message}（单号：${res.data?.orderNo}）`);

      if (linkedRows.length > 0) {
        try {
          const { data: aliRes } = await request.post<{
            code: number; message: string;
            data: { success: boolean; aliOrderId?: string; errorCode?: string; errorMessage?: string; rawError?: string; syncedCount?: number; debug_payload?: unknown };
          }>('/alibaba/create-order', {
            productIds: linkedRows.map((r) => r.id),
            addressId: selectedAddrId,
          });

          if (aliRes.code === 200 && aliRes.data?.success) {
            setAlibabaResult({ success: true, aliOrderId: aliRes.data.aliOrderId });
            message.success(`1688 下单成功！订单号: ${aliRes.data.aliOrderId}`);
          } else {
            const errCode = aliRes.data?.errorCode ?? '';
            const errMsg = aliRes.data?.errorMessage ?? aliRes.message ?? '';
            const rawErr = aliRes.data?.rawError ?? '';
            const debugPayload = aliRes.data?.debug_payload;

            let displayMsg = errMsg || '1688 返回了未知错误';
            if (errCode) displayMsg = `[${errCode}] ${displayMsg}`;

            const knownErrors: Record<string, string> = {
              'NO_TOKEN':        '1688 授权已过期，请到「系统设置 → 1688 配置」重新绑定账号',
              'NO_ADDRESS':      '未选择收货地址，请在下单弹窗中选择收货地址',
              'OFFER_NOT_EXIST': '商品不存在或已下架，请核实 1688 关联的商品信息',
            };
            const friendlyMsg = knownErrors[errCode] ?? displayMsg;

            setAlibabaResult({ success: false, errorMessage: friendlyMsg });
            Modal.error({
              title: '1688 下单失败',
              width: 560,
              content: (
                <div>
                  <p style={{ fontSize: 14, marginBottom: 8 }}>{friendlyMsg}</p>
                  {debugPayload != null && (
                    <details open style={{ fontSize: 12, marginBottom: rawErr ? 8 : 0 }}>
                      <summary style={{ cursor: 'pointer', marginBottom: 4, fontWeight: 600, color: '#d4380d' }}>🔍 查看发往 1688 的完整 Payload（排雷用）</summary>
                      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 280, overflow: 'auto', background: '#fff7e6', padding: 10, borderRadius: 6, fontSize: 11, border: '1px solid #ffd591' }}>{JSON.stringify(debugPayload, null, 2)}</pre>
                    </details>
                  )}
                  {rawErr && (
                    <details style={{ fontSize: 12, color: '#8c8c8c' }}>
                      <summary style={{ cursor: 'pointer', marginBottom: 4 }}>查看 1688 原始返回</summary>
                      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto', background: '#f5f5f5', padding: 8, borderRadius: 6, fontSize: 11 }}>{rawErr}</pre>
                    </details>
                  )}
                </div>
              ),
              okText: '知道了',
            });
          }
        } catch (err: unknown) {
          const axiosData = (err as { response?: { data?: { message?: string; debug_payload?: unknown } } })?.response?.data;
          const errMsg = axiosData?.message ?? (err instanceof Error ? err.message : '网络异常');
          const debugPayload = axiosData?.debug_payload;
          setAlibabaResult({ success: false, errorMessage: errMsg });
          Modal.error({
            title: '1688 下单请求失败',
            width: 560,
            content: (
              <div>
                <p style={{ fontSize: 14, marginBottom: 8 }}>本地采购单已创建成功，但同步 1688 下单时出错：{errMsg}</p>
                {debugPayload != null && (
                  <details open style={{ fontSize: 12, marginTop: 12 }}>
                    <summary style={{ cursor: 'pointer', marginBottom: 4, fontWeight: 600, color: '#d4380d' }}>🔍 查看发往 1688 的完整 Payload（排雷用）</summary>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 280, overflow: 'auto', background: '#fff7e6', padding: 10, borderRadius: 6, fontSize: 11, border: '1px solid #ffd591' }}>{JSON.stringify(debugPayload, null, 2)}</pre>
                  </details>
                )}
              </div>
            ),
            okText: '知道了',
          });
        }
      }

      onSuccess();
    } catch { message.error('创建采购单失败'); }
    finally { setSubmitting(false); }
  };

  const orderColumns = useMemo<ColumnsType<PurchasingProduct>>(() => [
    {
      title: '图片', dataIndex: 'imageUrl', width: 56,
      render: (url: string | null) =>
        url
          ? <Image src={url} width={40} height={40} style={{ objectFit: 'cover', borderRadius: 6, border: '1px solid #f0f0f0' }} preview={false} />
          : <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center"><ShoppingOutlined className="text-gray-300" /></div>,
    },
    {
      title: 'SKU', dataIndex: 'sku', width: 130,
      render: (v: string | null) => v
        ? <span style={{ fontFamily: "'Inter', monospace", fontSize: 13, letterSpacing: 0.5 }}>{v}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '中文名', dataIndex: 'chineseName', ellipsis: { showTitle: false },
      render: (v: string | null) => v
        ? <Tooltip title={v} placement="topLeft"><span style={{ fontSize: 13 }}>{v}</span></Tooltip>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '采购链接', dataIndex: 'purchaseUrl', width: 100, align: 'center',
      render: (v: string | null) => v
        ? <a onClick={() => window.open(v, '_blank', 'noreferrer,noopener')} style={{ color: '#1890ff', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 13 }}>🔗 直达货源</a>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '采购价', dataIndex: 'purchasePrice', width: 100, align: 'right',
      render: (v: number | null) => v != null
        ? <span style={{ fontWeight: 600, color: '#d4380d', fontFeatureSettings: '"tnum"', fontSize: 13 }}>¥{v.toFixed(2)}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '数量', dataIndex: 'purchaseQuantity', width: 70, align: 'center',
      render: (v: number | null) => v != null
        ? <span className="tabular-nums font-medium" style={{ fontSize: 13 }}>{v}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: '合计', key: 'subtotal', width: 110, align: 'right',
      render: (_: unknown, record: PurchasingProduct) => {
        const sub = (record.purchasePrice ?? 0) * (record.purchaseQuantity ?? 0);
        return sub > 0
          ? <span style={{ fontWeight: 700, color: '#1e293b', fontFeatureSettings: '"tnum"', fontSize: 13 }}>¥{sub.toFixed(2)}</span>
          : <span className="text-gray-300">—</span>;
      },
    },
    {
      title: '1688 同步', key: 'alibaba', width: 80, align: 'center',
      render: (_: unknown, record: PurchasingProduct) =>
        record.externalProductId
          ? <Tag color="orange" bordered={false} style={{ borderRadius: 6, fontWeight: 600, fontSize: 11 }}>将下单</Tag>
          : <span style={{ color: '#d9d9d9', fontSize: 12 }}>—</span>,
    },
  ], []);

  return (
    <Modal
      title={<span><FileDoneOutlined style={{ marginRight: 8, color: '#1890ff' }} />核对并创建采购单</span>}
      open={open}
      onCancel={onCancel}
      width={820}
      destroyOnClose
      maskClosable={false}
      footer={[
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button key="confirm" type="primary" loading={submitting} onClick={handleConfirm}
          style={{ background: '#52c41a', borderColor: '#52c41a' }}
        >
          确认下单
        </Button>,
      ]}
    >
      <Table
        rowKey="id"
        dataSource={rows}
        columns={orderColumns}
        pagination={false}
        size="small"
        scroll={{ y: 320 }}
        style={{ marginBottom: 16 }}
      />

      {linkedRows.length > 0 && (
        <div style={{
          background: '#fff7e6', border: '1px solid #ffe7ba', borderRadius: 10,
          padding: '12px 16px', marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <EnvironmentOutlined style={{ color: '#fa8c16', fontSize: 16 }} />
            <span style={{ fontWeight: 600, fontSize: 14, color: '#874d00' }}>收货地址</span>
            {addrLoading && <Spin size="small" />}
          </div>
          {addresses.length > 0 ? (
            <Select
              style={{ width: '100%' }}
              value={selectedAddrId}
              onChange={setSelectedAddrId}
              placeholder="请选择收货地址"
              optionLabelProp="label"
              loading={addrLoading}
            >
              {addresses.map((a) => (
                <Select.Option
                  key={a.addressId}
                  value={a.addressId}
                  label={`${a.fullName} — ${a.provinceText}${a.cityText}${a.areaText}${a.address}`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{a.fullName}</span>
                      <span style={{ color: '#8c8c8c', marginLeft: 8, fontSize: 12 }}>{a.mobile}</span>
                      <span style={{ color: '#595959', marginLeft: 12, fontSize: 13 }}>
                        {a.provinceText}{a.cityText}{a.areaText}{a.townText}{a.address}
                      </span>
                    </div>
                    {a.isDefault && <Tag color="blue" bordered={false} style={{ borderRadius: 4, fontSize: 11 }}>默认</Tag>}
                  </div>
                </Select.Option>
              ))}
            </Select>
          ) : !addrLoading ? (
            <span style={{ color: '#bfbfbf', fontSize: 13 }}>未获取到 1688 收货地址，将使用系统默认地址</span>
          ) : null}
        </div>
      )}

      <div style={{
        background: '#f6f8fa', borderRadius: 10, padding: '14px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ fontSize: 12, color: '#8c8c8c' }}>
          {linkedRows.length > 0 ? (
            <Tag color="orange" bordered={false} style={{ borderRadius: 6 }}>
              🔗 {linkedRows.length} 个已关联 1688，下单后将自动同步到 1688
            </Tag>
          ) : (
            <span style={{ color: '#bfbfbf' }}>无已关联 1688 的产品，仅创建本地采购单</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 14, color: '#595959' }}>
            本次共采购 <b style={{ color: '#1e293b', fontSize: 16 }}>{rows.length}</b> 款产品，总计金额：
          </span>
          <span style={{ fontSize: 22, fontWeight: 700, color: '#d4380d', fontFeatureSettings: '"tnum"' }}>
            ¥{grandTotal.toFixed(2)}
          </span>
        </div>
      </div>
    </Modal>
  );
}
