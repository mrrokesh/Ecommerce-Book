import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useAuth } from './AuthContext';

const CartContext = createContext(null);

function normalizeCart(data) {
  const cart = data?.cart || data || {};
  const items = cart.items || data?.items || [];
  return {
    id: cart.id || null,
    items,
    itemCount: items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0),
    subtotal: Number(cart.subtotal ?? data?.subtotal ?? 0),
  };
}

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [cart, setCart] = useState({ id: null, items: [], itemCount: 0, subtotal: 0 });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/cart');
      setCart(normalizeCart(data));
    } catch {
      setCart({ id: null, items: [], itemCount: 0, subtotal: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, user?.id]);

  const addItem = useCallback(
    async (bookId, quantity = 1) => {
      const { data } = await api.post('/cart/items', { bookId, quantity });
      setCart(normalizeCart(data));
      return data;
    },
    []
  );

  const updateItem = useCallback(async (itemId, quantity) => {
    const { data } = await api.patch(`/cart/items/${itemId}`, { quantity });
    setCart(normalizeCart(data));
    return data;
  }, []);

  const removeItem = useCallback(async (itemId) => {
    const { data } = await api.delete(`/cart/items/${itemId}`);
    setCart(normalizeCart(data));
    return data;
  }, []);

  const clear = useCallback(async () => {
    try {
      await api.delete('/cart');
    } catch {
      /* ignore */
    }
    setCart({ id: null, items: [], itemCount: 0, subtotal: 0 });
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
