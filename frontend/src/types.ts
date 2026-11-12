export type Book = {
  id?: number; title?: string; slug?: string; authorName?: string; author_name?: string;
  author?: string | { name?: string }; authorId?: number; isbn13?: string; isbn10?: string; isbn?: string;
  description?: string; imageUrl?: string; image_url?: string; image?: string; images?: string[];
  mrp?: number; salePrice?: number; sale_price?: number; price?: number; discountPercent?: number; discount_percent?: number;
  language?: string; stock?: number; publisher?: string; binding?: string; publishingDate?: string;
  edition?: string; isFeatured?: boolean; isBestseller?: boolean; isActive?: boolean;
  product_type?: string; average_rating?: number; review_count?: number; is_bestseller?: boolean;
  sku?: string; erpId?: string; productType?: string; averageRating?: number; reviewCount?: number;
  categories?: (string | {id?: number;name?: string;slug?: string})[];
};
export type User = { id: string; name: string; email: string; phone?: string; role: 'customer' | 'staff' | 'admin'; createdAt?: string; emailVerified?: boolean };
export type CategoryNode = {
  id?: number;
  slug: string;
  name?: string;
  children?: CategoryNode[];
  [key: string]: any;
};
export type CartItem = Omit<Book, 'id'> & { id: string; bookId?: number; book_id?: number; quantity: number; unitPrice?: number; unit_price?: number; lineTotal?: number; book?: Book };
export type Cart = {
  id: string | null;
  items: CartItem[];
  itemCount: number;
  subtotal: number;
};
export type CategoriesPayload = {
  tree?: CategoryNode[];
  categories?: CategoryNode[];
};
