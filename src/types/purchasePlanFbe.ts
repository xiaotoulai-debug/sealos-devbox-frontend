/** 采购计划产品（FBE 批量创建相关字段） */
export interface PurchasingPlanProduct {
  id: number;
  pnk: string;
  title: string;
  brand: string | null;
  price: number | null;
  imageUrl: string | null;
  purchasePrice: number | null;
  purchaseUrl: string | null;
  margin: number | null;
  sku: string | null;
  chineseName: string | null;
  purchaseQuantity: number | null;
  purchaseType: string | null;
  shopId?: number | null;
  shop_id?: number | null;
  shopName?: string | null;
  shop_name?: string | null;
  region?: string | null;
  site?: string | null;
  purchasePeriod: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  actualWeight: number | null;
  externalProductId: string | null;
  externalSkuId: string | null;
  externalSynced: boolean;
  externalOrderId: string | null;
  updatedAt: string;
  storeProductId?: number | null;
  store_product_id?: number | null;
  platformProductUrl?: string | null;
  platform_product_url?: string | null;
  productUrl?: string | null;
  product_url?: string | null;
  storeProductTitle?: string | null;
  store_product_title?: string | null;
  fbeShipmentId?: number | null;
  fbe_shipment_id?: number | null;
  fbeShipmentNo?: string | null;
  fbe_shipment_no?: string | null;
}

export interface ShopBrief {
  id: number;
  shopName: string;
  platform?: string | null;
  region?: string | null;
  site?: string | null;
}

export interface PurchasePlanFbeRow {
  product: PurchasingPlanProduct;
  storeProductId?: number;
  storeProductTitle?: string | null;
  platformProductUrl?: string | null;
  storeProductSku?: string | null;
}

const REGION_LABEL: Record<string, string> = {
  RO: '罗马尼亚 RO',
  BG: '保加利亚 BG',
  HU: '匈牙利 HU',
};

export function normalizePurchasingPlanProduct(raw: Record<string, unknown>): PurchasingPlanProduct {
  return {
    id: Number(raw.id),
    pnk: String(raw.pnk ?? ''),
    title: String(raw.title ?? ''),
    brand: (raw.brand ?? null) as string | null,
    price: raw.price != null ? Number(raw.price) : null,
    imageUrl: (raw.imageUrl ?? raw.image_url ?? null) as string | null,
    purchasePrice: raw.purchasePrice != null ? Number(raw.purchasePrice) : raw.purchase_price != null ? Number(raw.purchase_price) : null,
    purchaseUrl: (raw.purchaseUrl ?? raw.purchase_url ?? null) as string | null,
    margin: raw.margin != null ? Number(raw.margin) : null,
    sku: (raw.sku ?? null) as string | null,
    chineseName: (raw.chineseName ?? raw.chinese_name ?? null) as string | null,
    purchaseQuantity: raw.purchaseQuantity != null ? Number(raw.purchaseQuantity) : raw.purchase_quantity != null ? Number(raw.purchase_quantity) : null,
    purchaseType: (raw.purchaseType ?? raw.purchase_type ?? null) as string | null,
    shopId: raw.shopId != null ? Number(raw.shopId) : raw.shop_id != null ? Number(raw.shop_id) : null,
    shop_id: raw.shop_id != null ? Number(raw.shop_id) : raw.shopId != null ? Number(raw.shopId) : null,
    shopName: (raw.shopName ?? raw.shop_name ?? null) as string | null,
    shop_name: (raw.shop_name ?? raw.shopName ?? null) as string | null,
    region: (raw.region ?? raw.shopRegion ?? raw.shop_region ?? null) as string | null,
    site: (raw.site ?? raw.shopSite ?? raw.shop_site ?? null) as string | null,
    purchasePeriod: raw.purchasePeriod != null ? Number(raw.purchasePeriod) : null,
    length: raw.length != null ? Number(raw.length) : null,
    width: raw.width != null ? Number(raw.width) : null,
    height: raw.height != null ? Number(raw.height) : null,
    actualWeight: raw.actualWeight != null ? Number(raw.actualWeight) : null,
    externalProductId: (raw.externalProductId ?? raw.external_product_id ?? null) as string | null,
    externalSkuId: (raw.externalSkuId ?? raw.external_sku_id ?? null) as string | null,
    externalSynced: raw.externalSynced === true || raw.external_synced === true,
    externalOrderId: (raw.externalOrderId ?? raw.external_order_id ?? null) as string | null,
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ''),
    storeProductId: raw.storeProductId != null ? Number(raw.storeProductId) : raw.store_product_id != null ? Number(raw.store_product_id) : null,
    store_product_id: raw.store_product_id != null ? Number(raw.store_product_id) : raw.storeProductId != null ? Number(raw.storeProductId) : null,
    platformProductUrl: (raw.platformProductUrl ?? raw.platform_product_url ?? raw.productUrl ?? raw.product_url ?? null) as string | null,
    platform_product_url: (raw.platform_product_url ?? raw.platformProductUrl ?? null) as string | null,
    productUrl: (raw.productUrl ?? raw.product_url ?? null) as string | null,
    product_url: (raw.product_url ?? raw.productUrl ?? null) as string | null,
    storeProductTitle: (raw.storeProductTitle ?? raw.store_product_title ?? null) as string | null,
    store_product_title: (raw.store_product_title ?? raw.storeProductTitle ?? null) as string | null,
    fbeShipmentId: raw.fbeShipmentId != null ? Number(raw.fbeShipmentId) : raw.fbe_shipment_id != null ? Number(raw.fbe_shipment_id) : null,
    fbe_shipment_id: raw.fbe_shipment_id != null ? Number(raw.fbe_shipment_id) : raw.fbeShipmentId != null ? Number(raw.fbeShipmentId) : null,
    fbeShipmentNo: (raw.fbeShipmentNo ?? raw.fbe_shipment_no ?? null) as string | null,
    fbe_shipment_no: (raw.fbe_shipment_no ?? raw.fbeShipmentNo ?? null) as string | null,
  };
}

