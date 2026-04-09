import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Table, Tag, Button, Tooltip, message, Empty, Image, Space, Modal,
  InputNumber, Input, Dropdown, Form, Select, Spin,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table/interface';
import type { MenuProps } from 'antd';
import {
  SearchOutlined, ShoppingOutlined, ReloadOutlined, LinkOutlined,
  FileTextOutlined, FileDoneOutlined, ToolOutlined, DownOutlined,
  ExclamationCircleFilled, RollbackOutlined,
  DownloadOutlined, DeleteOutlined,
} from '@ant-design/icons';
import request from '../lib/request';
import AlibabaMappingModal from '../components/AlibabaMappingModal';

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
  const [removing,        setRemoving]        = useState(false);
  const [mappingTarget,   setMappingTarget]   = useState<PurchasingProduct | null>(null);
  // 内联数量编辑：key = product.id，value = 当前输入框的值（未保存）
  const [editingQty,      setEditingQty]      = useState<Record<number, number | null>>({});

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

  // ── 批量移除（退回意向池）─────────────────────────────────────
  const handleBatchRemove = useCallback(() => {
    if (selectedRowKeys.length === 0) return;
    const ids = selectedRows.map((r) => r.id);
    Modal.confirm({
      title: '批量移出采购计划',
      icon: <ExclamationCircleFilled style={{ color: '#ff4d4f' }} />,
      content: `确定要将这 ${ids.length} 个产品彻底移出采购计划吗？`,
      okText: '彻底移出',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setRemoving(true);
        try {
          const { data: res } = await request.post<{ code: number; message: string; data: { count: number } }>(
            '/products/batch-discard', { ids },
          );
          if (res.code === 200) {
            message.success('已成功移出采购计划');
            setSelectedRowKeys([]);   // 清空僵尸选中 ID
            setSelectedRows([]);
            fetchProducts(page, pageSize);   // 立刻刷新，让产品视觉消失
          } else {
            message.error(res.message || '操作失败');
          }
        } catch {
          message.error('移出失败，请检查网络');
        } finally {
          setRemoving(false);
        }
      },
    });
  }, [selectedRowKeys, selectedRows, page, pageSize, fetchProducts]);

  // ── 内联数量保存（onBlur 触发）───────────────────────────────
  const handleQuantityBlur = useCallback(async (id: number) => {
    const newQty = editingQty[id];
    // 未修改或值非法则跳过
    if (newQty == null || newQty < 1) return;
    const orig = products.find((p) => p.id === id);
    if (orig && orig.purchaseQuantity === newQty) return;
    try {
      const { data: res } = await request.put<{ code: number; message: string }>(
        '/products/batch-update',
        { items: [{ id, purchaseQuantity: newQty }] },
      );
      if (res.code === 200) {
        // 原地更新本地 products，避免整页刷新
        setProducts((prev) => prev.map((p) => p.id === id ? { ...p, purchaseQuantity: newQty } : p));
        // 清除编辑态
        setEditingQty((prev) => { const n = { ...prev }; delete n[id]; return n; });
      } else {
        message.error(res.message || '数量保存失败');
      }
    } catch {
      message.error('数量保存失败，请检查网络');
    }
  }, [editingQty, products]);

  // ── 单行移除（复用 batch-discard，ids 包装为单元素数组）────────
  const handleRemoveFromPlan = useCallback((id: number) => {
    Modal.confirm({
      title: '确认移除',
      icon: <ExclamationCircleFilled style={{ color: '#ff4d4f' }} />,
      content: '将此产品从采购计划中移除？移除后需重新加入才能下单。',
      okText: '移除',
      okType: 'danger',
      cancelText: '取消',
      async onOk() {
        try {
          const { data: res } = await request.post<{ code: number; message: string }>(
            '/products/batch-discard',
            { ids: [id] },
          );
          if (res.code === 200) {
            message.success('已成功移出采购计划');
            fetchProducts(page, pageSize);
          } else {
            message.error(res.message || '移除失败');
          }
        } catch {
          message.error('移除失败，请检查网络');
        }
      },
    });
  }, [fetchProducts, page, pageSize]);

  // ── 批量下载 CSV（纯前端）────────────────────────────────────
  const handleBatchDownload = useCallback(() => {
    if (selectedRows.length === 0) return;

    const headers = ['SKU', '中文名', '采购价(¥)', '采购数量', '采购总金额(¥)', '采购链接', '1688订单号'];
    const rows = selectedRows.map((r) => {
      const qty    = r.purchaseQuantity ?? 0;
      const price  = r.purchasePrice   ?? 0;
      const total  = (price * qty).toFixed(2);
      // 字段含逗号/引号时用双引号包裹
      const cell = (v: string | number | null | undefined) => {
        const s = String(v ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };
      return [
        cell(r.sku),
        cell(r.chineseName),
        cell(price.toFixed(2)),
        cell(qty),
        cell(total),
        cell(r.purchaseUrl),
        cell(r.externalOrderId),
      ].join(',');
    });

    const bom = '\uFEFF'; // UTF-8 BOM，确保 Excel 正确显示中文
    const csv = bom + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const now  = new Date();
    const ts   = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `采购计划明细_${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    message.success(`已导出 ${selectedRows.length} 条采购明细`);
  }, [selectedRows]);

  // ── Dropdown 菜单配置 ─────────────────────────────────────────
  const dropdownItems = useMemo<MenuProps['items']>(() => [
    {
      key:   'create',
      icon:  <FileTextOutlined />,
      label: '📝 创建采购单',
      onClick: () => setOrderModalOpen(true),
    },
    {
      key:   'download',
      icon:  <DownloadOutlined />,
      label: '⬇️ 批量下载/导出',
      onClick: handleBatchDownload,
    },
    { type: 'divider' as const },
    {
      key:    'remove',
      icon:   <DeleteOutlined />,
      label:  '🗑️ 彻底移除',
      danger: true,
      onClick: handleBatchRemove,
    },
  ], [handleBatchDownload, handleBatchRemove]);

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
      title: '采购数量', dataIndex: 'purchaseQuantity', width: 120, align: 'center',
      render: (_: unknown, record: PurchasingProduct) => (
        <InputNumber
          size="small"
          min={1}
          precision={0}
          style={{ width: 90 }}
          value={editingQty[record.id] ?? record.purchaseQuantity ?? undefined}
          onChange={(v) => setEditingQty((prev) => ({ ...prev, [record.id]: v }))}
          onBlur={() => handleQuantityBlur(record.id)}
          onPressEnter={() => handleQuantityBlur(record.id)}
        />
      ),
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
    {
      title: '操作', key: 'actions', width: 80, align: 'center', fixed: 'right' as const,
      render: (_: unknown, record: PurchasingProduct) => (
        <Button
          type="link"
          size="small"
          danger
          style={{ padding: 0, fontSize: 12 }}
          onClick={() => handleRemoveFromPlan(record.id)}
        >
          移除
        </Button>
      ),
    },
  ], [editingQty, handleQuantityBlur, handleRemoveFromPlan]);

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

      <div style={{ marginBottom: 16 }}>
        <Dropdown
          menu={{ items: dropdownItems }}
          trigger={['click']}
          disabled={selectedRowKeys.length === 0}
        >
          <Button
            type="primary"
            icon={<ToolOutlined />}
            disabled={selectedRowKeys.length === 0}
            loading={removing}
          >
            🛠️ 批量处理{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''} <DownOutlined />
          </Button>
        </Dropdown>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <Table
          rowKey="id" dataSource={products} columns={columns} loading={loading}
          scroll={{ x: 'max-content', y: 'calc(100vh - 270px)' }} size="large" onChange={handlePageChange}
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
          // 清空选中状态，防止旧选中项污染下次操作
          setSelectedRowKeys([]);
          setSelectedRows([]);
          // 强制回第 1 页刷新，确保后端新过滤逻辑生效后产品立即从列表消失
          setPage(1);
          fetchProducts(1, pageSize);
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

export function BatchOperationModal({ open, rows, onCancel, onDone }: BatchOperationModalProps) {
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

// 弹窗内可编辑行
interface OrderEditRow {
  id:               number;
  purchaseQuantity: number;
}

interface WarehouseOption { id: number; name: string; }

function OrderConfirmModal({ open, rows, onCancel, onSuccess }: OrderConfirmModalProps) {
  const [submitting,   setSubmitting]   = useState(false);
  const [editData,     setEditData]     = useState<OrderEditRow[]>([]);
  const [warehouseId,  setWarehouseId]  = useState<number | undefined>(undefined);
  const [warehouses,   setWarehouses]   = useState<WarehouseOption[]>([]);
  const [whLoading,    setWhLoading]    = useState(false);

  useEffect(() => {
    if (!open) return;
    setEditData(rows.map((r) => ({
      id:               r.id,
      purchaseQuantity: r.purchaseQuantity ?? 1,
    })));
    setWarehouseId(undefined);

    // 拉取仓库列表
    setWhLoading(true);
    request.get<{ code: number; data: WarehouseOption[] | { list: WarehouseOption[] } }>(
      '/warehouses',
    ).then(({ data: res }) => {
      if (res.code === 200) {
        const list = Array.isArray(res.data)
          ? res.data
          : Array.isArray((res.data as { list: WarehouseOption[] }).list)
            ? (res.data as { list: WarehouseOption[] }).list
            : [];
        setWarehouses(list);
        // 仅一个仓库时自动选中
        if (list.length === 1) setWarehouseId(list[0].id);
      }
    }).catch(() => { /* silent */ })
      .finally(() => setWhLoading(false));
  }, [open, rows]);

  const updateQuantity = useCallback((id: number, val: number | null) => {
    setEditData((prev) => prev.map((r) => r.id === id ? { ...r, purchaseQuantity: val ?? 1 } : r));
  }, []);

  const quantityMap = useMemo(
    () => Object.fromEntries(editData.map((r) => [r.id, r.purchaseQuantity])),
    [editData],
  );

  const grandTotal = useMemo(
    () => rows.reduce((sum, r) => sum + (r.purchasePrice ?? 0) * (quantityMap[r.id] ?? r.purchaseQuantity ?? 0), 0),
    [rows, quantityMap],
  );

  const handleConfirm = async () => {
    if (!warehouseId) {
      message.error('请先选择入库目标仓库！');
      return;
    }
    setSubmitting(true);
    try {
      // ── Step 1：将修改过的数量持久化到数据库 ─────────────────
      const changedItems = editData
        .map((ed) => {
          const orig = rows.find((r) => r.id === ed.id);
          return orig && ed.purchaseQuantity !== (orig.purchaseQuantity ?? 1)
            ? { id: ed.id, purchaseQuantity: ed.purchaseQuantity }
            : null;
        })
        .filter(Boolean);

      if (changedItems.length > 0) {
        const { data: saveRes } = await request.put<{ code: number; message: string }>(
          '/products/batch-update', { items: changedItems },
        );
        if (saveRes.code !== 200) {
          message.error(saveRes.message || '数量保存失败，请重试');
          return;
        }
      }

      // ── Step 2：创建本地采购单，携带 warehouseId ────────────
      const { data: res } = await request.post<{
        code: number; message: string; data: { orderNo?: string; count?: number };
      }>('/purchases/create-local', {
        warehouseId,
        items: editData.map((r) => ({
          productId: r.id,
          quantity:  r.purchaseQuantity,
        })),
      });
      if (res.code !== 200) { message.error(res.message || '创建采购单失败'); return; }

      const hint = res.data?.orderNo
        ? `（单号：${res.data.orderNo}）`
        : res.data?.count != null ? `（共生成 ${res.data.count} 张采购单）` : '';
      message.success(`${res.message || '采购单创建成功！'}${hint}`);

      onSuccess();  // 触发父组件刷新列表，已流转产品自动消失
    } catch {
      message.error('创建采购单失败，请检查网络后重试');
    } finally {
      setSubmitting(false);
    }
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
      title: '数量', dataIndex: 'purchaseQuantity', width: 100, align: 'center',
      render: (_: unknown, record: PurchasingProduct) => (
        <InputNumber
          size="small"
          value={quantityMap[record.id] ?? record.purchaseQuantity ?? 1}
          min={1}
          precision={0}
          style={{ width: 80 }}
          suffix="件"
          onChange={(v) => updateQuantity(record.id, v)}
        />
      ),
    },
    {
      title: '合计', key: 'subtotal', width: 110, align: 'right',
      render: (_: unknown, record: PurchasingProduct) => {
        const qty = quantityMap[record.id] ?? record.purchaseQuantity ?? 0;
        const sub = (record.purchasePrice ?? 0) * qty;
        return sub > 0
          ? <span style={{ fontWeight: 700, color: '#1e293b', fontFeatureSettings: '"tnum"', fontSize: 13 }}>¥{sub.toFixed(2)}</span>
          : <span className="text-gray-300">—</span>;
      },
    },
  ], [quantityMap, updateQuantity]);

  return (
    <Modal
      title={<span><FileDoneOutlined style={{ marginRight: 8, color: '#1890ff' }} />核对并创建采购单</span>}
      open={open}
      onCancel={onCancel}
      width={800}
      destroyOnClose
      maskClosable={false}
      footer={[
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button
          key="confirm"
          type="primary"
          loading={submitting}
          disabled={!warehouseId}
          onClick={handleConfirm}
          style={warehouseId ? { background: '#52c41a', borderColor: '#52c41a' } : {}}
        >
          确认创建采购单
        </Button>,
      ]}
    >
      <Table
        rowKey="id"
        dataSource={rows}
        columns={orderColumns}
        pagination={false}
        size="small"
        scroll={{ y: 300 }}
        style={{ marginBottom: 16 }}
      />

      {/* 仓库选择（必填防呆） */}
      <Form layout="vertical" style={{ marginBottom: 12 }}>
        <Form.Item
          label={
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              📦 入库目标仓库
              <span style={{ color: '#ff4d4f', marginLeft: 4 }}>*</span>
            </span>
          }
          style={{ marginBottom: 0 }}
          validateStatus={!warehouseId ? 'warning' : 'success'}
          help={!warehouseId ? '请务必选择入库目标仓库，否则无法创建采购单' : undefined}
        >
          {whLoading ? (
            <div style={{ padding: '8px 0' }}><Spin size="small" /><span style={{ marginLeft: 8, color: '#9ca3af', fontSize: 12 }}>加载仓库列表…</span></div>
          ) : (
            <Select
              placeholder="请务必选择入库目标仓库"
              value={warehouseId}
              onChange={setWarehouseId}
              style={{ width: '100%' }}
              size="large"
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              allowClear
            />
          )}
        </Form.Item>
      </Form>

      {/* 汇总栏 */}
      <div style={{
        background: '#f6f8fa', borderRadius: 10, padding: '14px 20px',
        display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 14, color: '#595959' }}>
          共 <b style={{ color: '#1e293b', fontSize: 16 }}>{rows.length}</b> 款产品，总金额：
        </span>
        <span style={{ fontSize: 22, fontWeight: 700, color: '#d4380d', fontFeatureSettings: '"tnum"' }}>
          ¥{grandTotal.toFixed(2)}
        </span>
      </div>
    </Modal>
  );
}
