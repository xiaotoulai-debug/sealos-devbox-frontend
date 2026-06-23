import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Table, Input, Button, Tag, Typography, Breadcrumb,
  Skeleton, Space, Image, Tooltip, message, Switch,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table/interface';
import type { SorterResult } from 'antd/es/table/interface';
import { ArrowLeftOutlined, ReloadOutlined, SearchOutlined, InboxOutlined } from '@ant-design/icons';
import request from '../lib/request';
import axios from 'axios';

const { Text, Title } = Typography;

// ─── 类型定义 ──────────────────────────────────────────────────────────────

interface InventoryItem {
  id:                number;
  sku:               string | null;
  title:             string | null;
  chineseName:       string | null;
  imageUrl:          string | null;
  physicalQuantity:  number | null;
  stockQuantity:     number | null;
  lockedQuantity:    number | null;
  inTransitQuantity: number | null;
  inTransitTotalValue: number | null;
  totalValue:        number | null;
  sales7d:           number | null;
  sales14d:          number | null;
  sales30d:          number | null;
  updatedAt:         string | null;
}

interface PaginationMeta {
  total:    number;
  page:     number;
  pageSize: number;
}

interface InventoryApiData {
  warehouseId?:   number;
  warehouseName?: string;
  pagination?:    PaginationMeta;
  total?:         number;
  list?:          unknown[];
  items?:         unknown[];
  data?:          unknown[];
}

interface ApiResp<T = unknown> {
  code:     number;
  message?: string;
  data:     T;
}

export interface WarehouseInventoryProps {
  warehouseId:   number;
  warehouseName: string;
  onBack:        () => void;
}

type SortOrder = 'asc' | 'desc' | null;

// ─── 辅助函数 ──────────────────────────────────────────────────────────────

/** 整数兜底：null/undefined → 0 */
function safeInt(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '0';
  return String(Number(v));
}

/** 金额兜底：null/undefined → '-' */
const rmbFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
function safeRMB(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '-';
  return `¥ ${rmbFmt.format(Number(v))}`;
}

/** 后端字段兼容：驼峰 / 下划线 两种命名方式均支持 */
function normalizeItem(raw: Record<string, unknown>): InventoryItem {
  const n = (key1: string, key2?: string) => {
    const v = raw[key1] ?? (key2 ? raw[key2] : undefined);
    return v != null ? Number(v) : null;
  };
  return {
    id:                Number(raw.id ?? 0),
    sku:               (raw.sku as string | null)               ?? null,
    title:             (raw.title as string | null)             ?? null,
    chineseName:       (raw.chineseName ?? raw.chinese_name) as string | null ?? null,
    imageUrl:          (raw.imageUrl ?? raw.image_url) as string | null ?? null,
    physicalQuantity:  n('physicalQuantity',  'physical_quantity'),
    stockQuantity:     n('stockQuantity',     'stock_quantity'),
    lockedQuantity:    n('lockedQuantity',    'locked_quantity'),
    inTransitQuantity: n('inTransitQuantity', 'in_transit_quantity'),
    inTransitTotalValue: n('inTransitTotalValue', 'in_transit_total_value'),
    totalValue:        n('totalValue',        'total_value'),
    sales7d:           n('sales7d',  'sales_7d')  ?? n('sales7',  'sales_7'),
    sales14d:          n('sales14d', 'sales_14d') ?? n('sales14', 'sales_14'),
    sales30d:          n('sales30d', 'sales_30d') ?? n('sales30', 'sales_30'),
    updatedAt:         (raw.updatedAt ?? raw.updated_at) as string | null ?? null,
  };
}

function apiErrMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as { message?: string } | undefined;
    if (typeof d?.message === 'string' && d.message.trim()) return d.message;
  }
  return fallback;
}

// ─── 骨架行（首次加载占位） ─────────────────────────────────────────────────

