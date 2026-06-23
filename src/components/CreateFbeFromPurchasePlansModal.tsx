import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Form, Image, Input, Modal, Select, Space, Table, Tag, Typography, message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ExclamationCircleFilled, LinkOutlined, SendOutlined } from '@ant-design/icons';
import request from '../lib/request';
import PlatformProductPickModal from './PlatformProductPickModal';
import {
  formatShopSiteLabel,
  formatSiteLabel,
  getFbeBatchBlockReason,
  resolveShopId,
  toPurchasePlanFbeRows,
  type PurchasePlanFbeRow,
  type PurchasingPlanProduct,
  type ShopBrief,
} from '../types/purchasePlanFbe';

const { Text } = Typography;

interface WarehouseOption {
  id: number;
  name: string;
  status?: string;
}

interface CreateFbeFromPurchasePlansModalProps {
  open: boolean;
  products: PurchasingPlanProduct[];
  onCancel: () => void;
  onSuccess: (shipmentId?: number) => void;
}

function extractShipmentId(data: unknown): number | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const obj = data as Record<string, unknown>;
  const raw = obj.id ?? obj.shipmentId ?? obj.fbeShipmentId;
  if (raw == null || Number.isNaN(Number(raw))) return undefined;
  return Number(raw);
}

export default function CreateFbeFromPurchasePlansModal({
  open,
  products,
  onCancel,
  onSuccess,
}: CreateFbeFromPurchasePlansModalProps) {
  const [rows, setRows] = useState<PurchasePlanFbeRow[]>([]);
  const [shop, setShop] = useState<ShopBrief | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [warehouseId, setWarehouseId] = useState<number | undefined>(undefined);
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [linkTarget, setLinkTarget] = useState<PurchasePlanFbeRow | null>(null);

  const blockReason = useMemo(() => getFbeBatchBlockReason(products), [products]);
  const shopId = useMemo(() => (products.length > 0 ? resolveShopId(products[0]) : undefined), [products]);

  const allLinked = useMemo(
    () => rows.length > 0 && rows.every((r) => r.storeProductId != null),
    [rows],
  );

  const alreadyLinkedCount = useMemo(
    () => rows.filter((r) => r.storeProductId != null).length,
    [rows],
  );

  useEffect(() => {
    if (!open) {
      setRows([]);
      setShop(null);
      setWarehouses([]);
      setWarehouseId(undefined);
      setRemark('');
      setLinkTarget(null);
      return;
    }
    setRows(toPurchasePlanFbeRows(products));

    if (shopId == null) return;
    request.get<{ code: number; data?: ShopBrief[] | { list?: ShopBrief[] } }>('/shops')
      .then(({ data: res }) => {
        if (res.code !== 200) return;
        const raw = res.data;
        const list = Array.isArray(raw)
          ? raw
          : raw && typeof raw === 'object' && Array.isArray(raw.list)
            ? raw.list
            : [];
        const matched = list.find((s) => s.id === shopId) ?? null;
        setShop(matched);
      })
      .catch(() => setShop(null));

    request.get<{ code: number; data?: WarehouseOption[] | { list?: WarehouseOption[] } }>('/warehouses')
      .then(({ data: res }) => {
        if (res.code !== 200) return;
        const raw = res.data;
        const list = Array.isArray(raw)
          ? raw
          : raw && typeof raw === 'object' && Array.isArray(raw.list)
            ? raw.list
            : [];
        const active = list.filter((w) => w.status !== 'INACTIVE');
        setWarehouses(active);
        if (active.length === 1) setWarehouseId(active[0].id);
      })
      .catch(() => setWarehouses([]));
  }, [open, products, shopId]);

  const handleLinked = useCallback((productId: number, result: {
    storeProductId: number;
    title: string;
    platformUrl: string | null;
    sku: string | null;
  }) => {
    setRows((prev) => prev.map((row) => (
      row.product.id === productId
        ? {
            ...row,
            storeProductId: result.storeProductId,
            storeProductTitle: result.title,
            platformProductUrl: result.platformUrl,
            storeProductSku: result.sku,
          }
        : row
    )));
    setLinkTarget(null);
  }, []);

  const handleSubmit = async () => {
    if (blockReason) {
      message.error(blockReason);
      return;
    }
    if (!allLinked) {
      message.warning('请先为所有产品关联平台产品');
      return;
    }
    if (!warehouseId) {
      message.warning('请选择入库/发货仓库');
      return;
    }
    if (shopId == null) {
      message.error('缺少店铺信息');
      return;
    }

    Modal.confirm({
      title: '确认创建 FBE 发货单',
      icon: <ExclamationCircleFilled style={{ color: '#2563eb' }} />,
      content: (
        <div>
          <p style={{ marginBottom: 8 }}>
            将为 <strong>{rows.length}</strong> 个采购计划产品创建 <strong>1</strong> 张 FBE 发货单。
          </p>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
            店铺/站点：{formatShopSiteLabel(shop)}
          </p>
        </div>
      ),
      okText: '确认创建',
      cancelText: '取消',
      onOk: async () => {
        setSubmitting(true);
        try {
          const payload = {
            shopId,
            warehouseId,
            remark: remark.trim() || undefined,
            items: rows.map((r) => ({
              productId: r.product.id,
              purchasePlanProductId: r.product.id,
              storeProductId: r.storeProductId,
              quantity: r.product.purchaseQuantity ?? 1,
            })),
          };
          const { data: res } = await request.post<{
            code: number;
            message?: string;
            data?: unknown;
          }>('/fbe-shipments/from-purchase-plans', payload);
          if (res.code !== 200) {
            message.error(res.message || 'FBE 发货单创建失败');
            return;
          }
          message.success('FBE 发货单创建成功');
          onSuccess(extractShipmentId(res.data));
        } catch (err: unknown) {
          const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
          message.error(msg || 'FBE 发货单创建失败，请稍后重试');
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  const columns = useMemo<ColumnsType<PurchasePlanFbeRow>>(() => [
    {
      title: '图片',
      key: 'img',
      width: 64,
      render: (_: unknown, r) => (
        <Image
          src={r.product.imageUrl ?? undefined}
          width={44}
          height={44}
          referrerPolicy="no-referrer"
          style={{ objectFit: 'cover', borderRadius: 6, border: '1px solid #f0f0f0' }}
          preview={false}
          fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44'%3E%3Crect fill='%23f5f5f5' width='44' height='44'/%3E%3C/svg%3E"
        />
      ),
    },
    {
      title: 'SKU',
      key: 'sku',
      width: 120,
      render: (_: unknown, r) => (
        <Text code style={{ fontSize: 12 }}>{r.product.sku ?? '—'}</Text>
      ),
    },
    {
      title: '中文名',
      dataIndex: ['product', 'chineseName'],
      ellipsis: true,
      width: 140,
    },
    {
      title: '采购数量',
      key: 'qty',
      width: 90,
      align: 'center',
      render: (_: unknown, r) => <Text strong>{r.product.purchaseQuantity ?? '—'}</Text>,
    },
    {
      title: '采购价',
      key: 'price',
      width: 90,
      align: 'right',
      render: (_: unknown, r) => (
        r.product.purchasePrice != null
          ? <Text style={{ color: '#d4380d', fontWeight: 600 }}>¥{r.product.purchasePrice.toFixed(2)}</Text>
          : <Text type="secondary">—</Text>
      ),
    },
    {
      title: '关联平台产品 / 平台链接',
      key: 'platform',
      width: 240,
      render: (_: unknown, r) => {
        if (r.storeProductId == null) {
          return (
            <Space direction="vertical" size={4}>
              <Tag color="error" style={{ margin: 0 }}>未关联平台产品</Tag>
              <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setLinkTarget(r)}>
                关联产品
              </Button>
            </Space>
          );
        }
        return (
          <div style={{ minWidth: 0 }}>
            <Text ellipsis style={{ display: 'block', maxWidth: 220, fontSize: 12 }}>
              {r.storeProductTitle ?? `平台产品 #${r.storeProductId}`}
            </Text>
            {r.platformProductUrl ? (
              <Button
                type="link"
                size="small"
                icon={<LinkOutlined />}
                style={{ padding: 0, fontSize: 12 }}
                onClick={() => window.open(r.platformProductUrl!, '_blank', 'noreferrer,noopener')}
              >
                平台链接
              </Button>
            ) : (
              <Text type="secondary" style={{ fontSize: 11 }}>暂无平台链接</Text>
            )}
          </div>
        );
      },
    },
  ], []);

  return (
    <>
      <Modal
        title={<span><SendOutlined style={{ color: '#2563eb', marginRight: 8 }} />创建 FBE 发货单</span>}
        open={open}
        onCancel={onCancel}
        width={960}
        destroyOnClose
        maskClosable={false}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              已关联 {alreadyLinkedCount}/{rows.length}
            </Text>
            <Space>
              <Button onClick={onCancel}>取消</Button>
              <Button
                type="primary"
                loading={submitting}
                disabled={!allLinked || !warehouseId || !!blockReason}
                onClick={handleSubmit}
              >
                确认创建 FBE 发货单
              </Button>
            </Space>
          </div>
        }
        styles={{ body: { maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' } }}
      >
        {blockReason ? (
          <Alert type="error" showIcon message={blockReason} style={{ marginBottom: 12 }} />
        ) : null}

        <Form layout="vertical" style={{ marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item label="店铺" style={{ marginBottom: 8 }}>
              <Input value={shop?.shopName ?? '—'} disabled />
            </Form.Item>
            <Form.Item label="站点" style={{ marginBottom: 8 }}>
              <Input value={formatSiteLabel(shop?.region ?? shop?.site)} disabled />
            </Form.Item>
          </div>
          <Form.Item label="入库/发货仓库" required style={{ marginBottom: 8 }}>
            <Select
              placeholder="请选择仓库"
              value={warehouseId}
              onChange={setWarehouseId}
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item label="备注" style={{ marginBottom: 0 }}>
            <Input.TextArea
              rows={2}
              maxLength={500}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="选填"
            />
          </Form.Item>
        </Form>

        {!allLinked ? (
          <Alert
            type="warning"
            showIcon
            message="存在未关联平台产品的行，请先完成关联后再创建"
            style={{ marginBottom: 12 }}
          />
        ) : null}

        <Table
          rowKey={(r) => r.product.id}
          size="small"
          columns={columns}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 'max-content', y: 320 }}
        />
      </Modal>

      <PlatformProductPickModal
        open={linkTarget != null}
        shop={shop}
        inventoryProductId={linkTarget?.product.id ?? 0}
        inventorySku={linkTarget?.product.sku}
        onCancel={() => setLinkTarget(null)}
        onLinked={(result) => {
          if (linkTarget) handleLinked(linkTarget.product.id, result);
        }}
      />
    </>
  );
}
