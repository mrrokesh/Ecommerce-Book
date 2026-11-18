/** Catalogue product kinds — keep in sync with backend PRODUCT_TYPES. */
export const PRODUCT_TYPES = [
  { value: 'book', label: 'Books' },
  { value: 'stationery', label: 'Stationery' },
  { value: 'toy', label: 'Toys' },
  { value: 'gift-card', label: 'Gift cards' },
] as const;

export type ProductTypeValue = (typeof PRODUCT_TYPES)[number]['value'];

export function productTypeLabel(value?: string | null) {
  const v = String(value || 'book').toLowerCase();
  return PRODUCT_TYPES.find((t) => t.value === v)?.label || 'Books';
}