export function resolveShopId(row: Pick<PurchasingPlanProduct, 'shopId' | 'shop_id'>): number | undefined {
  const raw = row.shopId ?? row.shop_id;
  if (raw == null || Number.isNaN(Number(raw))) return undefined;
  return Number(raw);
}

export function resolveSiteCode(row: Pick<PurchasingPlanProduct, 'region' | 'site'>): string | undefined {
  const code = String(row.region ?? row.site ?? '').trim().toUpperCase();
  return code || undefined;
}

export function resolveStoreProductId(row: PurchasingPlanProduct): number | undefined {
  const raw = row.storeProductId ?? row.store_product_id;
  if (raw == null || Number.isNaN(Number(raw))) return undefined;
  return Number(raw);
}

export function resolvePlatformProductUrl(row: PurchasingPlanProduct): string | null {
  return row.platformProductUrl ?? row.platform_product_url ?? row.productUrl ?? row.product_url ?? null;
}

export function resolveFbeShipmentId(row: PurchasingPlanProduct): number | undefined {
  const raw = row.fbeShipmentId ?? row.fbe_shipment_id;
  if (raw == null || Number.isNaN(Number(raw))) return undefined;
  return Number(raw);
}

export function formatSiteLabel(code?: string | null): string {
  if (!code) return '-';
  const upper = String(code).trim().toUpperCase();
  return REGION_LABEL[upper] ?? upper;
}

export function formatShopSiteLabel(shop?: ShopBrief | null): string {
  if (!shop) return '-';
  const region = shop.region ?? shop.site;
  const siteLabel = formatSiteLabel(region ?? undefined);
  const platform = shop.platform ? ` · ${shop.platform}` : '';
  return `${shop.shopName}${platform ? platform : ''} · ${siteLabel}`;
}

export function toPurchasePlanFbeRows(products: PurchasingPlanProduct[]): PurchasePlanFbeRow[] {
  return products.map((product) => ({
    product,
    storeProductId: resolveStoreProductId(product),
    storeProductTitle: product.storeProductTitle ?? product.store_product_title ?? null,
    platformProductUrl: resolvePlatformProductUrl(product),
    storeProductSku: null,
  }));
}

/** 批量创建 FBE 前置校验；返回 null 表示通过 */
export function getFbeBatchBlockReason(rows: PurchasingPlanProduct[]): string | null {
  if (!Array.isArray(rows) || rows.length === 0) return '请先选择至少一个产品';
  if (rows.some((r) => (r.purchaseQuantity ?? 0) <= 0)) return '所选产品采购数量必须大于 0';
  const shopIds = rows.map((r) => resolveShopId(r));
  if (shopIds.some((id) => id == null)) return '所选产品缺少店铺信息，无法创建 FBE 发货单';
  const firstShopId = shopIds[0];
  if (!shopIds.every((id) => id === firstShopId)) return '所选产品跨店铺/跨站点，请按同一店铺与站点分批创建';
  const sites = rows.map((r) => resolveSiteCode(r)).filter(Boolean) as string[];
  if (sites.length > 0) {
    const firstSite = sites[0];
    if (!sites.every((s) => s === firstSite)) return '所选产品跨店铺/跨站点，请按同一店铺与站点分批创建';
  }
  if (rows.some((r) => resolveFbeShipmentId(r) != null)) return '部分产品已创建 FBE 发货单，请取消勾选后重试';
  return null;
}
