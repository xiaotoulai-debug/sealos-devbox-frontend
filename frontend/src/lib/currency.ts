/** 根据货币代码返回展示用的后缀（100% 依赖后端返回的 currency 字段） */
export function formatCurrencySuffix(currency: string): string {
  const c = (currency ?? '').trim().toUpperCase();
  if (c === 'EUR') return '€';
  if (c === 'RON') return 'RON';
  if (c === 'HUF') return 'HUF';
  return c || '';
}

/** 格式化价格：数字 + 币种展示 */
export function formatPrice(value: number, currency?: string | null): string {
  const num = Number(value).toFixed(2);
  const c = (currency ?? '').trim().toUpperCase();
  if (!c) return num;
  const suffix = formatCurrencySuffix(c);
  return suffix === '€' ? `${num} €` : `${num} ${suffix}`;
}
