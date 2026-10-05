export type Book = Record<string, any>;
export type User = Record<string, any>;
export type CategoryNode = {
  id?: number;
  slug: string;
  name?: string;
  children?: CategoryNode[];
  [key: string]: any;
};
export type CartItem = Record<string, any>;
export type Cart = {
  id: number | null;
  items: CartItem[];
  itemCount: number;
  subtotal: number;
};
export type CategoriesPayload = {
  tree?: CategoryNode[];
  categories?: CategoryNode[];
};
