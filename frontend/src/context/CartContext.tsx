import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import api from '../api/client';
import type { Cart, CartItem } from '../types';
import { useAuth } from './AuthContext';

type CartValue = {
  cart: Cart;
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  loading: boolean;
  refresh: () => Promise<void>;
  addItem: (bookId: number, quantity?: number) => Promise<unknown>;
  updateItem: (itemId: number, quantity: number) => Promise<unknown>;
  removeItem: (itemId: number) => Promise<void>;
  clear: () => Promise<void>;
};

const CartContext = createContext<CartValue | null>(null);

function emptyCart(): Cart {
  return { id: null, items: [], itemCount: 0, subtotal: 0 };
}

function normalizeCart(data: Record<string, unknown> | undefined): Cart {
  const cart = ((data?.cart as Record<string, unknown>) || data || {}) as Record<string, unknown>;
  const items = (cart.items || data?.items || []) as CartItem[];
  return {
    id: (cart.id as number) || null,
    items,
    itemCount: items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0),
    subtotal: Number(cart.subtotal ?? data?.subtotal ?? 0),
  };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cart, setCart] = useState<Cart>(emptyCart());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/cart');
      setCart(normalizeCart(data));
    } catch {
      setCart(emptyCart());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, user?.id]);

  const addItem = useCallback(async (bookId: number, quantity = 1) => {
    const { data } = await api.post('/cart/items', { bookId, quantity });
    setCart(normalizeCart(data));
    return data;
  }, []);

  const updateItem = useCallback(async (itemId: number, quantity: number) => {
    const { data } = await api.patch(`/cart/items/${itemId}`, { quantity });
    setCart(normalizeCart(data));
    return data;
  }, []);

  const removeItem = useCallback(async (itemId: number) => {
    const { data } = await api.delete(`/cart/items/${itemId}`);
    setCart(normalizeCart(data));
  }, []);

  const clear = useCallback(async () => {
    try {
      await api.delete('/cart');
    } catch {
      /* ignore */
    }
    setCart(emptyCart());
  }, []);

  const value = useMemo(
    () => ({
      cart,
      items: cart.items,
      itemCount: cart.itemCount,
      subtotal: cart.subtotal,
      loading,
      refresh,
      addItem,
      updateItem,
      removeItem,
      clear,
    }),
    [cart, loading, refresh, addItem, updateItem, removeItem, clear]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
