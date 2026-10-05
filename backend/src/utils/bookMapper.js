import { sanitizeImageUrl } from './covers.js';

/** Normalize DB book row (+ optional categories / rating) to API list/detail shape. */
export function mapBook(row, categories = [], rating = null) {
  if (!row) return null;
  const imageUrl = sanitizeImageUrl(row.image_url, row.slug);
  const images = Array.isArray(row.images)
    ? row.images.map((u) => sanitizeImageUrl(u, row.slug))
    : undefined;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    authorName: row.author_name,
    authorId: row.author_id ?? undefined,
    isbn13: row.isbn13 ?? undefined,
    isbn10: row.isbn10 ?? undefined,
    description: row.description ?? undefined,
    imageUrl,
    mrp: Number(row.mrp),
    salePrice: Number(row.sale_price),
    discountPercent: Number(row.discount_percent) || 0,
    language: row.language,
    stock: Number(row.stock) || 0,
    publisher: row.publisher ?? undefined,
    binding: row.binding ?? 'Paper Back',
    publishingDate: row.publishing_date ?? undefined,
    edition: row.edition ?? undefined,
    isFeatured: row.is_featured ?? undefined,
    isBestseller: row.is_bestseller ?? false,
    isActive: row.is_active !== false,
    sku: row.sku || row.isbn13 || `SBH-${row.id}`,
    erpId: row.erp_id || undefined,
    productType: row.product_type || 'book',
    images,
    averageRating: rating?.average ?? (Number(row.average_rating) || 0),
    reviewCount: rating?.total ?? (Number(row.review_count) || 0),
    categories: categories.map((c) =>
      typeof c === 'string' ? c : { id: c.id, name: c.name, slug: c.slug }
    ),
  };
}

export function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
