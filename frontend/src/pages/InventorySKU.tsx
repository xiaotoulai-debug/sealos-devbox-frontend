import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Table, Tag, Input, Button, Empty, Image, Tooltip, message,
  Dropdown, Modal, Space, InputNumber, Upload,
  Form, Select,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table/interface';
import type { MenuProps } from 'antd';
import {
  SearchOutlined, ShoppingOutlined, ReloadOutlined, DatabaseOutlined, LinkOutlined,
  ToolOutlined, FileTextOutlined, HomeOutlined, EditOutlined,
  DownOutlined, PlusOutlined, AppstoreAddOutlined, ExportOutlined, GlobalOutlined,
  UploadOutlined, DeleteOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import request from '../lib/request';
import { isSuperAdminUser } from '../lib/auth';
import AlibabaMappingModal from '../components/AlibabaMappingModal';
import RepeatPurchaseModal from '../components/RepeatPurchaseModal';
import type { RepeatPurchaseRow } from '../components/RepeatPurchaseModal';
import BatchImportDimensionsModal from '../components/BatchImportDimensionsModal';
import { MAX_EXCEL_IMPORT_ROWS, ExcelRowLimitExceededError, mergeDefinedPayloadFields } from '../utils/excelImport';

interface WarehouseStock {
  warehouseId:         number;
  warehouseName:       string;
  stockQuantity:       number;
  lockedQuantity?:     number | null;
  inTransitQuantity?:  number | null;
  /** 仓维度销量（后端字段名以接口为准） */
  sales7?:             number | null;
  sales14?:            number | null;
  sales30?:            number | null;
  /** 入库成本（含运费），人民币 */
  unitCost?:           number | null;
}

/** 兼容接口可能返回的下划线字段 */
type WarehouseStockRow = WarehouseStock & {
  sales_7?:   number | null;
  sales_14?:  number | null;
  sales_30?:  number | null;
  unit_cost?: number | null;
};

interface InventoryProduct {
  id:             number;
  pnk:            string;
  title:          string;
  brand:          string | null;
  sku:            string | null;
  chineseName:    string | null;
  developer:      string | null;
  imageUrl:       string | null;
  price:          number | null;
  purchasePrice:  number | null;
  purchaseUrl:    string | null;
  length:         number | null;
  width:          number | null;
  height:         number | null;
  actualWeight:   number | null;
  stockActual:    number;
  stockTotal?:    number | null;   // 后端新增：多仓汇总总库存
  stockInTransit: number;
  sales7d:        number;
  sales14d:       number;
  sales30d:       number;
  status:         string;
  publishStatus:  string;
  externalProductId: string | null;
  externalSkuId:     string | null;
  updatedAt:      string;
  warehouseStocks?: WarehouseStock[] | null;  // 后端新增：各仓明细
}

interface InventorySKUProps {
  onNavigate?: (key: string) => void;
  initialKeyword?: string;
}

export default function InventorySKU({ onNavigate, initialKeyword }: InventorySKUProps) {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total,    setTotal]    = useState(0);
  const [keyword,  setKeyword]  = useState(initialKeyword ?? '');

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [selectedRows,    setSelectedRows]    = useState<InventoryProduct[]>([]);
  const [batchEditOpen,    setBatchEditOpen]    = useState(false);
  const [repeatModalOpen,  setRepeatModalOpen]  = useState(false);
  const [createModalOpen,  setCreateModalOpen]  = useState(false);
  const [batchCreateOpen,  setBatchCreateOpen]  = useState(false);
  const [batchImportDimOpen, setBatchImportDimOpen] = useState(false);
  const [editModalOpen,    setEditModalOpen]    = useState(false);
  const [editTarget,       setEditTarget]       = useState<InventoryProduct | null>(null);
  const [adjustStockOpen,  setAdjustStockOpen]  = useState(false);
  const [exporting,        setExporting]        = useState(false);
  const [mappingTarget,    setMappingTarget]    = useState<InventoryProduct | null>(null);
  /** 多仓明细行受控展开（支持一键全部展开/收起） */
  const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);

  const fetchProducts = useCallback(async (p: number, ps: number, kw: string) => {
    setLoading(true);
    try {
      const { data: res } = await request.get<{
        code: number;
        data: { list: InventoryProduct[]; total: number };
        message: string;
      }>('/products/inventory', { params: { page: p, pageSize: ps, keyword: kw || undefined } });
      if (res.code === 200 && res.data) {
        setProducts(Array.isArray(res.data.list) ? res.data.list : []);
        setTotal(res.data.total ?? 0);
      } else { message.error(res.message || '获取失败'); }
    } catch { message.error('请求失败，请检查网络或后端服务'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const kw = initialKeyword ?? '';
    setKeyword(kw);
    fetchProducts(1, 20, kw);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => {
    setSelectedRowKeys([]);
    setSelectedRows([]);
    fetchProducts(page, pageSize, keyword);
  }, [fetchProducts, page, pageSize, keyword]);

  // 翻页后清空展开态，避免 rowKey 与当前页不一致
  useEffect(() => {
    setExpandedRowKeys([]);
  }, [page, pageSize]);

  const toggleExpandAllWarehouseRows = useCallback(() => {
    if (products.length === 0) return;
    if (expandedRowKeys.length === 0) {
      setExpandedRowKeys(products.map((p) => p.id));
    } else {
      setExpandedRowKeys([]);
    }
  }, [products, expandedRowKeys.length]);

  const handlePageChange = useCallback((pag: TablePaginationConfig) => {
    const np = pag.current ?? 1;
    const ns = pag.pageSize ?? pageSize;
    setPage(np);
    setPageSize(ns);
    fetchProducts(np, ns, keyword);
  }, [fetchProducts, pageSize, keyword]);

  const handleSearch = useCallback((value: string) => {
    setKeyword(value);
    setPage(1);
    fetchProducts(1, pageSize, value);
  }, [fetchProducts, pageSize]);

  const hasSelected = selectedRowKeys.length > 0;

  const handleExportSelected = useCallback(() => {
    if (!hasSelected || selectedRows.length === 0) return;
    setExporting(true);
    message.loading({ content: '正在生成报表...', key: 'export', duration: 0 });
    try {
      const header = 'SKU,中文名,开发人员,采购价,采购链接,长(cm),宽(cm),高(cm),实重(kg),当前库存,在途库存,7天销量,14天销量,30天销量';
      const rows = selectedRows.map((p) => [
        p.sku ?? '', (p.chineseName ?? '').replace(/,/g, '，'), p.developer ?? '',
        p.purchasePrice != null ? p.purchasePrice.toFixed(2) : '',
        p.purchaseUrl ?? '',
        p.length ?? '', p.width ?? '', p.height ?? '',
        p.actualWeight != null ? p.actualWeight.toFixed(2) : '',
        p.stockActual, p.stockInTransit, p.sales7d, p.sales14d, p.sales30d,
      ].join(','));
      const csv = '\uFEFF' + [header, ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory_selected_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success({ content: `已导出 ${selectedRows.length} 条 SKU 数据`, key: 'export' });
    } catch { message.error({ content: '导出失败', key: 'export' }); }
    finally { setExporting(false); }
  }, [hasSelected, selectedRows]);

  const handleExportAll = useCallback(async () => {
    setExporting(true);
    message.loading({ content: '正在生成报表...', key: 'export', duration: 0 });
    try {
      const res = await request.get('/products/inventory-export', {
        params: { keyword: keyword || undefined },
        responseType: 'blob',
      });
      const blob = new Blob([res.data as BlobPart], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory_all_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success({ content: '全局导出完成', key: 'export' });
    } catch { message.error({ content: '导出失败', key: 'export' }); }
    finally { setExporting(false); }
  }, [keyword]);

  const dropdownItems: MenuProps['items'] = useMemo(() => {
    const base: MenuProps['items'] = [
      { key: 'purchasing',    icon: <FileTextOutlined />,   label: '📝 创建采购计划',  onClick: () => setRepeatModalOpen(true) },
      { key: 'adjust-stock',  icon: <EditOutlined />,       label: '✏️ 批量修改库存',  onClick: () => setAdjustStockOpen(true) },
    ];
    if (isSuperAdminUser()) {
      base.push({
        key: 'batch-delete',
        icon: <DeleteOutlined />,
        label: '批量删除',
        danger: true,
        disabled: !hasSelected,
        onClick: () => {
          const ids = selectedRows.map((r) => r.id);
          if (ids.length === 0) return;
          const n = ids.length;
          Modal.confirm({
            title: (
              <span style={{ color: '#cf1322', fontWeight: 600 }}>
                确认要删除选中的 {n} 个产品吗？
              </span>
            ),
            content:
              '此操作不可逆！如果该产品已有库存或关联的单据，强制删除可能导致系统数据异常。请确认！',
            okText: '确认删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
              try {
                const { data: res } = await request.post<{
                  code: number;
                  message: string;
                  data?: { count?: number };
                }>('/products/inventory-batch-delete', { ids });
                if (res.code === 200) {
                  const c = res.data?.count ?? ids.length;
                  message.success(res.message || `已删除 ${c} 个产品`);
                  setSelectedRowKeys([]);
                  setSelectedRows([]);
                  refresh();
                } else {
                  message.error(res.message || '删除失败');
                  return Promise.reject(new Error(res.message || 'delete failed'));
                }
              } catch {
                message.error('删除失败，请检查网络或后端服务');
                return Promise.reject(new Error('network'));
              }
            },
          });
        },
      });
    }
    base.push(
      { key: 'warehouse', icon: <HomeOutlined />, label: '🏭 批量添加仓库', disabled: true, onClick: () => message.info('功能开发中，敬请期待') },
      { type: 'divider' as const },
      { key: 'edit', icon: <EditOutlined />, label: '✏️ 批量修改内容', onClick: () => setBatchEditOpen(true) },
    );
    return base;
  }, [hasSelected, selectedRows, refresh]);

  const addExportItems: MenuProps['items'] = useMemo(() => [
    { key: 'create',       icon: <PlusOutlined />,         label: '➕ 手动创建 SKU',   onClick: () => setCreateModalOpen(true) },
    { key: 'batch-create', icon: <AppstoreAddOutlined />,  label: '🗂️ 批量创建 SKU',  onClick: () => setBatchCreateOpen(true) },
    { key: 'batch-import-dim', icon: <UploadOutlined />, label: '📏 批量更新SKU', onClick: () => setBatchImportDimOpen(true) },
    { type: 'divider' as const },
    { key: 'export-sel',   icon: <ExportOutlined />,       label: '📤 导出勾选 SKU',   disabled: !hasSelected, onClick: handleExportSelected },
    { key: 'export-all',   icon: <GlobalOutlined />,       label: '🌐 导出全局 SKU',   onClick: handleExportAll },
  ], [hasSelected, handleExportSelected, handleExportAll]);

  const columns = useMemo<ColumnsType<InventoryProduct>>(() => [
    {
      title: '图片', dataIndex: 'imageUrl', width: 80, align: 'center', fixed: 'left',
      render: (url: string | null) => url ? (
        <Image src={url} width={50} height={50}
          style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid #f0f0f0' }}
          preview={{ mask: <SearchOutlined style={{ fontSize: 10 }} /> }}
          fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='50'%3E%3Crect fill='%23f5f5f5' width='50' height='50'/%3E%3C/svg%3E"
        />
      ) : (
        <div style={{ width: 50, height: 50, borderRadius: 8, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
          <ShoppingOutlined style={{ color: '#d9d9d9' }} />
        </div>
      ),
    },
    {
      title: '产品详情', key: 'detail', width: 200, ellipsis: true,
      render: (_: unknown, record: InventoryProduct) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "'Inter', monospace", fontWeight: 700, fontSize: 14, letterSpacing: 0.5, color: '#1e293b', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {record.sku ?? '—'}
          </div>
          {record.chineseName ? (
            <Tooltip title={record.chineseName} placement="topLeft">
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {record.chineseName}
              </div>
            </Tooltip>
          ) : (
            <div style={{ fontSize: 12, color: '#d9d9d9' }}>未命名</div>
          )}
        </div>
      ),
    },
    {
      title: '开发人员', dataIndex: 'developer', width: 100, align: 'center',
      render: (v: string | null) => v
        ? <Tag bordered={false} color="blue" style={{ borderRadius: 6, fontWeight: 500 }}>{v}</Tag>
        : <span style={{ color: '#d9d9d9' }}>—</span>,
    },
    {
      title: '采购价', dataIndex: 'purchasePrice', width: 100, align: 'center',
      sorter: (a, b) => (a.purchasePrice ?? 0) - (b.purchasePrice ?? 0),
      render: (v: number | null) => v != null
        ? <span style={{ fontWeight: 700, fontSize: 13, color: '#d4380d', fontFeatureSettings: '"tnum"' }}>¥{v.toFixed(2)}</span>
        : <span style={{ color: '#d9d9d9' }}>—</span>,
    },
    {
      title: '货源', dataIndex: 'purchaseUrl', width: 100, align: 'center',
      render: (v: string | null) => v
        ? <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => window.open(v, '_blank', 'noreferrer,noopener')} style={{ padding: 0, fontWeight: 500, fontSize: 13 }}>直达货源</Button>
        : <span style={{ color: '#d9d9d9' }}>—</span>,
    },
    {
      title: '物流规格', key: 'logistics', width: 160,
      render: (_: unknown, record: InventoryProduct) => {
        const { length: l, width: w, height: h, actualWeight: wt } = record;
        const hasDim = l != null && w != null && h != null;
        return (
          <div style={{ fontSize: 12, lineHeight: 1.8 }}>
            {hasDim ? (
              <div style={{ color: '#475569', fontFeatureSettings: '"tnum"' }}>
                {l}×{w}×{h} <span style={{ color: '#94a3b8' }}>cm</span>
              </div>
            ) : (
              <div style={{ color: '#d9d9d9' }}>— cm</div>
            )}
            {wt != null ? (
              <div style={{ color: '#475569', fontWeight: 500, fontFeatureSettings: '"tnum"' }}>
                {wt.toFixed(2)} <span style={{ color: '#94a3b8' }}>kg</span>
              </div>
            ) : (
              <div style={{ color: '#d9d9d9' }}>— kg</div>
            )}
          </div>
        );
      },
    },
    {
      title: '操作', key: 'action', width: 200, align: 'center', fixed: 'right',
      render: (_: unknown, record: InventoryProduct) => (
        <Space size={4} wrap>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => { setEditTarget(record); setEditModalOpen(true); }}
            style={{ padding: '0 4px' }}
          >
            编辑
          </Button>
          {record.externalProductId ? (
            <Tooltip title={`已绑定: #${record.externalProductId}`}>
              <Button type="link" size="small" onClick={() => setMappingTarget(record)}
                style={{ color: '#ff6a00', fontWeight: 600, padding: '0 4px', fontSize: 12 }}
              >
                1688
              </Button>
            </Tooltip>
          ) : (
            <Button type="link" size="small" onClick={() => setMappingTarget(record)}
              style={{ color: '#bfbfbf', padding: '0 4px', fontSize: 12 }}
            >
              关联1688
            </Button>
          )}
          {record.publishStatus === 'PUBLISHED' || record.status === 'PURCHASING' || record.status === 'ORDERED' ? (
            <Tag color="blue" bordered={false} style={{ borderRadius: 6, fontWeight: 600, margin: 0 }}>采购中</Tag>
          ) : (
            <Tag color="green" bordered={false} style={{ borderRadius: 6, fontWeight: 600, margin: 0 }}>已建库</Tag>
          )}
        </Space>
      ),
    },
  ], []);

  return (
    <div className="min-h-full">
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backgroundColor: '#fff',
          paddingBottom: 16,
          marginBottom: 20,
          boxShadow: '0 1px 0 rgba(0, 0, 0, 0.06)',
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 m-0 flex items-center gap-2">
              <DatabaseOutlined style={{ color: '#1890ff', fontSize: 20 }} />
              库存 SKU
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">
              共 <span className="font-semibold text-gray-700 text-base">{total}</span> 个已建库产品
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, marginLeft: 32 }}>
            <Button
              type="default"
              onClick={toggleExpandAllWarehouseRows}
              disabled={products.length === 0 || loading}
            >
              {expandedRowKeys.length === 0 ? '[+]' : '[-]'} 展开/收起多仓明细
            </Button>
            <Dropdown menu={{ items: dropdownItems }} disabled={!hasSelected} trigger={['click']}>
              <Button icon={<ToolOutlined />} disabled={!hasSelected}>
                🛠️ 批量处理{hasSelected ? ` (${selectedRowKeys.length})` : ''} <DownOutlined />
              </Button>
            </Dropdown>
            <Dropdown menu={{ items: addExportItems }} trigger={['click']}>
              <Button icon={<PlusOutlined />} loading={exporting}>
                📥 添加/导出 <DownOutlined />
              </Button>
            </Dropdown>
            <div style={{ flex: 1 }} />
            <Input.Search
              placeholder="搜索 SKU 或中文名"
              allowClear
              onSearch={handleSearch}
              style={{ width: 280 }}
              enterButton={<SearchOutlined />}
            />
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => { setPage(1); fetchProducts(1, pageSize, keyword); }}>
              刷新
            </Button>
          </div>
        </div>
      </div>

      {/* 勿用 overflow:hidden，否则会打断 Table sticky 表头 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <Table
          rowKey="id"
          dataSource={products}
          columns={columns}
          loading={loading}
          scroll={{ x: 'max-content', y: 'calc(100vh - 280px)' }}
          size="large"
          onChange={handlePageChange}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys, rows) => { setSelectedRowKeys(keys); setSelectedRows(rows); },
          }}
          pagination={{
            current: page, pageSize, total,
            showSizeChanger: true, pageSizeOptions: ['20', '50', '100'],
            showQuickJumper: true,
            showTotal: (t, r) => `第 ${r[0]}–${r[1]} 条 / 共 ${t} 条`,
          }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无已建库产品，请先在「意向产品」中完成建库操作"
                style={{ padding: '64px 0' }}
              />
            ),
          }}
          rowClassName="align-middle"
          expandable={{
            expandedRowKeys,
            onExpandedRowsChange: (keys) => setExpandedRowKeys([...keys]),
            expandedRowRender: (record) => {
              const stocks = record.warehouseStocks ?? [];
              if (stocks.length === 0) {
                return (
                  <div style={{ padding: '4px 12px 4px 48px', background: '#f1f5f9', color: '#94a3b8', fontSize: 12 }}>
                    暂无仓库明细
                  </div>
                );
              }
              return (
                <div style={{ background: '#f1f5f9', margin: 0, padding: 0 }}>
                  <Table<WarehouseStock>
                    rowKey="warehouseId"
                    dataSource={stocks}
                    pagination={false}
                    size="small"
                    bordered={false}
                    showHeader
                    scroll={{ x: 'max-content' }}
                    style={{ margin: 0 }}
                    className="inv-sku-expanded-subtable"
                    components={{
                      header: {
                        cell: (props: React.ThHTMLAttributes<HTMLTableCellElement>) => (
                          <th
                            {...props}
                            style={{
                              ...(props.style as React.CSSProperties | undefined),
                              background: 'transparent',
                              borderBottom: 'none',
                              color: '#888',
                              padding: '2px 8px 4px',
                              fontSize: 12,
                              fontWeight: 500,
                            }}
                          />
                        ),
                      },
                      body: {
                        cell: (props: React.TdHTMLAttributes<HTMLTableCellElement>) => (
                          <td
                            {...props}
                            style={{
                              ...(props.style as React.CSSProperties | undefined),
                              padding: '4px 8px',
                              borderBottom: '1px solid #e8ecf0',
                            }}
                          />
                        ),
                      },
                    }}
                    columns={[
                      {
                        // 幽灵占位列：展开箭头(~32px) + 复选框(~32px) + 图片列(80px) = 约 144px
                        // 如需调整对齐，修改此 width 数值（+/-8px 微调）
                        title: '',
                        key: 'ghost',
                        dataIndex: 'ghost',
                        width: 144,
                        render: () => null,
                      },
                      {
                        title: '仓库名称',
                        dataIndex: 'warehouseName',
                        key: 'warehouseName',
                        width: 192,
                        ellipsis: true,
                        render: (name: string) => (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <HomeOutlined style={{ color: '#bfbfbf', fontSize: 11 }} />
                            <span style={{ color: '#8c8c8c', fontSize: 13, fontWeight: 400 }}>{name}</span>
                          </span>
                        ),
                      },
                      {
                        title: '物理库存',
                        dataIndex: 'stockQuantity',
                        key: 'stockQuantity',
                        width: 88,
                        align: 'center',
                        render: (v: number | null | undefined) => (
                          <span style={{ fontWeight: 700, color: '#1890ff', fontFeatureSettings: '"tnum"', fontSize: 13 }}>
                            {v ?? 0}
                          </span>
                        ),
                      },
                      {
                        title: '在途库存',
                        key: 'inTransitQuantity',
                        width: 88,
                        align: 'center',
                        render: (_: unknown, r: WarehouseStock) => {
                          const v = r.inTransitQuantity ?? 0;
                          return (
                            <span style={{ fontWeight: 600, fontFeatureSettings: '"tnum"', fontSize: 13, color: v > 0 ? '#fa8c16' : '#d9d9d9' }}>
                              {v}
                            </span>
                          );
                        },
                      },
                      {
                        title: '配货锁定',
                        key: 'lockedQuantity',
                        width: 88,
                        align: 'center',
                        render: (_: unknown, r: WarehouseStock) => {
                          const locked = r.lockedQuantity ?? 0;
                          return (
                            <span style={{ fontWeight: 600, fontFeatureSettings: '"tnum"', fontSize: 13, color: locked > 0 ? '#f59e0b' : '#d9d9d9' }}>
                              {locked}
                            </span>
                          );
                        },
                      },
                      {
                        title: '可用发货库存',
                        key: 'available',
                        width: 104,
                        align: 'center',
                        render: (_: unknown, r: WarehouseStock) => {
                          const avail = (r.stockQuantity ?? 0) - (r.lockedQuantity ?? 0);
                          return (
                            <span style={{
                              fontWeight: 700,
                              fontFeatureSettings: '"tnum"',
                              fontSize: 13,
                              color: avail <= 0 ? '#d9d9d9' : avail <= 10 ? '#ff4d4f' : '#52c41a',
                            }}>
                              {avail}
                            </span>
                          );
                        },
                      },
                      {
                        title: '销量 (7/14/30)',
                        key: 'sales71430',
                        width: 148,
                        align: 'center',
                        render: (_: unknown, r: WarehouseStock) => {
                          const row = r as WarehouseStockRow;
                          const s7 = row.sales7 ?? row.sales_7 ?? 0;
                          const s14 = row.sales14 ?? row.sales_14 ?? 0;
                          const s30 = row.sales30 ?? row.sales_30 ?? 0;
                          return (
                            <span style={{ fontWeight: 600, fontSize: 12, color: '#334155', fontFeatureSettings: '"tnum"' }}>
                              {s7} / {s14} / {s30}
                            </span>
                          );
                        },
                      },
                      {
                        title: '入库成本(含运费)',
                        key: 'unitCost',
                        width: 128,
                        align: 'right',
                        render: (_: unknown, r: WarehouseStock) => {
                          const row = r as WarehouseStockRow;
                          const c = row.unitCost ?? row.unit_cost;
                          if (c == null || Number.isNaN(Number(c))) {
                            return <span style={{ color: '#d9d9d9', fontSize: 12 }}>—</span>;
                          }
                          return (
                            <span style={{
                              fontWeight: 800,
                              fontSize: 13,
                              color: '#a16207',
                              fontFeatureSettings: '"tnum"',
                            }}>
                              ¥ {Number(c).toFixed(2)}
                            </span>
                          );
                        },
                      },
                    ]}
                  />
                </div>
              );
            },
            expandRowByClick: false,
          }}
        />
      </div>

      <BatchEditModal
        open={batchEditOpen}
        rows={selectedRows}
        onCancel={() => setBatchEditOpen(false)}
        onDone={() => { setBatchEditOpen(false); refresh(); }}
      />

      <BatchAdjustInventoryModal
        open={adjustStockOpen}
        rows={selectedRows}
        onCancel={() => setAdjustStockOpen(false)}
        onDone={() => {
          setAdjustStockOpen(false);
          setSelectedRowKeys([]);
          setSelectedRows([]);
          refresh();
        }}
      />

      <RepeatPurchaseModal
        open={repeatModalOpen}
        rows={selectedRows.map<RepeatPurchaseRow>((r) => ({
          id:               r.id,
          imageUrl:         r.imageUrl,
          sku:              r.sku,
          chineseName:      r.chineseName,
          purchasePrice:    r.purchasePrice,
          purchaseQuantity: 1,
        }))}
        onCancel={() => setRepeatModalOpen(false)}
        onSuccess={() => {
          setRepeatModalOpen(false);
          refresh();
          if (onNavigate) onNavigate('sc-planning');
        }}
      />

      <CreateSKUModal
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onDone={() => { setCreateModalOpen(false); refresh(); }}
      />

      <EditSKUModal
        open={editModalOpen}
        product={editTarget}
        onCancel={() => { setEditModalOpen(false); setEditTarget(null); }}
        onDone={() => { setEditModalOpen(false); setEditTarget(null); refresh(); }}
      />

      <BatchCreateSKUModal
        open={batchCreateOpen}
        onCancel={() => setBatchCreateOpen(false)}
        onDone={() => { setBatchCreateOpen(false); refresh(); }}
      />

      <BatchImportDimensionsModal
        open={batchImportDimOpen}
        onCancel={() => setBatchImportDimOpen(false)}
        onDone={() => refresh()}
      />

      <AlibabaMappingModal
        open={!!mappingTarget}
        productId={mappingTarget?.id ?? null}
        productSku={mappingTarget?.sku ?? null}
        purchaseUrl={mappingTarget?.purchaseUrl ?? null}
        currentOfferId={mappingTarget?.externalProductId ?? null}
        currentSpecId={mappingTarget?.externalSkuId ?? null}
        onCancel={() => setMappingTarget(null)}
        onDone={() => { setMappingTarget(null); refresh(); }}
      />
    </div>
  );
}

// ─── 返单采购配置弹窗（已提取至 components/RepeatPurchaseModal.tsx）────

// ─── 批量编辑工作台弹窗 ─────────────────────────────────────────

interface EditableRow {
  id:            number;
  imageUrl:      string | null;
  sku:           string | null;
  chineseName:   string | null;
  length:        number | null;
  width:         number | null;
  height:        number | null;
  actualWeight:  number | null;
  purchasePrice: number | null;
}

interface BatchEditModalProps {
  open: boolean;
  rows: InventoryProduct[];
  onCancel: () => void;
  onDone: () => void;
}

function BatchEditModal({ open, rows, onCancel, onDone }: BatchEditModalProps) {
  const [editData, setEditData] = useState<EditableRow[]>([]);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (open) {
      setEditData(rows.map((r) => ({
        id:            r.id,
        imageUrl:      r.imageUrl,
        sku:           r.sku,
        chineseName:   r.chineseName,
        length:        r.length,
        width:         r.width,
        height:        r.height,
        actualWeight:  r.actualWeight,
        purchasePrice: r.purchasePrice,
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
      if (cur.chineseName   !== (orig.chineseName ?? null))   { diff.chineseName   = cur.chineseName;   changed = true; }
      if (cur.length        !== (orig.length ?? null))        { diff.length        = cur.length;        changed = true; }
      if (cur.width         !== (orig.width ?? null))         { diff.width         = cur.width;         changed = true; }
      if (cur.height        !== (orig.height ?? null))        { diff.height        = cur.height;        changed = true; }
      if (cur.actualWeight  !== (orig.actualWeight ?? null))  { diff.actualWeight  = cur.actualWeight;  changed = true; }
      if (cur.purchasePrice !== (orig.purchasePrice ?? null)) { diff.purchasePrice = cur.purchasePrice; changed = true; }
      if (changed) items.push(diff);
    }
    return items;
  }, [editData, rows]);

  const handleApply = async () => {
    const items = buildDiff();
    if (items.length === 0) { message.info('没有检测到任何修改'); return; }
    setApplying(true);
    try {
      const { data: res } = await request.put<{ code: number; message: string; data: { count: number } }>(
        '/products/inventory-batch-update', { items },
      );
      if (res.code === 200) {
        message.success(`已更新 ${res.data?.count ?? 0} 个产品`);
        onDone();
      } else { message.error(res.message); }
    } catch { message.error('批量修改失败'); }
    finally { setApplying(false); }
  };

  const dimSep = <span style={{ color: '#c0c0c0', fontSize: 11, fontWeight: 300, userSelect: 'none', flexShrink: 0, lineHeight: 1 }}>×</span>;

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <EditOutlined style={{ color: '#1890ff', fontSize: 18 }} />
          <span style={{ fontWeight: 600, fontSize: 16 }}>批量编辑工作台</span>
          <Tag color="blue" bordered={false} style={{ fontWeight: 600, fontSize: 13, borderRadius: 6 }}>{rows.length} 款产品</Tag>
        </div>
      }
      open={open} onCancel={onCancel} width="85%" style={{ maxWidth: 1200, top: 40 }}
      destroyOnClose maskClosable={false}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 0' }}>
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
              <th style={{ ...bthStyle, width: 180 }}>中文名</th>
              <th style={{ ...bthStyle, width: 230 }}>尺寸 (cm)</th>
              <th style={{ ...bthStyle, width: 120 }}>实重 (kg)</th>
              <th style={{ ...bthStyle, width: 130, borderRadius: '0 10px 0 0' }}>采购价 (¥)</th>
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
                  <Input size="middle" value={row.chineseName ?? ''} onChange={(e) => updateField(idx, 'chineseName', e.target.value || null)} placeholder="输入中文名" style={{ borderRadius: 6 }} />
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

// ─── 手动创建 SKU 弹窗 ──────────────────────────────────────────

interface CreateSKUModalProps {
  open: boolean;
  onCancel: () => void;
  onDone: () => void;
}

function CreateSKUModal({ open, onCancel, onDone }: CreateSKUModalProps) {
  const [sku,           setSku]           = useState('');
  const [cnName,        setCnName]        = useState('');
  const [purchaseUrl,   setPurchaseUrl]   = useState('');
  const [imgUrl,        setImgUrl]        = useState('');
  const [purchasePrice, setPurchasePrice] = useState<number | null>(null);
  const [dimLen,        setDimLen]        = useState<number | null>(null);
  const [dimWid,        setDimWid]        = useState<number | null>(null);
  const [dimHei,        setDimHei]        = useState<number | null>(null);
  const [weight,        setWeight]        = useState<number | null>(null);
  const [submitting,    setSubmitting]    = useState(false);
  const [uploading,     setUploading]     = useState(false);

  useEffect(() => {
    if (open) { setSku(''); setCnName(''); setPurchaseUrl(''); setImgUrl(''); setPurchasePrice(null); setDimLen(null); setDimWid(null); setDimHei(null); setWeight(null); }
  }, [open]);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data: res } = await request.post<{ code: number; data?: { url?: string }; message?: string }>('/upload', fd);
      if (res.code === 200 && res.data?.url) {
        setImgUrl(res.data.url);
        message.success('图片上传成功');
      } else {
        message.error(res.message ?? '上传失败');
      }
    } catch {
      message.error('图片上传失败，可改用下方链接输入');
    } finally {
      setUploading(false);
    }
  }, []);

  const handleSubmit = async () => {
    if (!sku.trim()) { message.warning('SKU 不能为空'); return; }
    setSubmitting(true);
    try {
      const { data: res } = await request.post<{ code: number; message: string }>('/products/inventory-create', {
        sku: sku.trim(), chineseName: cnName.trim() || null, imageUrl: imgUrl.trim() || null,
        purchaseUrl: purchaseUrl.trim() || null,
        purchasePrice, length: dimLen, width: dimWid, height: dimHei, actualWeight: weight,
      });
      if (res.code === 200) { message.success('创建成功'); onDone(); }
      else { message.error(res.message); }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg ?? '创建失败');
    } finally { setSubmitting(false); }
  };

  const dimSep = <span style={{ color: '#c0c0c0', fontSize: 11, fontWeight: 300, userSelect: 'none' }}>×</span>;

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <PlusOutlined style={{ color: '#1890ff', fontSize: 18 }} />
          <span style={{ fontWeight: 600, fontSize: 16 }}>➕ 手动创建 SKU</span>
        </div>
      }
      open={open} onCancel={onCancel} destroyOnClose maskClosable={false} width={620}
      footer={[
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button key="ok" type="primary" loading={submitting} onClick={handleSubmit} disabled={!sku.trim()}>
          确认创建
        </Button>,
      ]}
    >
      <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 16 }}>
        填写产品信息后创建一个新的库存 SKU，作为资料源头。支持上传图片或粘贴图片链接。
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>
        <div>
          <div style={cLabelStyle}>SKU <span style={{ color: '#ff4d4f' }}>*</span></div>
          <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="输入 SKU 编码" />
        </div>
        <div>
          <div style={cLabelStyle}>中文名</div>
          <Input value={cnName} onChange={(e) => setCnName(e.target.value)} placeholder="输入中文名" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={cLabelStyle}>采购链接 (1688/其他)</div>
          <Input value={purchaseUrl} onChange={(e) => setPurchaseUrl(e.target.value)} placeholder="请输入 1688 商品链接或其它采购源链接" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={cLabelStyle}>产品图片</div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Upload
              accept="image/*"
              maxCount={1}
              listType="picture-card"
              showUploadList={{ showPreviewIcon: false }}
              customRequest={({ file }) => handleUpload(file as File)}
              beforeUpload={() => false}
              disabled={uploading}
            >
              {uploading ? '上传中...' : <div><UploadOutlined /><div>上传图片</div></div>}
            </Upload>
            <div style={{ flex: 1, minWidth: 200 }}>
              <Input value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} placeholder="或粘贴图片 URL" addonBefore="链接" />
            </div>
          </div>
        </div>
        <div>
          <div style={cLabelStyle}>成本/采购价 (¥)</div>
          <InputNumber value={purchasePrice} onChange={setPurchasePrice} min={0} precision={2} prefix="¥" style={{ width: '100%' }} placeholder="0.00" />
        </div>
        <div>
          <div style={cLabelStyle}>重量 (kg)</div>
          <InputNumber value={weight} onChange={setWeight} min={0} precision={2} suffix="kg" style={{ width: '100%' }} placeholder="0.00" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={cLabelStyle}>尺寸 (cm) 长×宽×高</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <InputNumber value={dimLen} onChange={setDimLen} min={0} precision={1} placeholder="长" style={{ flex: 1 }} />
            {dimSep}
            <InputNumber value={dimWid} onChange={setDimWid} min={0} precision={1} placeholder="宽" style={{ flex: 1 }} />
            {dimSep}
            <InputNumber value={dimHei} onChange={setDimHei} min={0} precision={1} placeholder="高" style={{ flex: 1 }} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── 编辑 SKU 弹窗 ────────────────────────────────────────────

interface EditSKUModalProps {
  open: boolean;
  product: InventoryProduct | null;
  onCancel: () => void;
  onDone: () => void;
}

function EditSKUModal({ open, product, onCancel, onDone }: EditSKUModalProps) {
  const [sku,           setSku]           = useState('');
  const [cnName,        setCnName]        = useState('');
  const [purchaseUrl,   setPurchaseUrl]   = useState('');
  const [imgUrl,        setImgUrl]        = useState('');
  const [purchasePrice, setPurchasePrice] = useState<number | null>(null);
  const [dimLen,        setDimLen]        = useState<number | null>(null);
  const [dimWid,        setDimWid]        = useState<number | null>(null);
  const [dimHei,        setDimHei]        = useState<number | null>(null);
  const [weight,        setWeight]        = useState<number | null>(null);
  const [submitting,    setSubmitting]    = useState(false);
  const [uploading,     setUploading]     = useState(false);

  useEffect(() => {
    if (open && product) {
      setSku(product.sku ?? '');
      setCnName(product.chineseName ?? '');
      setPurchaseUrl(product.purchaseUrl ?? '');
      setImgUrl(product.imageUrl ?? '');
      setPurchasePrice(product.purchasePrice ?? null);
      setDimLen(product.length ?? null);
      setDimWid(product.width ?? null);
      setDimHei(product.height ?? null);
      setWeight(product.actualWeight ?? null);
    }
  }, [open, product]);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data: res } = await request.post<{ code: number; data?: { url?: string }; message?: string }>('/upload', fd);
      if (res.code === 200 && res.data?.url) {
        setImgUrl(res.data.url);
        message.success('图片上传成功');
      } else {
        message.error(res.message ?? '上传失败');
      }
    } catch {
      message.error('图片上传失败，可改用下方链接输入');
    } finally {
      setUploading(false);
    }
  }, []);

  const handleSubmit = async () => {
    if (!product || !sku.trim()) { message.warning('SKU 不能为空'); return; }
    setSubmitting(true);
    try {
      const { data: res } = await request.put<{ code: number; message: string; data?: { count: number } }>('/products/inventory-batch-update', {
        items: [{
          id: product.id,
          sku: sku.trim(),
          chineseName: cnName.trim() || null,
          imageUrl: imgUrl.trim() || null,
          purchaseUrl: purchaseUrl.trim() || null,
          purchasePrice,
          length: dimLen,
          width: dimWid,
          height: dimHei,
          actualWeight: weight,
        }],
      });
      if (res.code === 200) { message.success('保存成功'); onDone(); }
      else { message.error(res.message); }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg ?? '保存失败');
    } finally { setSubmitting(false); }
  };

  const dimSep = <span style={{ color: '#c0c0c0', fontSize: 11, fontWeight: 300, userSelect: 'none' }}>×</span>;

  if (!product) return null;

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <EditOutlined style={{ color: '#1890ff', fontSize: 18 }} />
          <span style={{ fontWeight: 600, fontSize: 16 }}>✏️ 编辑 SKU</span>
          <Tag color="blue">{product.sku ?? '—'}</Tag>
        </div>
      }
      open={open} onCancel={onCancel} destroyOnClose maskClosable={false} width={620}
      footer={[
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button key="ok" type="primary" loading={submitting} onClick={handleSubmit} disabled={!sku.trim()}>
          保存
        </Button>,
      ]}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>
        <div>
          <div style={cLabelStyle}>SKU <span style={{ color: '#ff4d4f' }}>*</span></div>
          <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="输入 SKU 编码" />
        </div>
        <div>
          <div style={cLabelStyle}>中文名</div>
          <Input value={cnName} onChange={(e) => setCnName(e.target.value)} placeholder="输入中文名" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={cLabelStyle}>采购链接</div>
          <Input value={purchaseUrl} onChange={(e) => setPurchaseUrl(e.target.value)} placeholder="1688 或其它采购链接" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={cLabelStyle}>产品图片</div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Upload
              accept="image/*"
              maxCount={1}
              listType="picture-card"
              showUploadList={{ showPreviewIcon: false }}
              customRequest={({ file }) => handleUpload(file as File)}
              beforeUpload={() => false}
              disabled={uploading}
            >
              {uploading ? '上传中...' : <div><UploadOutlined /><div>上传图片</div></div>}
            </Upload>
            <div style={{ flex: 1, minWidth: 200 }}>
              <Input value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} placeholder="或粘贴图片 URL" addonBefore="链接" />
            </div>
          </div>
        </div>
        <div>
          <div style={cLabelStyle}>成本/采购价 (¥)</div>
          <InputNumber value={purchasePrice} onChange={setPurchasePrice} min={0} precision={2} prefix="¥" style={{ width: '100%' }} placeholder="0.00" />
        </div>
        <div>
          <div style={cLabelStyle}>重量 (kg)</div>
          <InputNumber value={weight} onChange={setWeight} min={0} precision={2} suffix="kg" style={{ width: '100%' }} placeholder="0.00" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={cLabelStyle}>尺寸 (cm) 长×宽×高</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <InputNumber value={dimLen} onChange={setDimLen} min={0} precision={1} placeholder="长" style={{ flex: 1 }} />
            {dimSep}
            <InputNumber value={dimWid} onChange={setDimWid} min={0} precision={1} placeholder="宽" style={{ flex: 1 }} />
            {dimSep}
            <InputNumber value={dimHei} onChange={setDimHei} min={0} precision={1} placeholder="高" style={{ flex: 1 }} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

const cLabelStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 500, color: '#334155', marginBottom: 6,
};

// ─── 批量创建 SKU 弹窗 ──────────────────────────────────────────

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

interface BatchCreateRow {
  key: string;
  sku: string;
  chineseName: string;
  purchaseUrl: string;
  purchasePrice: number | null;
  imageUrl: string;
  length: number | null;
  width: number | null;
  height: number | null;
  actualWeight: number | null;
  _errors?: string[];
}

function emptyRow(): BatchCreateRow {
  return { key: crypto.randomUUID(), sku: '', chineseName: '', purchaseUrl: '', purchasePrice: null, imageUrl: '', length: null, width: null, height: null, actualWeight: null };
}

function validateRows(rows: BatchCreateRow[]): BatchCreateRow[] {
  const skuSeen = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const s = r.sku.trim().toUpperCase();
    if (s) { skuSeen.set(s, [...(skuSeen.get(s) ?? []), i]); }
  });

  return rows.map((r) => {
    const errs: string[] = [];
    if (!r.sku.trim()) errs.push('SKU 不能为空');
    const s = r.sku.trim().toUpperCase();
    if (s && (skuSeen.get(s)?.length ?? 0) > 1) errs.push('SKU 重复');
    return { ...r, _errors: errs.length > 0 ? errs : undefined };
  });
}

const TEMPLATE_HEADERS = ['SKU', '中文名', '采购链接', '采购价(¥)', '图片URL', '实重(kg)', '长(cm)', '宽(cm)', '高(cm)'];

function downloadExcelTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    TEMPLATE_HEADERS,
    ['SAMPLE-001', '示例产品A', 'https://detail.1688.com/offer/123456789.html', '25.50', '', '0.35', '20', '15', '10'],
    ['SAMPLE-002', '示例产品B', '', '18.00', '', '0.50', '30', '20', '15'],
  ]);
  ws['!cols'] = [{ wch: 18 }, { wch: 20 }, { wch: 42 }, { wch: 12 }, { wch: 42 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'SKU模板');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), 'SKU批量导入模板.xlsx');
}

function parseExcelFile(file: File): Promise<BatchCreateRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
        if (jsonRows.length > MAX_EXCEL_IMPORT_ROWS) {
          reject(new ExcelRowLimitExceededError());
          return;
        }

        const mapped: BatchCreateRow[] = jsonRows.map((r) => {
          const get = (keys: string[]) => {
            for (const k of keys) { const v = r[k]; if (v !== undefined && v !== '') return String(v).trim(); }
            return '';
          };
          const getNum = (keys: string[]) => {
            const s = get(keys);
            if (!s) return null;
            const n = parseFloat(s);
            return isNaN(n) ? null : n;
          };
          return {
            key: crypto.randomUUID(),
            sku:           get(['SKU', 'sku', 'Sku']),
            chineseName:   get(['中文名', '产品名', '名称', 'chineseName', 'name']),
            purchaseUrl:   get(['采购链接', '采购链接(1688)', 'purchaseUrl', 'url', '链接']),
            purchasePrice: getNum(['采购价(¥)', '采购价', '价格', 'purchasePrice', 'price']),
            imageUrl:      get(['图片URL', '图片链接', '图片', 'imageUrl', 'image']),
            actualWeight:  getNum(['实重(kg)', '实重', '重量', 'actualWeight', 'weight']),
            length:        getNum(['长(cm)', '长', 'length']),
            width:         getNum(['宽(cm)', '宽', 'width']),
            height:        getNum(['高(cm)', '高', 'height']),
          };
        }).filter((r) => r.sku || r.chineseName || r.purchaseUrl);

        resolve(mapped);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

interface BatchCreateSKUModalProps {
  open: boolean;
  onCancel: () => void;
  onDone: () => void;
}

function BatchCreateSKUModal({ open, onCancel, onDone }: BatchCreateSKUModalProps) {
  const [rows, setRows]           = useState<BatchCreateRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setRows([emptyRow(), emptyRow(), emptyRow()]);
  }, [open]);

  const updateRow = useCallback(<K extends keyof BatchCreateRow>(idx: number, key: K, val: BatchCreateRow[K]) => {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [key]: val } : r));
  }, []);

  const addRow = useCallback(() => setRows((prev) => [...prev, emptyRow()]), []);

  const removeRow = useCallback((idx: number) => {
    setRows((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx));
  }, []);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const parsed = await parseExcelFile(file);
      if (parsed.length === 0) { message.warning('Excel 中没有有效数据'); return; }
      setRows(validateRows(parsed));
      message.success(`已解析 ${parsed.length} 条数据`);
    } catch (err) {
      if (err instanceof ExcelRowLimitExceededError) {
        Modal.error({ title: '行数超限', content: err.message });
      } else {
        message.error('Excel 解析失败，请检查文件格式');
      }
    }
  }, []);

  const handleSubmit = async () => {
    const validated = validateRows(rows);
    setRows(validated);
    const hasError = validated.some((r) => r._errors && r._errors.length > 0);
    if (hasError) { message.warning('请修正标红的行再提交'); return; }

    const valid = validated.filter((r) => r.sku.trim());
    if (valid.length === 0) { message.warning('请至少填写一个 SKU'); return; }
    setSubmitting(true);
    try {
      const items = valid.map((r) => {
        const item: Record<string, unknown> = { sku: r.sku.trim() };
        mergeDefinedPayloadFields(item, {
          chineseName: r.chineseName,
          purchaseUrl: r.purchaseUrl,
          imageUrl: r.imageUrl,
          purchasePrice: r.purchasePrice,
          length: r.length,
          width: r.width,
          height: r.height,
          actualWeight: r.actualWeight,
        });
        return item;
      });
      const { data: res } = await request.post<{ code: number; message: string; data: { count: number; errors: string[] } }>(
        '/products/inventory-batch-create', { items },
      );
      if (res.code === 200) { message.success(res.message); onDone(); }
      else { message.error(res.message); }
    } catch { message.error('批量创建失败'); }
    finally { setSubmitting(false); }
  };

  const dimSep = <span style={{ color: '#c0c0c0', fontSize: 11, fontWeight: 300, userSelect: 'none', flexShrink: 0 }}>×</span>;

  const validCount = rows.filter((r) => r.sku.trim()).length;
  const errorCount = rows.filter((r) => r._errors && r._errors.length > 0).length;

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AppstoreAddOutlined style={{ color: '#52c41a', fontSize: 18 }} />
          <span style={{ fontWeight: 600, fontSize: 16 }}>批量创建 SKU</span>
          <Tag color="green" bordered={false} style={{ fontWeight: 600, fontSize: 13, borderRadius: 6 }}>{validCount} 条有效</Tag>
          {errorCount > 0 && <Tag color="red" bordered={false} style={{ fontWeight: 600, fontSize: 13, borderRadius: 6 }}>{errorCount} 条异常</Tag>}
        </div>
      }
      open={open} onCancel={onCancel} width="92%" style={{ maxWidth: 1400, top: 30 }}
      destroyOnClose maskClosable={false}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
          <Button icon={<PlusOutlined />} onClick={addRow}>添加一行</Button>
          <Space size={12}>
            <Button onClick={onCancel} size="large">取消</Button>
            <Button type="primary" loading={submitting} onClick={handleSubmit} size="large"
              style={{ minWidth: 120, boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}
            >
              确认创建 ({validCount})
            </Button>
          </Space>
        </div>
      }
    >
      <input type="file" ref={fileInputRef} accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileUpload} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: '#8c8c8c' }}>
          手动填写或通过 Excel 批量导入。SKU 为必填字段。
        </div>
        <Space>
          <Button icon={<ExportOutlined />} onClick={downloadExcelTemplate}>
            下载 Excel 模板
          </Button>
          <Button type="primary" ghost icon={<PlusOutlined />} onClick={() => fileInputRef.current?.click()}>
            上传 Excel 数据
          </Button>
        </Space>
      </div>

      <div style={{ maxHeight: 480, overflowY: 'auto', border: '1px solid #e8e8e8', borderRadius: 10, background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#1e293b', position: 'sticky', top: 0, zIndex: 1 }}>
              <th style={{ ...bcthStyle, width: 36, textAlign: 'center', borderRadius: '10px 0 0 0' }}>#</th>
              <th style={{ ...bcthStyle, width: 140 }}>SKU *</th>
              <th style={{ ...bcthStyle, width: 140 }}>中文名</th>
              <th style={{ ...bcthStyle, width: 220 }}>采购链接</th>
              <th style={{ ...bcthStyle, width: 90 }}>采购价 (¥)</th>
              <th style={{ ...bcthStyle, width: 180 }}>尺寸 (cm)</th>
              <th style={{ ...bcthStyle, width: 80 }}>实重 (kg)</th>
              <th style={{ ...bcthStyle, width: 42, borderRadius: '0 10px 0 0', textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const hasErr = row._errors && row._errors.length > 0;
              return (
                <tr key={row.key}
                  style={{ borderBottom: '1px solid #f0f0f0', transition: 'background 0.15s', background: hasErr ? '#fff2f0' : undefined }}
                  onMouseEnter={(e) => { if (!hasErr) e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = hasErr ? '#fff2f0' : ''; }}
                >
                  <td style={{ ...bctdStyle, textAlign: 'center', color: hasErr ? '#ff4d4f' : '#8c8c8c', fontWeight: 600 }}>
                    {hasErr ? (
                      <Tooltip title={row._errors!.join('、')}><span style={{ cursor: 'help' }}>{idx + 1}</span></Tooltip>
                    ) : idx + 1}
                  </td>
                  <td style={bctdStyle}>
                    <Input size="middle" value={row.sku} onChange={(e) => updateRow(idx, 'sku', e.target.value)} placeholder="必填"
                      status={row._errors?.some((e) => e.includes('SKU')) ? 'error' : undefined}
                      style={{ borderRadius: 6 }} />
                  </td>
                  <td style={bctdStyle}>
                    <Input size="middle" value={row.chineseName} onChange={(e) => updateRow(idx, 'chineseName', e.target.value)} placeholder="中文名" style={{ borderRadius: 6 }} />
                  </td>
                  <td style={bctdStyle}>
                    <Input size="middle" value={row.purchaseUrl} onChange={(e) => updateRow(idx, 'purchaseUrl', e.target.value)} placeholder="1688 链接" style={{ borderRadius: 6 }} />
                  </td>
                  <td style={bctdStyle}>
                    <InputNumber size="middle" value={row.purchasePrice} onChange={(v) => updateRow(idx, 'purchasePrice', v)} min={0} precision={2} prefix="¥" style={{ width: '100%' }} />
                  </td>
                  <td style={bctdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <InputNumber size="middle" value={row.length} onChange={(v) => updateRow(idx, 'length', v)} placeholder="长" min={0} precision={1} style={{ width: 52 }} />
                      {dimSep}
                      <InputNumber size="middle" value={row.width} onChange={(v) => updateRow(idx, 'width', v)} placeholder="宽" min={0} precision={1} style={{ width: 52 }} />
                      {dimSep}
                      <InputNumber size="middle" value={row.height} onChange={(v) => updateRow(idx, 'height', v)} placeholder="高" min={0} precision={1} style={{ width: 52 }} />
                    </div>
                  </td>
                  <td style={bctdStyle}>
                    <InputNumber size="middle" value={row.actualWeight} onChange={(v) => updateRow(idx, 'actualWeight', v)} min={0} precision={2} suffix="kg" style={{ width: '100%' }} />
                  </td>
                  <td style={{ ...bctdStyle, textAlign: 'center' }}>
                    <Button type="text" size="small" danger onClick={() => removeRow(idx)} disabled={rows.length <= 1} style={{ fontSize: 16, padding: '0 4px' }}>×</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

const bcthStyle: React.CSSProperties = {
  padding: '12px 10px', textAlign: 'left', fontSize: 12,
  color: '#e2e8f0', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase',
  whiteSpace: 'nowrap',
};
const bctdStyle: React.CSSProperties = {
  padding: '8px 10px', verticalAlign: 'middle',
};

// ─── 批量修改库存弹窗 ──────────────────────────────────────────
interface AdjustRow {
  id:         number;
  sku:        string;
  chineseName: string;
  imageUrl:   string | null;
  currentStock: number;
  newStock:   number;
  remark:     string;
}

interface BatchAdjustInventoryModalProps {
  open:     boolean;
  rows:     InventoryProduct[];
  onCancel: () => void;
  onDone:   () => void;
}

interface WarehouseListItem {
  id:     number;
  name:   string;
  status: 'ACTIVE' | 'DISABLED';
}

function BatchAdjustInventoryModal({ open, rows, onCancel, onDone }: BatchAdjustInventoryModalProps) {
  const [form] = Form.useForm<{ warehouseId: number }>();
  const [editRows,   setEditRows]   = useState<AdjustRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [warehouseLoading, setWarehouseLoading] = useState(false);
  const [warehouseOptions, setWarehouseOptions] = useState<{ label: string; value: number }[]>([]);

  // 每次打开时，用当前库存初始化 newStock，并拉取可用仓库
  useEffect(() => {
    if (open) {
      form.resetFields();
      setEditRows(rows.map((r) => ({
        id:           r.id,
        sku:          r.sku ?? '-',
        chineseName:  r.chineseName ?? '-',
        imageUrl:     r.imageUrl,
        currentStock: r.stockActual ?? 0,
        newStock:     r.stockActual ?? 0,
        remark:       '',
      })));
      setWarehouseLoading(true);
      request
        .get<{ code: number; data?: WarehouseListItem[]; message?: string }>('/warehouses')
        .then(({ data: res }) => {
          if (res.code === 200) {
            const list = Array.isArray(res.data) ? res.data : [];
            const active = list.filter((w) => w.status === 'ACTIVE');
            setWarehouseOptions(active.map((w) => ({ label: w.name, value: w.id })));
          } else {
            message.error(res.message || '加载仓库列表失败');
            setWarehouseOptions([]);
          }
        })
        .catch(() => {
          message.error('加载仓库列表失败，请稍后重试');
          setWarehouseOptions([]);
        })
        .finally(() => setWarehouseLoading(false));
    }
  }, [open, rows, form]);

  const updateRow = useCallback((id: number, field: 'newStock' | 'remark', value: number | string | null) => {
    setEditRows((prev) =>
      prev.map((r) => r.id === id ? { ...r, [field]: value ?? (field === 'newStock' ? 0 : '') } : r),
    );
  }, []);

  const handleConfirm = useCallback(async () => {
    try {
      await form.validateFields();
    } catch {
      return;
    }
    const warehouseId = form.getFieldValue('warehouseId') as number;
    if (warehouseId == null) {
      message.warning('请选择目标仓库');
      return;
    }
    // 只提交发生变化的行
    const changed = editRows.filter((r) => r.newStock !== r.currentStock || r.remark.trim() !== '');
    if (changed.length === 0) {
      message.info('没有检测到库存变化，无需提交');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        warehouseId,
        items: changed.map((r) => ({
          // 后端契约：产品主键必须为 productId（不可误用 skuId）
          productId: r.id,
          newStock:  r.newStock,
          remark:    r.remark.trim() || undefined,
        })),
      };
      const { data: res } = await request.post<{ code: number; message: string }>(
        '/inventory/batch-adjust',
        payload,
      );
      if (res.code === 200) {
        message.success(res.message || `已成功调整 ${changed.length} 个 SKU 的库存`);
        onDone();
      } else {
        message.error(res.message || '提交失败，请重试');
      }
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data as { message?: string } | undefined)?.message
        : undefined;
      message.error(msg || '提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }, [editRows, form, onDone]);

  const changedCount = editRows.filter((r) => r.newStock !== r.currentStock).length;

  const columns = [
    {
      title: '图片',
      key: 'image',
      width: 64,
      align: 'center' as const,
      render: (_: unknown, r: AdjustRow) => r.imageUrl ? (
        <img
          src={r.imageUrl}
          referrerPolicy="no-referrer"
          style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid #f0f0f0' }}
        />
      ) : (
        <div style={{ width: 44, height: 44, background: '#f5f5f5', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#94a3b8' }}>无图</div>
      ),
    },
    {
      title: 'SKU / 中文名',
      key: 'name',
      render: (_: unknown, r: AdjustRow) => (
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{r.sku}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{r.chineseName}</div>
        </div>
      ),
    },
    {
      title: '当前库存',
      key: 'current',
      width: 90,
      align: 'center' as const,
      render: (_: unknown, r: AdjustRow) => (
        <span style={{ fontWeight: 600, color: '#475569', fontFeatureSettings: '"tnum"' }}>{r.currentStock}</span>
      ),
    },
    {
      title: '盘点后库存',
      key: 'newStock',
      width: 130,
      align: 'center' as const,
      render: (_: unknown, r: AdjustRow) => {
        const isDiff = r.newStock !== r.currentStock;
        return (
          <InputNumber
            value={r.newStock}
            min={0}
            precision={0}
            size="small"
            style={{
              width: 100,
              borderColor: isDiff ? '#f59e0b' : undefined,
              background: isDiff ? '#fffbeb' : undefined,
            }}
            onChange={(v) => updateRow(r.id, 'newStock', v)}
          />
        );
      },
    },
    {
      title: '备注',
      key: 'remark',
      render: (_: unknown, r: AdjustRow) => (
        <Input
          size="small"
          placeholder="变更原因（选填）"
          maxLength={100}
          value={r.remark}
          onChange={(e) => updateRow(r.id, 'remark', e.target.value)}
        />
      ),
    },
  ];

  return (
    <Modal
      title={
        <span>
          <EditOutlined style={{ color: '#f59e0b', marginRight: 8 }} />
          批量修改库存
          {changedCount > 0 && (
            <span style={{ marginLeft: 8, fontSize: 12, color: '#f59e0b', fontWeight: 400 }}>
              （已修改 {changedCount} 项）
            </span>
          )}
        </span>
      }
      open={open}
      onCancel={onCancel}
      width={780}
      okText="确认修改"
      cancelText="取消"
      confirmLoading={submitting}
      onOk={handleConfirm}
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginBottom: 12 }}>
        <Form.Item
          name="warehouseId"
          label="目标仓库"
          rules={[{ required: true, message: '请选择目标仓库' }]}
          style={{ marginBottom: 12 }}
        >
          <Select
            placeholder="请选择要调整库存的仓库"
            loading={warehouseLoading}
            options={warehouseOptions}
            showSearch
            optionFilterProp="label"
            allowClear={false}
          />
        </Form.Item>
      </Form>
      <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 13 }}>
        修改"盘点后库存"列的数值，库存发生变化的行将在确认后提交。橙色高亮表示已修改。
      </p>
      <Table
        size="small"
        rowKey="id"
        dataSource={editRows}
        columns={columns}
        pagination={false}
        scroll={{ y: 400 }}
        locale={{ emptyText: '无已选产品' }}
        rowClassName={(r) => r.newStock !== r.currentStock ? 'ant-table-row-highlighted' : ''}
      />
    </Modal>
  );
}