const SKELETON_ROWS = Array.from({ length: 12 }, (_, i) => ({ key: `skel-${i}` }));
const SKELETON_COLS: ColumnsType<{ key: string }> = [
  { title: '图片',         key: 'img',   width: 64,  render: () => <Skeleton.Image  active style={{ width: 44, height: 44 }} /> },
  { title: 'SKU',          key: 'sku',   width: 160, render: () => <Skeleton.Input active size="small" style={{ width: 120 }} /> },
  { title: '品名',         key: 'title', render:     () => <Skeleton.Input active size="small" style={{ width: '80%' }} /> },
  { title: '物理库存',     key: 'pq',    width: 100, render: () => <Skeleton.Input active size="small" style={{ width: 60 }} /> },
  { title: '可用库存',     key: 'sq',    width: 105, render: () => <Skeleton.Input active size="small" style={{ width: 60 }} /> },
  { title: '在途库存',     key: 'iq',    width: 100, render: () => <Skeleton.Input active size="small" style={{ width: 60 }} /> },
  { title: '在途总货值',   key: 'ivalue', width: 150, render: () => <Skeleton.Input active size="small" style={{ width: 90 }} /> },
  { title: '配货锁定',     key: 'lq',    width: 100, render: () => <Skeleton.Input active size="small" style={{ width: 60 }} /> },
  { title: '库存总货值',   key: 'value', width: 130, render: () => <Skeleton.Input active size="small" style={{ width: 90 }} /> },
  { title: '7日销量',      key: 's7',    width: 90,  render: () => <Skeleton.Input active size="small" style={{ width: 50 }} /> },
  { title: '14日销量',     key: 's14',   width: 90,  render: () => <Skeleton.Input active size="small" style={{ width: 50 }} /> },
  { title: '30日销量',     key: 's30',   width: 90,  render: () => <Skeleton.Input active size="small" style={{ width: 50 }} /> },
];

// ─── 主组件 ───────────────────────────────────────────────────────────────

