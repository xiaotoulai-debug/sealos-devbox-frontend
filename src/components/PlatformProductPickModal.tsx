import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Select, Spin, Typography, message } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import request from '../lib/request';
import { formatShopSiteLabel, type ShopBrief } from '../types/purchasePlanFbe';

const { Text } = Typography;

interface StoreProductOption {
  id: number;
  sku?: string | null;
  title?: string | null;
  name?: string | null;
  product_name?: string | null;
  productName?: string | null;
  local_chinese_name?: string | null;
  localChineseName?: string | null;
  product_url?: string | null;
  productUrl?: string | null;
  pnk?: string | null;
  part_number_key?: string | null;
  mapped_inventory_sku?: string | null;
  inventorySku?: string | null;
  inventory_sku?: string | null;
}

export interface PlatformProductPickResult {
  storeProductId: number;
  title: string;
  platformUrl: string | null;
  sku: string | null;
}

interface PlatformProductPickModalProps {
  open: boolean;
  shop: ShopBrief | null;
  inventoryProductId: number;
  inventorySku?: string | null;
  onCancel: () => void;
  onLinked: (result: PlatformProductPickResult) => void;
}

function pickTitle(p: StoreProductOption): string {
  return String(
    p.local_chinese_name ?? p.localChineseName
    ?? p.title ?? p.name ?? p.product_name ?? p.productName ?? p.sku ?? '-',
  ).trim();
}

function pickPlatformUrl(p: StoreProductOption): string | null {
  const url = p.product_url ?? p.productUrl;
  return url && String(url).trim() ? String(url).trim() : null;
}

function pickPnk(p: StoreProductOption): string {
  return String(p.pnk ?? p.part_number_key ?? '').trim();
}

function buildSearchPlain(p: StoreProductOption): string {
  const sku = String(p.sku ?? '').trim();
  const cn = String(p.local_chinese_name ?? p.localChineseName ?? '').trim();
  const name = String(p.title ?? p.name ?? p.product_name ?? p.productName ?? '').trim();
  const url = pickPlatformUrl(p) ?? '';
  return [sku, cn, name, url].filter(Boolean).join(' ').toLowerCase();
}

export default function PlatformProductPickModal({
  open,
  shop,
  inventoryProductId,
  inventorySku,
  onCancel,
  onLinked,
}: PlatformProductPickModalProps) {
  const [options, setOptions] = useState<StoreProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shopLabel = useMemo(() => formatShopSiteLabel(shop), [shop]);

  const fetchProducts = useCallback(async (keyword: string) => {
    if (!shop?.id) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const { data: res } = await request.get<{
        code: number;
        data?: StoreProductOption[] | { list?: StoreProductOption[] };
        message?: string;
      }>('/store-products', {
        params: {
          shopId: shop.id,
          page: 1,
          pageSize: 50,
          ...(keyword.trim() ? { keyword: keyword.trim(), search: keyword.trim() } : {}),
        },
      });
      if (res.code !== 200) {
        setOptions([]);
        message.warning(res.message || '加载平台产品失败');
        return;
      }
      const raw = res.data;
      const list = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object' && Array.isArray(raw.list)
          ? raw.list
          : [];
      setOptions(list);
    } catch {
      setOptions([]);
      message.error('加载平台产品失败，请检查网络');
    } finally {
      setLoading(false);
    }
  }, [shop?.id]);

  useEffect(() => {
    if (!open) {
      setSelectedId(undefined);
      setOptions([]);
      return;
    }
    fetchProducts('');
  }, [open, fetchProducts]);

  const onSearch = useCallback((kw: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => fetchProducts(kw), 350);
  }, [fetchProducts]);

  const handleOk = async () => {
    if (!shop?.id || selectedId == null) {
      message.warning('请选择平台产品');
      return;
    }
    const picked = options.find((o) => o.id === selectedId);
    if (!picked) {
      message.warning('所选平台产品无效，请重新选择');
      return;
    }
    const pnk = pickPnk(picked);
    if (!pnk) {
      message.error('该平台产品缺少 PNK，无法关联');
      return;
    }
    setSubmitting(true);
    try {
      const { data: res } = await request.post<{ code: number; message?: string }>('/store-products/map', {
        pnk,
        shopId: shop.id,
        inventorySkuId: inventoryProductId,
        inventorySku: inventorySku?.trim() || undefined,
      });
      if (res.code !== 200) {
        message.error(res.message || '关联失败，请稍后重试');
        return;
      }
      onLinked({
        storeProductId: picked.id,
        title: pickTitle(picked),
        platformUrl: pickPlatformUrl(picked),
        sku: picked.sku ?? null,
      });
      message.success(res.message || '平台产品关联成功');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg || '关联失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="关联平台产品"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={submitting}
      okText="确认关联"
      cancelText="取消"
      width={560}
      destroyOnClose
      maskClosable={false}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
        当前店铺/站点：{shopLabel}
      </Text>
      <Select
        showSearch
        allowClear
        placeholder="搜索 SKU / 中文名 / 平台链接"
        value={selectedId}
        onChange={setSelectedId}
        onSearch={onSearch}
        filterOption={(input, option) => {
          const p = options.find((o) => o.id === option?.value);
          if (!p) return false;
          const kw = input.trim().toLowerCase();
          if (!kw) return true;
          return buildSearchPlain(p).includes(kw);
        }}
        loading={loading}
        notFoundContent={loading ? <Spin size="small" /> : '无匹配平台产品'}
        style={{ width: '100%' }}
        options={options.map((p) => ({
          value: p.id,
          label: (
            <div style={{ lineHeight: 1.45 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{pickTitle(p)}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                SKU: {p.sku ?? '—'}
                {pickPlatformUrl(p) ? (
                  <>
                    {' · '}
                    <LinkOutlined style={{ marginRight: 2 }} />
                    平台链接
                  </>
                ) : null}
              </div>
            </div>
          ),
        }))}
      />
    </Modal>
  );
}