export default function WarehouseInventory({ warehouseId, warehouseName, onBack }: WarehouseInventoryProps) {
  const [list,        setList]        = useState<InventoryItem[]>([]);
  const [total,       setTotal]       = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [firstLoad,   setFirstLoad]   = useState(true);   // 首次加载骨架屏标志
  const [page,        setPage]        = useState(1);
  const [pageSize,    setPageSize]    = useState(20);
  const [sortField,   setSortField]   = useState<string | null>(null);
  const [sortOrder,   setSortOrder]   = useState<SortOrder>(null);
  // rawKeyword 跟随用户输入实时更新，keyword 经 300ms 防抖后才触发请求
  const [rawKeyword,  setRawKeyword]  = useState('');
  const [keyword,     setKeyword]     = useState('');
  // 过滤开关：隐藏可用库存和在途库存均为 0 的行
  const [onlyActive,  setOnlyActive]  = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 300ms 搜索防抖 ────────────────────────────────────────────────
  const handleKeywordChange = useCallback((val: string) => {
    setRawKeyword(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setKeyword(val.trim());
      setPage(1);       // 搜索词变化时重置到第 1 页
    }, 300);
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // ── 数据请求 ──────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, pageSize };
      if (keyword) params.keyword  = keyword;
      if (onlyActive) params.onlyActive = 1;   // 后端用 1/0 更易接收（兼容布尔字符串解析）
      if (sortField && sortOrder) {
        params.sortBy = sortField;
        params.sortOrder = sortOrder;
      }
      const { data: res } = await request.get<ApiResp<InventoryApiData>>(
        `/warehouses/${warehouseId}/inventory`, { params },
      );
      if (res.code === 200) {
        const d = res.data ?? {};
        const rawList: unknown[] =
          Array.isArray(d.list)  ? d.list  :
          Array.isArray(d.items) ? d.items :
          Array.isArray(d.data)  ? d.data  : [];
        setList(rawList.map((r) => normalizeItem(r as Record<string, unknown>)));
        setTotal(d.pagination?.total ?? (typeof d.total === 'number' ? d.total : 0));
      } else {
        message.error(res.message || '加载库存明细失败');
      }
    } catch (err: unknown) {
      message.error(apiErrMsg(err, '网络异常，请稍后重试'));
    } finally {
      setLoading(false);
      setFirstLoad(false);
    }
  }, [warehouseId, page, pageSize, sortField, sortOrder, keyword, onlyActive]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Table onChange：统一处理分页 + 列排序 ─────────────────────────
  const handleTableChange = useCallback((
    pagination: TablePaginationConfig,
    _filters: Record<string, unknown>,
    sorter: SorterResult<InventoryItem> | SorterResult<InventoryItem>[],
  ) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    const newField = (s.field as string) ?? null;
    const newOrder: SortOrder =
      s.order === 'ascend'  ? 'asc'  :
      s.order === 'descend' ? 'desc' : null;

    // 切换排序字段时重置至第 1 页
    const newPage = newField !== sortField ? 1 : (pagination.current ?? 1);
    setPage(newPage);
    setPageSize(pagination.pageSize ?? 20);
    setSortField(newField);
    setSortOrder(newOrder);
  }, [sortField]);

  // ── 表格列定义 ────────────────────────────────────────────────────
  const columns: ColumnsType<InventoryItem> = [
    {
      title:  '图片',
      key:    'imageUrl',
      width:  64,
      fixed:  'left',
      render: (_: unknown, r: InventoryItem) => (
        <Image
          src={r.imageUrl ?? undefined}
          width={44}
          height={44}
          style={{ objectFit: 'cover', borderRadius: 4 }}
          fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44'%3E%3Crect width='44' height='44' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='10' fill='%23bfbfbf'%3E暂无%3C/text%3E%3C/svg%3E"
          preview={!!r.imageUrl}
        />
      ),
    },
    {
      title:     'SKU',
      dataIndex: 'sku',
      key:       'sku',
      width:     160,
      fixed:     'left',
      ellipsis:  true,
      render: (v: string | null) =>
        v
          ? <Text code style={{ fontSize: 12 }}>{v}</Text>
          : <Text type="secondary">-</Text>,
    },
    {
      title:  '品名',
      key:    'title',
      width:  280,
      ellipsis: true,
      render: (_: unknown, r: InventoryItem) => {
        const name = r.chineseName || r.title;
        return name ? (
          <Tooltip title={r.title ?? name}>
            <Text ellipsis style={{ display: 'block', maxWidth: 260, fontSize: 13 }}>{name}</Text>
          </Tooltip>
        ) : <Text type="secondary">-</Text>;
      },
    },
    {
      title:     '物理库存',
      dataIndex: 'physicalQuantity',
      key:       'physicalQuantity',
      width:     100,
      align:     'right',
      sorter:    true,
      sortDirections: ['descend', 'ascend'],
      render: (v: number | null) => (
        <Text style={{ fontFeatureSettings: '"tnum"', color: '#334155' }}>{safeInt(v)}</Text>
      ),
    },
    {
      title:     '可用库存',
      dataIndex: 'stockQuantity',
      key:       'stockQuantity',
      width:     105,
      align:     'right',
      sorter:    true,
      sortDirections: ['descend', 'ascend'],
      render: (v: number | null) => (
        <Text strong style={{ color: (v ?? 0) > 0 ? '#16a34a' : '#dc2626', fontFeatureSettings: '"tnum"' }}>
          {safeInt(v)}
        </Text>
      ),
    },
    {
      title:     '在途库存',
      dataIndex: 'inTransitQuantity',
      key:       'inTransitQuantity',
      width:     100,
      align:     'right',
      sorter:    true,
      sortDirections: ['descend', 'ascend'],
      render: (v: number | null) => (
        <Tag color="blue" style={{ fontFeatureSettings: '"tnum"', minWidth: 40, textAlign: 'center' }}>
          {safeInt(v)}
        </Tag>
      ),
    },
    {
      title:     '在途总货值 (RMB)',
      dataIndex: 'inTransitTotalValue',
      key:       'inTransitTotalValue',
      width:     150,
      align:     'right',
      sorter:    true,
      sortDirections: ['descend', 'ascend'],
      render: (v: number | null) => (
        <Text style={{ color: '#fa8c16', fontFeatureSettings: '"tnum"', fontWeight: 600 }}>
          {safeRMB(v)}
        </Text>
      ),
    },
    {
      title:     '配货锁定',
      dataIndex: 'lockedQuantity',
      key:       'lockedQuantity',
      width:     100,
      align:     'right',
      sorter:    true,
      sortDirections: ['descend', 'ascend'],
      render: (v: number | null) =>
        (v ?? 0) > 0
          ? <Tag color="orange" style={{ fontFeatureSettings: '"tnum"', minWidth: 40, textAlign: 'center' }}>{safeInt(v)}</Tag>
          : <Text type="secondary" style={{ fontFeatureSettings: '"tnum"' }}>0</Text>,
    },
    {
      title:     '库存总货值 (RMB)',
      dataIndex: 'totalValue',
      key:       'totalValue',
      width:     150,
      align:     'right',
      sorter:    true,
      sortDirections: ['descend', 'ascend'],
      render: (v: number | null) => (
        <Text style={{ color: '#1677ff', fontFeatureSettings: '"tnum"', fontWeight: 600 }}>
          {safeRMB(v)}
        </Text>
      ),
    },
    {
      title:     '7日销量',
      dataIndex: 'sales7d',
      key:       'sales7d',
      width:     90,
      align:     'right',
      sorter:    true,
      sortDirections: ['descend', 'ascend'],
      render: (v: number | null) => (
        <Text style={{ fontFeatureSettings: '"tnum"' }}>{safeInt(v)}</Text>
      ),
    },
    {
      title:     '14日销量',
      dataIndex: 'sales14d',
      key:       'sales14d',
      width:     95,
      align:     'right',
      sorter:    true,
      sortDirections: ['descend', 'ascend'],
      render: (v: number | null) => (
        <Text style={{ fontFeatureSettings: '"tnum"' }}>{safeInt(v)}</Text>
      ),
    },
    {
      title:     '30日销量',
      dataIndex: 'sales30d',
      key:       'sales30d',
      width:     95,
      align:     'right',
      sorter:    true,
      sortDirections: ['descend', 'ascend'],
      render: (v: number | null) => (
        <Text style={{ fontFeatureSettings: '"tnum"' }}>{safeInt(v)}</Text>
      ),
    },
    {
      title:  '最后更新',
      key:    'updatedAt',
      width:  155,
      render: (_: unknown, r: InventoryItem) =>
        r.updatedAt
          ? new Date(r.updatedAt).toLocaleString('zh-CN', { hour12: false })
          : <Text type="secondary">-</Text>,
    },
  ];

  // ── 渲染 ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* 面包屑导航 */}
      <div style={{ marginBottom: 12 }}>
        <Breadcrumb
          items={[
            {
              title: (
                <a onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <ArrowLeftOutlined style={{ fontSize: 12 }} />
                  仓库列表
                </a>
              ),
            },
            { title: warehouseName },
            { title: '库存明细' },
          ]}
        />
      </div>

      {/* 页面标题行 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <InboxOutlined style={{ fontSize: 20, color: '#1677ff' }} />
          <Title level={4} style={{ margin: 0 }}>
            {warehouseName}
            <Text type="secondary" style={{ fontSize: 14, fontWeight: 400, marginLeft: 8 }}>
              库存明细
            </Text>
          </Title>
          {!firstLoad && (
            <Text type="secondary" style={{ fontSize: 13, marginLeft: 4 }}>
              共 <Text strong>{total}</Text> 个 SKU
            </Text>
          )}
        </div>

        <Space size={12}>
          {/* 过滤开关 */}
          <Space size={6}>
            <Switch
              size="small"
              checked={onlyActive}
              disabled={loading}
              onChange={(checked) => {
                setOnlyActive(checked);
                setPage(1);   // 过滤条件变化时重置到第 1 页
              }}
            />
            <span style={{ fontSize: 13, color: onlyActive ? '#1677ff' : '#8c8c8c', userSelect: 'none' }}>
              隐藏 0 库存/在途
            </span>
          </Space>

          {/* 搜索框 — 防抖在 onChange 中处理，无需单独 Search 按钮 */}
          <Input
            value={rawKeyword}
            onChange={(e) => handleKeywordChange(e.target.value)}
            placeholder="搜索 SKU / 品名"
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            allowClear
            onClear={() => handleKeywordChange('')}
            style={{ width: 220 }}
            disabled={loading}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => { setPage(1); fetchData(); }}
            loading={loading}
          >
            刷新
          </Button>
        </Space>
      </div>

      {/* 骨架屏：仅首次加载时展示 */}
      {firstLoad && loading ? (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <Table
            rowKey="key"
            dataSource={SKELETON_ROWS}
            columns={SKELETON_COLS}
            pagination={false}
            scroll={{ x: 'max-content' }}
            size="middle"
            showSorterTooltip={false}
          />
        </div>
      ) : (
        /* 正式数据表格：后续刷新使用 loading overlay */
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <Table<InventoryItem>
            rowKey="id"
            dataSource={list}
            columns={columns}
            loading={loading}
            onChange={handleTableChange as Parameters<typeof Table<InventoryItem>['onChange']>[0]}
            pagination={{
              current:        page,
              pageSize:       pageSize,
              total:          total,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: (t, range) => `第 ${range[0]}–${range[1]} 条，共 ${t} 条`,
              // 请求期间禁用分页器交互，防止重复并发
              disabled: loading,
            }}
            scroll={{ y: 'calc(100vh - 310px)', x: 'max-content' }}
            locale={{
              emptyText: keyword
                ? `未找到包含「${keyword}」的 SKU`
                : onlyActive
                  ? '当前仓库无库存/在途数量 > 0 的 SKU'
                  : '该仓库暂无库存记录',
            }}
            size="middle"
            showSorterTooltip={{ title: '点击排序' }}
          />
        </div>
      )}
    </div>
  );
}
